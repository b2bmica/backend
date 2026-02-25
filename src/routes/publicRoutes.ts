import express from 'express';
import { getPublicAvailability, createPublicBooking } from '../controllers/publicBookingController.js';

const router = express.Router();

// No auth/tenant middleware here as it's public entry
router.get('/availability', getPublicAvailability);
router.post('/book', createPublicBooking);

export default router;
