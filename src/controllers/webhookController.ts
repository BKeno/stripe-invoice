import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { handlePaymentSuccess, handleRefund } from '../services/webhookService.js';
import { handleMockPaymentSuccess } from '../services/mockWebhookService.js';

const MOCK_MODE = process.env.MOCK_WEBHOOK_HANDLER === 'true';

export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const event = req.stripeEvent as Stripe.Event;

  switch (event.type) {
    case 'payment_intent.succeeded':
      if (MOCK_MODE) {
        await handleMockPaymentSuccess(event.data.object as Stripe.PaymentIntent);
      } else {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSuccess(paymentIntent.id);
      }
      break;

    case 'charge.refunded':
      const charge = event.data.object as Stripe.Charge;
      if (charge.refunds?.data[0]) {
        await handleRefund(charge.refunds.data[0]);
      }
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
  // Express 5 automatically catches async errors
};
