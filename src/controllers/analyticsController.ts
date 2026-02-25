import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import Payment from '../models/Payment.js';
import FolioCharge from '../models/FolioCharge.js';
import mongoose from 'mongoose';

export const getAdvancedAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = new mongoose.Types.ObjectId(req.hotelId!);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Occupancy & Operations Summary
    const [totalRooms, occupiedRooms, todayCheckins, todayCheckouts] = await Promise.all([
      Room.countDocuments({ hotelId }),
      Room.countDocuments({ hotelId, status: 'occupied' }),
      Booking.countDocuments({ hotelId, checkin: { $gte: today, $lt: tomorrow }, status: { $ne: 'cancelled' } }),
      Booking.countDocuments({ hotelId, checkout: { $gte: today, $lt: tomorrow }, status: { $ne: 'cancelled' } })
    ]);

    // 2. Revenue Summary (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const revenueStats = await Payment.aggregate([
      { $match: { hotelId, date: { $gte: sevenDaysAgo }, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // 3. Outstanding Payments
    // Find active bookings (checked-in)
    const activeBookings = await Booking.find({ hotelId, status: 'checked-in' }).select('_id');
    const activeBookingIds = activeBookings.map(b => b._id);

    const outstandingSummary = await FolioCharge.aggregate([
      { $match: { hotelId, bookingId: { $in: activeBookingIds }, isBilled: false } },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: "$amount" }
        }
      }
    ]);

    // 4. Room Type Performance
    const roomPerformance = await Booking.aggregate([
      { $match: { hotelId, status: { $ne: 'cancelled' } } },
      {
        $lookup: {
          from: 'rooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      {
        $group: {
          _id: '$roomInfo.roomType',
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' } // Assuming checkouts update this
        }
      }
    ]);

    res.json({
      operations: {
        totalRooms,
        occupiedRooms,
        occupancyRate: totalRooms ? (occupiedRooms / totalRooms) * 100 : 0,
        todayCheckins,
        todayCheckouts
      },
      revenue: revenueStats,
      outstanding: outstandingSummary[0]?.totalOutstanding || 0,
      performance: roomPerformance
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getCashierSummary = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = new mongoose.Types.ObjectId(req.hotelId!);
    const { startDate, endDate } = req.query;

    const query: any = { hotelId, status: 'completed' };
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate as string), $lte: new Date(endDate as string) };
    }

    const summary = await Payment.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$method",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(summary);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
