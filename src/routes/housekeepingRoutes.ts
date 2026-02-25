import express from 'express';
import { 
  getHousekeepingBoard, 
  createCleaningTicket, 
  assignCleaningTask, 
  updateCleaningStatus,
  createMaintenanceTicket,
  getMaintenanceTickets,
  updateMaintenanceStatus
} from '../controllers/housekeepingController.js';
import { protect, authorize } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

// Housekeeping board
router.get('/tickets', getHousekeepingBoard);
router.post('/tickets', authorize('manager', 'reception'), createCleaningTicket);
router.patch('/tickets/:id/status', updateCleaningStatus);
router.post('/tickets/assign', authorize('manager'), assignCleaningTask);

// Maintenance
router.get('/maintenance', getMaintenanceTickets);
router.post('/maintenance', createMaintenanceTicket);
router.patch('/maintenance/:id', updateMaintenanceStatus);

export default router;
