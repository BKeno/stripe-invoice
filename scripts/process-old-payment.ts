#!/usr/bin/env tsx
/**
 * Process old payments that occurred before webhook was configured
 *
 * Usage:
 *   npm run process-payment pi_1234567890
 *   npm run process-payment pi_xxx pi_yyy pi_zzz  (multiple payments)
 */

import dotenv from 'dotenv';
import { handlePaymentSuccess } from '../src/services/webhookService.js';

dotenv.config();

const processPayments = async (paymentIntentIds: string[]) => {
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

// Get PaymentIntent IDs from command line
const paymentIntentIds = process.argv.slice(2);

if (paymentIntentIds.length === 0) {
  console.error('Usage: npm run process-payment <paymentIntentId> [<paymentIntentId2> ...]');
  console.error('Example: npm run process-payment pi_1234567890');
  process.exit(1);
}

processPayments(paymentIntentIds).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
