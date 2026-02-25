import express from 'express';
import { 
  addCharge, 
  getFolio, 
  recordPayment, 
  finalizeInvoice, 
  getCashierReport,
  downloadInvoice 
} from '../controllers/folioController.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

router.get('/folio/:bookingId', getFolio);
router.post('/charge', addCharge);
router.post('/payment', recordPayment);
router.post('/finalize', finalizeInvoice);
router.get('/report', getCashierReport);
router.get('/:id/download', downloadInvoice);

export default router;
