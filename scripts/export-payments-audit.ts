#!/usr/bin/env tsx
/**
 * Export Stripe payments with invoice status for audit
 *
 * PURPOSE:
 *   Identify payments that may be missing invoices (e.g., webhook failures,
 *   payments before integration was set up). Exports data to XLSX for review.
 *
 * USAGE:
 *   railway link                  # Select staging or production project
 *   railway run npm run audit-payments <start-date> [end-date]
 *
 * EXAMPLES:
 *   railway run npm run audit-payments 2026-01-01              # From date to now
 *   railway run npm run audit-payments 2026-01-01 2026-01-31   # Date range
 *
 * OUTPUT:
 *   1. XLSX file: payments-audit-<start>-<end>.xlsx
 *      Columns: Payment ID, Amount, Currency, Date, Customer Name, Email,
 *               Phone, Products, Has Invoice, Invoice Number
 *
 *   2. Console summary:
 *      - Total successful payments found (excludes refunds)
 *      - Count with/without invoices
 *      - List of payment IDs missing invoices (for manual processing)
 *
 * FILTERS:
 *   - Only payments with status "succeeded" (excludes refunds, failed, etc.)
 *   - Only payments with checkout sessions (skips SevenRooms, etc.)
 *
 * NOTES:
 *   - Limited to 100 payments per run (Stripe API default)
 *   - Use payment IDs from output with: railway run npm run process-payment <id>
 */

import ExcelJS from 'exceljs';
import { stripe } from '../src/config/stripe.js';

interface PaymentRow {
  paymentId: string;
  amount: string;
  currency: string;
  date: string;
  customerName: string;
  email: string;
  phone: string;
  products: string;
  hasInvoice: string;
  invoiceNumber: string;
}

const exportPayments = async (startDate: string, endDate?: string) => {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = endDate
    ? Math.floor(new Date(endDate).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  console.log(`Fetching payments from ${startDate} to ${endDate || 'now'}...\n`);

  // Only fetch succeeded payments
  const payments = await stripe.paymentIntents.list({
    limit: 100,
    created: {
      gte: startTimestamp,
      lte: endTimestamp,
    },
  });

  const results: PaymentRow[] = [];

  for (const payment of payments.data) {
    // Filter: only succeeded payments (skip canceled, requires_payment_method, etc.)
    if (payment.status !== 'succeeded') {
      continue;
    }

    // Check if payment has checkout session (invoice-enabled payment link)
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: payment.id,
      limit: 1,
    });

    if (sessions.data.length === 0) {
      // Skip - no checkout session (SevenRooms or other integration)
      continue;
    }

    const session = sessions.data[0];

    // Fetch line items to get product names
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const products = lineItems.data
      .map(item => `${item.description || item.price?.product} (x${item.quantity})`)
      .join(', ');

    const customerName = session.customer_details?.name || 'N/A';
    const customerEmail = session.customer_details?.email || 'N/A';
    const customerPhone = session.customer_details?.phone || 'N/A';
    const hasInvoice = payment.metadata.invoice_number ? 'YES' : 'NO';
    const invoiceNumber = payment.metadata.invoice_number || '';

    results.push({
      paymentId: payment.id,
      amount: (payment.amount / 100).toFixed(2),
      currency: payment.currency.toUpperCase(),
      date: new Date(payment.created * 1000).toISOString().split('T')[0],
      customerName,
      email: customerEmail,
      phone: customerPhone,
      products,
      hasInvoice,
      invoiceNumber,
    });
  }

  console.log(`Found ${results.length} successful invoice-enabled payments\n`);

  // Generate XLSX
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Payments Audit');

  // Define columns
  worksheet.columns = [
    { header: 'Payment ID', key: 'paymentId', width: 32 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Customer Name', key: 'customerName', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Products', key: 'products', width: 40 },
    { header: 'Has Invoice', key: 'hasInvoice', width: 12 },
    { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add data rows
  results.forEach(row => {
    worksheet.addRow(row);
  });

  // Highlight rows missing invoice
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const hasInvoiceCell = row.getCell('hasInvoice');
      if (hasInvoiceCell.value === 'NO') {
        row.eachCell(cell => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFCCCC' },
          };
        });
      }
    }
  });

  // Save to file
  const filename = `payments-audit-${startDate}-${endDate || 'now'}.xlsx`;
  await workbook.xlsx.writeFile(filename);

  console.log(`✓ Exported to: ${filename}\n`);

  // Summary
  const missingInvoices = results.filter(r => r.hasInvoice === 'NO');
  console.log(`Summary:`);
  console.log(`  Total payments: ${results.length}`);
  console.log(`  With invoice: ${results.length - missingInvoices.length}`);
  console.log(`  Missing invoice: ${missingInvoices.length}`);

  if (missingInvoices.length > 0) {
    console.log(`\nPayments missing invoice:`);
    missingInvoices.forEach(p =>
      console.log(`  - ${p.paymentId} (${p.date}) - ${p.customerName}`)
    );
  }
};

// Get dates from command line
const startDate = process.argv[2];
const endDate = process.argv[3];

if (!startDate) {
  console.error('Usage: railway run npm run audit-payments <start-date> [end-date]');
  console.error('Example: railway run npm run audit-payments 2026-01-01');
  console.error('Example: railway run npm run audit-payments 2026-01-01 2026-01-31');
  process.exit(1);
}

exportPayments(startDate, endDate).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
