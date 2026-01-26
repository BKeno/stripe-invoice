import type { Request, Response } from 'express';
import { handlePaymentSuccess } from '../services/webhookService.js';

/**
 * Admin endpoint: Process a payment manually (for old payments before webhook was set up)
 *
 * POST /admin/process-payment/:paymentIntentId
 *
 * Returns:
 *   200: { success: true, invoiceNumber: "ABC-123" }
 *   200: { success: false, message: "Already processed" }
 *   500: Error handled by Express 5 error handler
 */
export const processPayment = async (req: Request, res: Response): Promise<void> => {
  const paymentIntentId = req.params.paymentIntentId as string;

  console.log(`[ADMIN] Manual processing requested for payment: ${paymentIntentId}`);

  await handlePaymentSuccess(paymentIntentId);

  res.json({
    success: true,
    message: `Payment ${paymentIntentId} processed successfully`,
  });
};
