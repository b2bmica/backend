import express from 'express';
import { registerHotel, verifyOtp, loginUser, forgotPassword, resetPassword, getMe, updateHotel, deleteHotel } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', registerHotel);
router.post('/verify-otp', verifyOtp);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getMe);
router.put('/hotel', protect, updateHotel);
router.delete('/hotel', protect, deleteHotel);

export default router;
