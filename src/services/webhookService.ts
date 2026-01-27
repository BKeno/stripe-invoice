import type Stripe from "stripe";
import { stripe } from "../config/stripe.js";
import { mapStripeAddress } from "../utils/addressMapper.js";
import { generateInvoice, generateRefundInvoice } from "./szamlazz/index.js";
import {
  appendRowToSheet,
  updateInvoiceStatus,
  isSheetsEnabled,
} from "./sheetsService.js";
import type {
  InvoiceData,
  InvoiceLineItem,
  StripeCustomField,
} from "../types/index.js";

const getVATRate = (productMetadata: Record<string, string>): number => {
  const vatRate = productMetadata.vat_rate;

  if (vatRate) {
    const parsed = parseInt(vatRate, 10);
    if (isNaN(parsed)) {
      console.warn(`Invalid VAT rate "${vatRate}" in product metadata, using default 27%`);
      return 27;
    }
    return parsed;
  }

  // Default fallback - should be configured per product
  console.warn("No VAT rate configured in product metadata, using default 27%");
  return 27;
};

export const handlePaymentSuccess = async (
  paymentIntentId: string
): Promise<void> => {
  console.log(`Processing payment: ${paymentIntentId}`);

  // SECURITY LAYER 1: Fetch FRESH payment intent to check current metadata
  // (webhook payload may contain stale data from when the event was created)
  const freshPaymentIntent = await stripe.paymentIntents.retrieve(
    paymentIntentId
  );

  if (freshPaymentIntent.metadata.invoice_number) {
    console.log(
      `[IDEMPOTENCY] Invoice already exists: ${freshPaymentIntent.metadata.invoice_number}`
    );
    return;
  }

  // Fetch full payment link session to get product details
  const session = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });

  if (session.data.length === 0) {
    console.log('[SKIP] No checkout session found - likely SevenRooms or other integration');
    return;
  }

  const checkoutSession = session.data[0];

  // Get line items to extract product info
  const lineItems = await stripe.checkout.sessions.listLineItems(
    checkoutSession.id
  );

  if (lineItems.data.length === 0) {
    throw new Error("No line items found in checkout session");
  }

  // Map billing address
  const customFields =
    (checkoutSession.custom_fields as StripeCustomField[]) ?? [];
  const customerName = checkoutSession.customer_details?.name ?? "";
  const customerEmail = checkoutSession.customer_details?.email ?? "";

  // SKIP payments without irányítószám (irnytszm) - not from invoice-enabled payment links
  const hasIrnytszmField = customFields.some(
    (field) => field.key === "irnytszm"
  );
  if (!hasIrnytszmField) {
    console.log(
      `[SKIP] custom field check failed - payment not from invoice-enabled payment link (likely SevenRooms or other integration)`
    );
    return;
  }

  const billingAddress = mapStripeAddress(
    customFields,
    customerName,
    customerEmail
  );

  // Process all line items
  const invoiceLineItems: InvoiceLineItem[] = [];
  const sheetLineItems: Array<{ productName: string; quantity: number; amount: number; vatRate: number }> = [];
  let firstSheetName = "Sheet1";

  for (const lineItem of lineItems.data) {
    const productId = lineItem.price?.product as string;
    const quantity = lineItem.quantity ?? 1;
    const totalAmount = (lineItem.amount_total ?? 0) / 100;

    // Fetch product to get name and metadata
    const product = await stripe.products.retrieve(productId);

    // Get VAT rate
    const vatRate = getVATRate(product.metadata);

    // Store first product's sheet name for the overall payment
    if (invoiceLineItems.length === 0) {
      firstSheetName = product.metadata.sheet_name || "Sheet1";
    }

    // Check for service fee
    const serviceFeePercentage = product.metadata.service_fee_percentage;
    const feeRate = serviceFeePercentage ? parseFloat(serviceFeePercentage) / 100 : NaN;

    if (serviceFeePercentage && !isNaN(feeRate)) {
      // Product price includes service fee - split into base product + fee for INVOICE
      const feeMultiplier = 1 + feeRate;

      const baseAmount = totalAmount / feeMultiplier;
      const feeAmount = totalAmount - baseAmount;

      // 1. Base product (without service fee) - for invoice
      invoiceLineItems.push({
        productName: product.name,
        productId,
        quantity,
        unitPrice: baseAmount / quantity,
        amount: baseAmount,
        vatRate,
      });

      // 2. Service fee line item (same VAT rate as product) - for invoice
      invoiceLineItems.push({
        productName: `Szervizdíj ${vatRate}% ÁFA`,
        productId: `${productId}_service_fee`,
        quantity: 1,
        unitPrice: feeAmount,
        amount: feeAmount,
        vatRate,
      });

      // For SHEET: full amount (base + fee combined)
      sheetLineItems.push({
        productName: product.name,
        quantity,
        amount: totalAmount, // Full amount including service fee
        vatRate,
      });
    } else {
      if (serviceFeePercentage && isNaN(feeRate)) {
        console.warn(`Invalid service_fee_percentage "${serviceFeePercentage}" for product ${product.name}, ignoring`);
      }
      // No service fee - normal line item for both invoice and sheet
      invoiceLineItems.push({
        productName: product.name,
        productId,
        quantity,
        unitPrice: totalAmount / quantity,
        amount: totalAmount,
        vatRate,
      });

      sheetLineItems.push({
        productName: product.name,
        quantity,
        amount: totalAmount,
        vatRate,
      });
    }
  }

  // Prepare invoice data
  const invoiceData: InvoiceData = {
    customerName,
    customerEmail,
    totalAmount: freshPaymentIntent.amount / 100,
    currency: freshPaymentIntent.currency,
    lineItems: invoiceLineItems,
    billingAddress,
    stripePaymentId: paymentIntentId,
    paymentDate: new Date(freshPaymentIntent.created * 1000),
  };

  // Generate invoice
  const invoiceNumber = await generateInvoice(invoiceData);

  // SECURITY LAYER 2: Store invoice number in Stripe metadata IMMEDIATELY
  // This is the critical idempotency marker - must happen before anything else
  await stripe.paymentIntents.update(paymentIntentId, {
    metadata: {
      invoice_number: invoiceNumber,
    },
  });

  console.log(`[Számlázz.hu] Invoice created: ${invoiceNumber}`);

  // Append rows to Google Sheets (best effort - invoice already exists and is tracked in Stripe)
  const sheetsEnabled = isSheetsEnabled();

  if (sheetsEnabled) {
    try {
      for (const item of sheetLineItems) {
        await appendRowToSheet(
          {
            date: new Date(freshPaymentIntent.created * 1000).toISOString().split("T")[0],
            customerName,
            email: customerEmail,
            amount: item.amount.toString(),
            productName: item.productName,
            quantity: item.quantity,
            vatRate: `${item.vatRate}%`,
            address: `${billingAddress.postalCode} ${billingAddress.city}, ${billingAddress.address}`,
            invoiceNumber,
            invoiceStatus: "Kiállítva",
            stripePaymentId: paymentIntentId,
          },
          firstSheetName
        );
      }
      console.log(`[Sheet] ${sheetLineItems.length} row(s) added`);
    } catch (sheetErr) {
      // Sheet write failed, but invoice exists and Stripe has the record
      // Log error but don't fail the webhook - can be reconciled later
      console.error(`[Sheet] Failed to write rows (invoice ${invoiceNumber} exists):`, sheetErr);
    }
  }

  console.log(`✓ Complete: ${invoiceNumber} | ${paymentIntentId}`);
};

