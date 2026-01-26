#!/usr/bin/env tsx
/**
 * Process old payments that occurred before webhook was configured
 *
 * Usage (with Railway CLI):
 *   railway link (select staging or production project)
 *   railway run npm run process-payment pi_1234567890
 *   railway run npm run process-payment pi_xxx pi_yyy pi_zzz  (multiple)
 */

import { handlePaymentSuccess } from '../src/services/webhookService.js';

const main = async () => {

  const paymentIntentIds = process.argv.slice(2);

  if (paymentIntentIds.length === 0) {
    console.error('Usage: npm run process-payment <paymentIntentId> [<paymentIntentId2> ...]');
    console.error('Example: npm run process-payment pi_1234567890');
    process.exit(1);
  }

  console.log(`Processing ${paymentIntentIds.length} payment(s)...\n`);

  for (const paymentIntentId of paymentIntentIds) {
    try {
      console.log(`[${paymentIntentId}] Starting...`);
      await handlePaymentSuccess(paymentIntentId);
      console.log(`[${paymentIntentId}] ✅ Success\n`);
    } catch (err) {
      const error = err as Error;
      console.error(`[${paymentIntentId}] ❌ Error: ${error.message}\n`);
    }
  }

  console.log('Done!');
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
