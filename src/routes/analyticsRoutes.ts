import express from 'express';
import { getAdvancedAnalytics, getCashierSummary } from '../controllers/analyticsController.js';
import { protect, authorize } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

router.get('/summary', authorize('manager', 'reception'), getAdvancedAnalytics);
router.get('/cashier', authorize('manager'), getCashierSummary);

export default router;