export const handleRefund = async (refund: Stripe.Refund): Promise<void> => {
  console.log(`Processing refund: ${refund.id}`);

  const paymentIntentId = refund.payment_intent as string;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  // SKIP refunds for payments that never had an invoice (non-invoice-enabled payment links)
  const originalInvoiceNumber = paymentIntent.metadata.invoice_number;
  if (!originalInvoiceNumber) {
    console.log(
      `[SKIP] No original invoice found - payment was not from invoice-enabled payment link`
    );
    return;
  }

  // IDEMPOTENCY: Check if refund already processed
  if (paymentIntent.metadata.refund_invoice_number) {
    console.log(
      `[IDEMPOTENCY] Refund invoice already exists: ${paymentIntent.metadata.refund_invoice_number}`
    );
    return;
  }

  // Fetch original payment data
  const session = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });

  if (session.data.length === 0) {
    throw new Error("No checkout session found for refund");
  }

  const checkoutSession = session.data[0];
  const lineItems = await stripe.checkout.sessions.listLineItems(
    checkoutSession.id
  );

  const customFields =
    (checkoutSession.custom_fields as StripeCustomField[]) ?? [];
  const customerName = checkoutSession.customer_details?.name ?? "";
  const customerEmail = checkoutSession.customer_details?.email ?? "";

  const billingAddress = mapStripeAddress(
    customFields,
    customerName,
    customerEmail
  );

  // Process all line items
  const invoiceLineItems: InvoiceLineItem[] = [];
  let firstSheetName = "Sheet1";

  for (const lineItem of lineItems.data) {
    const productId = lineItem.price?.product as string;
    const quantity = lineItem.quantity ?? 1;
    const unitPrice = (lineItem.amount_total ?? 0) / 100 / quantity;
    const amount = (lineItem.amount_total ?? 0) / 100;

    const product = await stripe.products.retrieve(productId);
    const vatRate = getVATRate(product.metadata);

    if (invoiceLineItems.length === 0) {
      firstSheetName = product.metadata.sheet_name || "Sheet1";
    }

    invoiceLineItems.push({
      productName: product.name,
      productId,
      quantity,
      unitPrice,
      amount,
      vatRate,
    });
  }

  const invoiceData: InvoiceData = {
    customerName,
    customerEmail,
    totalAmount: refund.amount / 100,
    currency: refund.currency,
    lineItems: invoiceLineItems,
    billingAddress,
    stripePaymentId: paymentIntentId,
    paymentDate: new Date(paymentIntent.created * 1000), // Original payment date for storno
  };

  // Generate refund invoice (storno)
  const refundInvoiceNumber = await generateRefundInvoice(
    originalInvoiceNumber,
    invoiceData
  );

  // Store refund invoice number in Stripe metadata IMMEDIATELY (idempotency)
  await stripe.paymentIntents.update(paymentIntentId, {
    metadata: {
      refund_invoice_number: refundInvoiceNumber,
    },
  });

  console.log(`[Számlázz.hu] Storno created: ${refundInvoiceNumber}`);

  // Update sheet status (best effort - storno already exists and is tracked in Stripe)
  const sheetsEnabled = isSheetsEnabled();

  if (sheetsEnabled) {
    try {
      await updateInvoiceStatus(
        paymentIntentId,
        refundInvoiceNumber,
        "Sztornózva",
        firstSheetName
      );
      console.log(`[Sheet] Updated status: Sztornózva`);
    } catch (sheetErr) {
      // Sheet update failed, but storno exists and Stripe has the record
      console.error(`[Sheet] Failed to update status (storno ${refundInvoiceNumber} exists):`, sheetErr);
    }
  }

  console.log(`✓ Storno complete: ${refundInvoiceNumber} (cancelled ${originalInvoiceNumber}) | ${paymentIntentId}`);
};
