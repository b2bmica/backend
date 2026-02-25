import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Hotel from '../models/Hotel.js';

const generateToken = (userId: string, hotelId: string, role: string) => {
  return jwt.sign(
    { userId, hotelId, role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
};

// POST /api/auth/register — Register a new hotel + admin user
export const registerHotel = async (req: Request, res: Response) => {
  try {
    const { hotelName, address, phone, email, password, userName } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
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
      settings: { checkinTime: '12:00 PM', checkoutTime: '11:00 AM', currency: 'INR' }
    });

    // Create admin user
    const user = await User.create({
      hotelId: hotel._id,
      name: userName || 'Admin',
      email,
      password,
      role: 'Super Admin'
    });

    const token = generateToken(
      (user._id as any).toString(),
      (hotel._id as any).toString(),
      user.role
    );

    res.status(201).json({
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

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const hotelId = (user.hotelId as any)._id.toString();
    const hotel = user.hotelId as any;

    if (hotel.status === 'deleted') {
      return res.status(403).json({ error: 'This property has been deactivated/deleted. Access is restricted to historical data retrieval only.' });
    }

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
