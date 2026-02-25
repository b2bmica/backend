import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import Guest from '../models/Guest.js';
import AuditLog from '../models/AuditLog.js';
import { generateUploadPresignedUrl, isS3Configured } from '../utils/s3.js';

// Helper for audit logs
const createAuditLog = async (req: AuthRequest, module: string, action: string, details: any) => {
  await AuditLog.create({
    hotelId: req.hotelId,
    userId: req.user?.userId,
    module,
    action,
    details,
    ipAddress: req.ip
  } as any);
};

export const createGuest = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const guest = await Guest.create({ ...req.body, hotelId });
    
    await createAuditLog(req, 'Guest', 'CREATE', { guestId: guest._id });
    
    res.status(201).json(guest);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const searchGuests = async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.query as string;
    const hotelId = req.hotelId!;

    const guests = await Guest.find({
      hotelId,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    } as any).limit(10);

    res.json(guests);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

import Booking from '../models/Booking.js';

export const getGuestStayHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const bookings = await Booking.find({ 
      guestId: id, 
      hotelId: req.hotelId! 
    }).populate('roomId')
      .sort({ checkin: -1 });
    
    res.json(bookings);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getUploadUrl = async (req: AuthRequest, res: Response) => {
  try {
    if (!isS3Configured()) {
      return res.status(501).json({ error: 'S3 storage is not configured. Using local fallback.' });
    }

    const fileName = req.query.fileName as string;
    const contentType = req.query.contentType as string;
    
    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'fileName and contentType are required' });
    }

    const { url, key } = await generateUploadPresignedUrl(fileName, contentType);
    
    res.json({ uploadUrl: url, fileKey: key });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getGuests = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [guests, total] = await Promise.all([
      Guest.find({ hotelId }).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Guest.countDocuments({ hotelId })
    ]);

    res.json({
      guests,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
export const getGuest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const guest = await Guest.findOne({ _id: id, hotelId: req.hotelId! });
    
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    res.json(guest);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
