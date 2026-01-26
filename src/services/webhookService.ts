import type Stripe from "stripe";
import { stripe } from "../config/stripe.js";
import { mapStripeAddress } from "../utils/addressMapper.js";
import { generateInvoice, generateRefundInvoice } from "./szamlazz/index.js";
import {
  appendRowToSheet,
  updateInvoiceStatus,
  checkRowExists,
  checkHasInvoice,
} from "./sheetsService.js";
import type {
  InvoiceData,
  InvoiceLineItem,
  StripeCustomField,
} from "../types/index.js";

const getVATRate = (productMetadata: Record<string, string>): number => {
  const vatRate = productMetadata.vat_rate;

  if (vatRate) {
    return parseInt(vatRate, 10);
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

    if (serviceFeePercentage) {
      // Product price includes service fee - split into base product + fee for INVOICE
      const feeRate = parseFloat(serviceFeePercentage) / 100;
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

  // Add rows to Google Sheets first with pending status
  const sheetsEnabled =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON !==
      '{"type":"service_account","project_id":"..."}';

  if (sheetsEnabled) {
    // SECURITY LAYER 2: Check if row already exists in Sheet
    const rowExists = await checkRowExists(paymentIntentId, firstSheetName);

    if (rowExists) {
      // Row exists - check if it has invoice number
      const hasInvoice = await checkHasInvoice(paymentIntentId, firstSheetName);

      if (hasInvoice) {
        console.log(
          `[IDEMPOTENCY] Row already exists with invoice number for payment: ${paymentIntentId}`
        );
        return;
      }

      // Row exists but no invoice (error recovery scenario) - skip row creation, continue to invoice generation
      console.log(`[RETRY] Row exists without invoice, retrying invoice generation: ${paymentIntentId}`);
    } else {
      // No row exists - create rows
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
            invoiceNumber: "",
            invoiceStatus: "Függőben",
            stripePaymentId: paymentIntentId,
          },
          firstSheetName
        );
      }
      console.log(`[Sheet] ${sheetLineItems.length} row(s) created with status: Függőben`);
    }
  } else {
    console.log("[SKIP] Google Sheets not configured");
  }

  // Generate invoice
  try {
    const invoiceNumber = await generateInvoice(invoiceData);

    // Update all sheet rows with invoice number and status
    if (sheetsEnabled) {
      await updateInvoiceStatus(
        paymentIntentId,
        invoiceNumber,
        "Kiállítva",
        firstSheetName
      );
      console.log(`[Sheet] Updated status: Kiállítva`);
    }

    // SECURITY LAYER 3: Store invoice number in Stripe metadata for idempotency
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        invoice_number: invoiceNumber,
      },
    });

    console.log(`✓ Complete: ${invoiceNumber} | ${paymentIntentId}`);
  } catch (err) {
    console.error("Failed to generate invoice:", err);
    if (sheetsEnabled) {
      await updateInvoiceStatus(paymentIntentId, "", "Hiba", firstSheetName);
    }
    throw err;
  }
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
  try {
    const refundInvoiceNumber = await generateRefundInvoice(
      originalInvoiceNumber,
      invoiceData
    );

    // Update sheet status to canceled
    const sheetsEnabled =
      !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON !==
        '{"type":"service_account","project_id":"..."}';

    if (sheetsEnabled) {
      await updateInvoiceStatus(
        paymentIntentId,
        refundInvoiceNumber,
        "Sztornózva",
        firstSheetName
      );
      console.log(`[Sheet] Updated status: Sztornózva`);
    }

    // Store refund invoice number in metadata for idempotency
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        refund_invoice_number: refundInvoiceNumber,
      },
    });

    console.log(`✓ Storno complete: ${refundInvoiceNumber} (cancelled ${originalInvoiceNumber}) | ${paymentIntentId}`);
  } catch (err) {
    console.error("Failed to generate refund invoice:", err);
    throw err;
  }
};
