import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import { mapStripeAddress } from '../utils/addressMapper.js';
import { generateInvoice, generateRefundInvoice } from './szamlazz/index.js';
import { appendRowToSheet, updateInvoiceStatus, checkRowExists } from './sheetsService.js';
import type { InvoiceData, InvoiceLineItem, StripeCustomField } from '../types/index.js';

const getVATRate = (productMetadata: Record<string, string>): number => {
  const vatRate = productMetadata.vat_rate;

  if (vatRate) {
    return parseInt(vatRate, 10);
  }

  // Default fallback - should be configured per product
  console.warn('No VAT rate configured in product metadata, using default 27%');
  return 27;
};

export const handlePaymentSuccess = async (
  paymentIntent: Stripe.PaymentIntent
): Promise<void> => {
  console.log(`Processing payment: ${paymentIntent.id}`);

  // SECURITY LAYER 1: Fetch FRESH payment intent to check current metadata
  // (webhook payload may contain stale data from when the event was created)
  const freshPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);

  if (freshPaymentIntent.metadata.invoice_number) {
    console.log(`[IDEMPOTENCY] Invoice already exists: ${freshPaymentIntent.metadata.invoice_number}`);
    return;
  }

  // Fetch full payment link session to get product details
  const session = await stripe.checkout.sessions.list({
    payment_intent: paymentIntent.id,
    limit: 1
  });

  if (session.data.length === 0) {
    throw new Error('No checkout session found for payment intent');
  }

  const checkoutSession = session.data[0];

  // Get line items to extract product info
  const lineItems = await stripe.checkout.sessions.listLineItems(checkoutSession.id);

  if (lineItems.data.length === 0) {
    throw new Error('No line items found in checkout session');
  }

  // Map billing address
  const customFields = checkoutSession.custom_fields as StripeCustomField[] ?? [];
  const customerName = checkoutSession.customer_details?.name ?? '';
  const customerEmail = checkoutSession.customer_details?.email ?? '';

  const billingAddress = mapStripeAddress(customFields, customerName, customerEmail);

  // Process all line items
  const invoiceLineItems: InvoiceLineItem[] = [];
  let firstSheetName = 'Sheet1';

  for (const lineItem of lineItems.data) {
    const productId = lineItem.price?.product as string;
    const quantity = lineItem.quantity ?? 1;
    const unitPrice = (lineItem.amount_total ?? 0) / 100 / quantity;
    const amount = (lineItem.amount_total ?? 0) / 100;

    // Fetch product to get name and metadata
    const product = await stripe.products.retrieve(productId);

    // Get VAT rate
    const vatRate = getVATRate(product.metadata);

    // Store first product's sheet name for the overall payment
    if (invoiceLineItems.length === 0) {
      firstSheetName = product.metadata.sheet_name || 'Sheet1';
    }

    invoiceLineItems.push({
      productName: product.name,
      productId,
      quantity,
      unitPrice,
      amount,
      vatRate
    });
  }

  // Prepare invoice data
  const invoiceData: InvoiceData = {
    customerName,
    customerEmail,
    totalAmount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    lineItems: invoiceLineItems,
    billingAddress,
    stripePaymentId: paymentIntent.id
  };

  // Add rows to Google Sheets first with pending status
  const sheetsEnabled = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SERVICE_ACCOUNT_JSON !== '{"type":"service_account","project_id":"..."}';

  if (sheetsEnabled) {
    // SECURITY LAYER 2: Check if row already exists in Sheet
    const rowExists = await checkRowExists(paymentIntent.id, firstSheetName);
    if (rowExists) {
      console.log(`[IDEMPOTENCY] Row already exists in sheet for payment: ${paymentIntent.id}`);
      return;
    }

    // Create a row for each line item
    for (const item of invoiceLineItems) {
      await appendRowToSheet({
        date: new Date().toISOString().split('T')[0],
        customerName,
        email: customerEmail,
        amount: item.amount.toString(),
        productName: item.productName,
        quantity: item.quantity,
        vatRate: `${item.vatRate}%`,
        address: `${billingAddress.postalCode} ${billingAddress.city}, ${billingAddress.address}`,
        invoiceNumber: '',
        invoiceStatus: 'Függőben',
        stripePaymentId: paymentIntent.id
      }, firstSheetName);
    }
  } else {
    console.log('[SKIP] Google Sheets not configured, skipping sheet sync');
  }

  // Generate invoice
  try {
    const invoiceNumber = await generateInvoice(invoiceData);

    // Update all sheet rows with invoice number and status
    if (sheetsEnabled) {
      await updateInvoiceStatus(paymentIntent.id, invoiceNumber, 'Kiállítva', firstSheetName);
    }

    // SECURITY LAYER 3: Store invoice number in Stripe metadata for idempotency
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        invoice_number: invoiceNumber
      }
    });

    console.log(`Invoice generated: ${invoiceNumber} for payment ${paymentIntent.id}`);
  } catch (err) {
    console.error('Failed to generate invoice:', err);
    if (sheetsEnabled) {
      await updateInvoiceStatus(paymentIntent.id, '', 'Hiba', firstSheetName);
    }
    throw err;
  }
};

