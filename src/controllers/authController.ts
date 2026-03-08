import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Hotel from '../models/Hotel.js';
import { sendOTP } from '../utils/email.js';

const generateToken = (userId: string, hotelId: string, role: string) => {
  return jwt.sign(
    { userId, hotelId, role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/register — Register a new hotel + admin user (Pending Verification)
export const registerHotel = async (req: Request, res: Response) => {
  try {
    const { hotelName, address, phone, email, password, userName } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      // If user exists but not verified, update and resend OTP
      const otp = generateOTP();
      existingUser.otp = otp;
      existingUser.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
      await existingUser.save();
      await sendOTP(email, otp, 'signup');
      return res.status(200).json({ message: 'Verification OTP resent to your email' });
    }

    // Create slug from hotel name
    const slug = hotelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check if hotel slug is taken
    const existingHotel = await Hotel.findOne({ slug });
    if (existingHotel) {
      return res.status(400).json({ error: 'Hotel name already taken' });
    }

    // Create hotel
    const hotel = await Hotel.create({
      name: hotelName,
      slug,
      address: address || 'Not specified',
      phone: phone || '0000000000',
      email,
      settings: { checkinTimes: ['14:00'], checkoutTimes: ['11:00'], currency: 'INR' }
    });

    // Create OTP
    const otp = generateOTP();

    // Create admin user (Unverified)
    await User.create({
      hotelId: hotel._id,
      name: userName || 'Admin',
      email,
      password,
      role: 'Super Admin',
      isVerified: false,
      otp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000)
    });

    await sendOTP(email, otp, 'signup');

    res.status(201).json({
      message: 'Registration successful. Please verify your email with the OTP sent.',
      email
    });
  } catch (error: any) {
    console.error('Registration Error:', error);
    res.status(400).json({ error: error.message });
  }
};

// POST /api/auth/verify-otp — Verify signup OTP
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email, otp }).select('+otp +otpExpires').populate('hotelId');

    if (!user || (user.otpExpires && user.otpExpires < new Date())) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const hotel = user.hotelId as any;
    const token = generateToken(user._id.toString(), hotel._id.toString(), user.role);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      hotel: {
        id: hotel._id,
        name: hotel.name,
        slug: hotel.slug,
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/auth/login
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password').populate('hotelId');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in', unverified: true });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.hotelId) {
      console.error(`Login Error: User ${email} has no associated hotel.`);
      return res.status(400).json({ error: 'Account configuration error: No hotel found for this user.' });
    }

    const hotel = user.hotelId as any;

    if (hotel.status === 'deleted') {
      return res.status(403).json({ error: 'This property has been deactivated/deleted. Access is restricted to historical data retrieval only.' });
    }

    const hotelId = hotel._id.toString();

    const token = generateToken(
      (user._id as any).toString(),
      hotelId,
      user.role
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      hotel: {
        id: hotel._id,
        name: hotel.name,
        slug: hotel.slug,
      }
    });
  } catch (error: any) {
    console.error('Login Error:', error);
    res.status(400).json({ error: error.message });
  }

};

// POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: 'User with this email not found' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTP(email, otp, 'forgot-password');

    res.json({ message: 'Password reset OTP sent to your email' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/auth/reset-password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email, otp }).select('+otp +otpExpires');

    if (!user || (user.otpExpires && user.otpExpires < new Date())) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now login with your new password.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/auth/me — Get the current user's profile
export const getMe = async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user.userId).populate('hotelId');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hotel = user.hotelId as any;
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      hotel: {
        id: hotel._id,
        name: hotel.name,
        slug: hotel.slug,
        address: hotel.address,
        phone: hotel.phone,
        email: hotel.email,
        gstin: hotel.gstin,
        settings: hotel.settings
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// PUT /api/auth/hotel — Update hotel settings
export const updateHotel = async (req: any, res: Response) => {
  try {
    const hotel = await Hotel.findById(req.user.hotelId);
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    const { name, address, phone, email, gstin, settings } = req.body;

    hotel.name = name || hotel.name;
    hotel.address = address || hotel.address;
    hotel.phone = phone || hotel.phone;
    hotel.email = email || hotel.email;
    hotel.gstin = gstin || hotel.gstin;
    if (settings) {
      hotel.settings = { ...hotel.settings, ...settings };
    }

    await hotel.save();

    res.json({
      message: 'Hotel updated successfully',
      hotel: {
        id: hotel._id,
        name: hotel.name,
        slug: hotel.slug,
        settings: hotel.settings
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// DELETE /api/auth/hotel — Soft delete the hotel and its users
export const deleteHotel = async (req: any, res: Response) => {
  try {
    // Only Super Admins should be able to delete the hotel
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Unauthorized: Only Super Admin can delete the property' });
    }

    const hotel = await Hotel.findById(req.user.hotelId);
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    // Soft delete
    hotel.status = 'deleted';
    hotel.deletedAt = new Date();
    await hotel.save();

    // Optionally deactivate all users for this hotel
    await User.updateMany({ hotelId: hotel._id }, { role: 'Deactivated' });

    res.json({
      message: 'Property has been successfully deleted. Historical data remains preserved.',
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
