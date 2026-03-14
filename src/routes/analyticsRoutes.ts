import express from 'express';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { 
  getDashboard, 
  getRevenue, 
  getOccupancy, 
  getFinance, 
  getOperations, 
  getForecast,
  triggerSync
} from '../controllers/analyticsController.js';

const router = express.Router();

// All analytics routes require authentication and tenant context
router.use(protect);
router.use(tenantMiddleware);

router.get('/dashboard', getDashboard);
router.get('/revenue', getRevenue);
router.get('/occupancy', getOccupancy);
router.get('/finance', getFinance);
router.get('/operations', getOperations);
router.get('/forecast', getForecast);
router.get('/sync', triggerSync);

export default router;
