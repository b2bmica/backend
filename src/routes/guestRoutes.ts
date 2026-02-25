import express from 'express';
import { 
  createGuest, 
  searchGuests, 
  getGuestStayHistory, 
  getUploadUrl, 
  getGuests,
  getGuest 
} from '../controllers/guestController.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

router.get('/', getGuests);
router.post('/', createGuest);
router.get('/search', searchGuests);
router.get('/upload-url', getUploadUrl);
router.get('/:id', getGuest);
router.get('/:id/history', getGuestStayHistory);

export default router;
