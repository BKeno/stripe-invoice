import type Stripe from 'stripe';
import type { InvoiceData } from '../types/index.js';

// Mock service for testing without real Paylink/Checkout sessions
export const handleMockPaymentSuccess = async (
  paymentIntent: Stripe.PaymentIntent
): Promise<void> => {
  console.log(`[MOCK] Processing payment: ${paymentIntent.id}`);

  // Mock invoice data for testing
  const mockInvoiceData: InvoiceData = {
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    totalAmount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    lineItems: [
      {
        productName: 'Test Event Ticket',
        productId: 'prod_mock_123',
        quantity: 2,
        unitPrice: (paymentIntent.amount / 100) / 2,
        amount: paymentIntent.amount / 100,
        vatRate: 27,
        vatType: 'AAM'
      }
    ],
    billingAddress: {
      name: 'Test Customer',
      email: 'test@example.com',
      postalCode: '1026',
      city: 'Budapest',
      address: 'Pasaréti út 57',
      country: 'HU'
    },
    stripePaymentId: paymentIntent.id
  };

  console.log('[MOCK] Would generate invoice with data:', mockInvoiceData);
  console.log('[MOCK] Would add to Google Sheets');
  console.log('[MOCK] Success! (Skipping actual API calls in mock mode)');
};
