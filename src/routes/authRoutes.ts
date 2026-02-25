import express from 'express';
import { registerHotel, loginUser, getMe, updateHotel, deleteHotel } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', registerHotel);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.put('/hotel', protect, updateHotel);
router.delete('/hotel', protect, deleteHotel);

export default router;
