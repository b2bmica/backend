import express from 'express';
import { getRooms, createRoom, updateRoom, deleteRoom, updateRoomStatus } from '../controllers/roomController.js';
import { protect, authorize } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

router.get('/', getRooms);
router.post('/', createRoom);
router.put('/:id', updateRoom);
router.delete('/:id', deleteRoom);
router.patch('/:id/status', updateRoomStatus);

export default router;