export const handleRefund = async (refund: Stripe.Refund): Promise<void> => {
  console.log(`Processing refund: ${refund.id}`);

  const paymentIntentId = refund.payment_intent as string;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  // IDEMPOTENCY: Check if refund already processed
  if (paymentIntent.metadata.refund_invoice_number) {
    console.log(`[IDEMPOTENCY] Refund invoice already exists: ${paymentIntent.metadata.refund_invoice_number}`);
    return;
  }

  // Get original invoice number from metadata
  const originalInvoiceNumber = paymentIntent.metadata.invoice_number;

  if (!originalInvoiceNumber) {
    throw new Error('Original invoice number not found in payment intent metadata');
  }

  // Fetch original payment data
  const session = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1
  });

  if (session.data.length === 0) {
    throw new Error('No checkout session found for refund');
  }

  const checkoutSession = session.data[0];
  const lineItems = await stripe.checkout.sessions.listLineItems(checkoutSession.id);

  const customFields = checkoutSession.custom_fields as StripeCustomField[] ?? [];
  const customerName = checkoutSession.customer_details?.name ?? '';
  const customerEmail = checkoutSession.customer_details?.email ?? '';

  const billingAddress = mapStripeAddress(customFields, customerName, customerEmail);

  // Process all line items
  const invoiceLineItems: InvoiceLineItem[] = [];
  let firstSheetName = 'Sheet1';

  for (const lineItem of lineItems.data) {
    const productId = lineItem.price?.product as string;
    const quantity = lineItem.quantity ?? 1;
    const unitPrice = (lineItem.amount_total ?? 0) / 100 / quantity;
    const amount = (lineItem.amount_total ?? 0) / 100;

    const product = await stripe.products.retrieve(productId);
    const vatRate = getVATRate(product.metadata);

    if (invoiceLineItems.length === 0) {
      firstSheetName = product.metadata.sheet_name || 'Sheet1';
    }

    invoiceLineItems.push({
      productName: product.name,
      productId,
      quantity,
      unitPrice,
      amount,
      vatRate
    });
  }

  const invoiceData: InvoiceData = {
    customerName,
    customerEmail,
    totalAmount: refund.amount / 100,
    currency: refund.currency,
    lineItems: invoiceLineItems,
    billingAddress,
    stripePaymentId: paymentIntentId
  };

  // Generate refund invoice (storno)
  try {
    const refundInvoiceNumber = await generateRefundInvoice(originalInvoiceNumber, invoiceData);

    // Update sheet status to canceled
    const sheetsEnabled = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SERVICE_ACCOUNT_JSON !== '{"type":"service_account","project_id":"..."}';

    if (sheetsEnabled) {
      await updateInvoiceStatus(paymentIntentId, refundInvoiceNumber, 'Sztornózva', firstSheetName);
    }

    // Store refund invoice number in metadata for idempotency
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        refund_invoice_number: refundInvoiceNumber
      }
    });

    console.log(`Refund invoice generated: ${refundInvoiceNumber} for payment ${paymentIntentId}`);
  } catch (err) {
    console.error('Failed to generate refund invoice:', err);
    throw err;
  }
};
