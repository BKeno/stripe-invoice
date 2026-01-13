import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-12-18.acacia'
});

const testPaymentWebhook = async () => {
  // Create a test payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 15000,
    currency: 'huf',
    payment_method_types: ['card'],
    metadata: {
      test: 'true'
    }
  });

  console.log('Test Payment Intent created:', paymentIntent.id);
  console.log('Test with: stripe trigger payment_intent.succeeded');
};

const testRefundWebhook = async () => {
  // You need an existing payment intent ID
  const paymentIntentId = 'pi_xxx'; // Replace with actual test payment intent

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId
  });

  console.log('Test Refund created:', refund.id);
};

// Run test
testPaymentWebhook();
