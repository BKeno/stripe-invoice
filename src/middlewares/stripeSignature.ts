import type { Request, Response, NextFunction } from 'express';
import { stripe, WEBHOOK_SECRET } from '../config/stripe.js';
import { UnauthorizedError } from '../utils/errors.js';

export const verifyStripeSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    throw new UnauthorizedError('Missing stripe-signature header');
  }

  if (!WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature as string,
      WEBHOOK_SECRET
    );

    // Attach verified event to request
    req.stripeEvent = event;
    next();
  } catch (err) {
    const error = err as Error;
    throw new UnauthorizedError(`Webhook signature verification failed: ${error.message}`);
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      stripeEvent?: any;
    }
  }
}
