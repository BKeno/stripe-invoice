import express from 'express';
import { verifyStripeSignature } from './middlewares/stripeSignature.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { handleStripeWebhook } from './controllers/webhookController.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

// Stripe webhook requires raw body
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  verifyStripeSignature,
  handleStripeWebhook
);

// Regular JSON parsing for other routes
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin routes (localhost-only with API key)
app.use('/admin', adminRoutes);

// Error handler must be last
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/stripe`);
});
