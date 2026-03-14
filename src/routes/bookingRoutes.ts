import express from 'express';
import { 
  getBookings,
  createBooking, 
  modifyBooking, 
  cancelBooking, 
  checkAvailability, 
  getCalendarData,
  createGroupBooking,
  getGroupBookings,
  updateGroup,
  expireBooking
} from '../controllers/bookingController.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

router.get('/', getBookings);
router.post('/', createBooking);
router.put('/:id', modifyBooking);
router.delete('/:id', cancelBooking);
router.get('/availability', checkAvailability);
router.get('/calendar', getCalendarData);
router.post('/group', createGroupBooking);
router.get('/group/:groupId', getGroupBookings);
router.patch('/group/:groupId', updateGroup);
router.patch('/:id/expire', expireBooking);

export default router;
