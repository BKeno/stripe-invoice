#!/usr/bin/env tsx
/**
 * Export payments with invoice status for audit
 *
 * Usage (with Railway CLI):
 *   railway link (select staging or production project)
 *   railway run npm run audit-payments 2026-01-01
 *   railway run npm run audit-payments 2026-01-01 2026-01-31  (date range)
 */

import { writeFileSync } from 'fs';
import { stripe } from '../src/config/stripe.js';

const exportPayments = async (startDate: string, endDate?: string) => {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

  console.log(`Fetching payments from ${startDate} to ${endDate || 'now'}...\n`);

  const payments = await stripe.paymentIntents.list({
    limit: 100,
    created: {
      gte: startTimestamp,
      lte: endTimestamp,
    },
  });

  const results: any[] = [];

  for (const payment of payments.data) {
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
    const customerName = session.customer_details?.name || 'N/A';
    const customerEmail = session.customer_details?.email || 'N/A';
    const hasInvoice = payment.metadata.invoice_number ? 'YES' : 'NO';
    const invoiceNumber = payment.metadata.invoice_number || '';

    results.push({
      payment_id: payment.id,
      amount: (payment.amount / 100).toFixed(2),
      currency: payment.currency.toUpperCase(),
      date: new Date(payment.created * 1000).toISOString().split('T')[0],
      customer_name: customerName,
      customer_email: customerEmail,
      has_invoice: hasInvoice,
      invoice_number: invoiceNumber,
    });
  }

  console.log(`Found ${results.length} invoice-enabled payments\n`);

  // Generate CSV
  const csv = [
    'Payment ID,Amount,Currency,Date,Customer Name,Customer Email,Has Invoice,Invoice Number',
    ...results.map(r =>
      `${r.payment_id},${r.amount},${r.currency},${r.date},"${r.customer_name}","${r.customer_email}",${r.has_invoice},"${r.invoice_number}"`
    )
  ].join('\n');

  // Save to file
  const filename = `payments-audit-${startDate}-${endDate || 'now'}.csv`;
  writeFileSync(filename, csv);

  console.log(`✓ Exported to: ${filename}\n`);

  // Summary
  const missingInvoices = results.filter(r => r.has_invoice === 'NO');
  console.log(`Summary:`);
  console.log(`  Total payments: ${results.length}`);
  console.log(`  With invoice: ${results.length - missingInvoices.length}`);
  console.log(`  Missing invoice: ${missingInvoices.length}`);

  if (missingInvoices.length > 0) {
    console.log(`\nPayments missing invoice:`);
    missingInvoices.forEach(p => console.log(`  - ${p.payment_id} (${p.date}) - ${p.customer_name}`));
  }
};

// Get dates from command line
const startDate = process.argv[2];
const endDate = process.argv[3];

if (!startDate) {
  console.error('Usage: npm run audit-payments:staging <start-date> [end-date]');
  console.error('Example: npm run audit-payments:staging 2026-01-01');
  console.error('Example: npm run audit-payments:staging 2026-01-01 2026-01-31');
  process.exit(1);
}

exportPayments(startDate, endDate).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
