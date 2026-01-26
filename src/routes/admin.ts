import { Router } from 'express';
import { localhostOnly } from '../middlewares/localhostOnly.js';
import { processPayment } from '../controllers/adminController.js';

const router = Router();

// All admin routes require localhost + API key
router.use(localhostOnly);

/**
 * POST /admin/process-payment/:paymentIntentId
 * Manually process a payment (for old payments before webhook was configured)
 */
router.post('/process-payment/:paymentIntentId', processPayment);

export default router;
