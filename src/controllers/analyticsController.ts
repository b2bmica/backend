import { Response } from 'express';
import { AuthRequest } from '../middleware/tenant.js';
import { AnalyticsService } from '../services/analyticsService.js';
import { startOfDay, endOfDay, subDays, parseISO } from 'date-fns';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import mongoose from 'mongoose';

export const getDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    
    // Proactively sync last 7 days to ensure dashboard is fresh
    // In production, this would be a background job
    const start = subDays(new Date(), 7);
    const end = new Date();
    await AnalyticsService.syncDailyAnalytics(hotelId.toString(), start, end);

    const summary = await AnalyticsService.getDashboardSummary(hotelId.toString());
    res.json(summary);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getRevenue = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const startDate = req.query.startDate ? parseISO(req.query.startDate as string) : subDays(new Date(), 30);
    const endDate = req.query.endDate ? parseISO(req.query.endDate as string) : new Date();

    const analytics = await AnalyticsService.getRevenueAnalytics(hotelId.toString(), startDate, endDate);
    res.json(analytics);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getOccupancy = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const startDate = req.query.startDate ? parseISO(req.query.startDate as string) : subDays(new Date(), 30);
    const endDate = req.query.endDate ? parseISO(req.query.endDate as string) : new Date();

    const dailies = await mongoose.model('DailyAnalytics').find({
      hotelId,
      date: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
    }).sort({ date: 1 });

    const totalRooms = await Room.countDocuments({ hotelId });

    res.json({
      trend: dailies.map((d: any) => ({
        date: format(d.date, 'MMM dd'),
        occupancy: d.occupancyRate,
        roomsSold: d.roomsSold
      })),
      summary: {
        avgOccupancy: dailies.length > 0 ? dailies.reduce((sum: number, d: any) => sum + d.occupancyRate, 0) / dailies.length : 0,
        totalRoomNights: dailies.reduce((sum: number, d: any) => sum + d.roomsSold, 0),
        alos: 2.5 // Placeholder for ALOS
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getFinance = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const startDate = req.query.startDate ? parseISO(req.query.startDate as string) : subDays(new Date(), 30);
    const endDate = req.query.endDate ? parseISO(req.query.endDate as string) : new Date();

    const bookings = await Booking.find({
      hotelId,
      status: { $in: ['reserved', 'checked-in', 'checked-out'] },
      checkin: { $lt: endOfDay(endDate) },
      checkout: { $gt: startOfDay(startDate) }
    });

    let totalPending = 0;
    let totalAdvance = 0;

    bookings.forEach(b => {
      totalAdvance += b.advancePayment || 0;
      // Pending requires full calculation from pricing utility or stored balance
      // Since we standardized bookings in older steps, here we'll use a simplified balance
      // In production, we'd use the pricing utility to get exact due amount
    });

    res.json({
      advancePayments: totalAdvance,
      pendingPayments: totalPending,
      gstCollected: 0 // Will aggregate from DailyAnalytics
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getOperations = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const rooms = await Room.find({ hotelId });
    const statuses = {
      available: rooms.filter(r => r.status === 'clean').length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
      dirty: rooms.filter(r => r.status === 'dirty').length,
      maintenance: rooms.filter(r => r.status === 'maintenance').length
    };

    res.json({
      roomStatusDistribution: statuses,
      housekeepingLoad: statuses.dirty,
      todayCheckins: await Booking.countDocuments({ hotelId, checkin: { $gte: startOfDay(new Date()), $lte: endOfDay(new Date()) }, status: { $ne: 'cancelled' } }),
      todayCheckouts: await Booking.countDocuments({ hotelId, checkout: { $gte: startOfDay(new Date()), $lte: endOfDay(new Date()) }, status: { $ne: 'cancelled' } })
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getForecast = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const today = new Date();
    const next7Days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

    const totalRooms = await Room.countDocuments({ hotelId });

    const forecast = await Promise.all(next7Days.map(async (date) => {
      const dStart = startOfDay(date);
      const dEnd = endOfDay(date);
      const roomsSold = await Booking.countDocuments({
        hotelId,
        status: { $in: ['reserved', 'checked-in'] },
        checkin: { $lt: dEnd },
        checkout: { $gt: dStart }
      });
      return {
        date: format(date, 'MMM dd'),
        expectedOccupancy: totalRooms > 0 ? (roomsSold / totalRooms) * 100 : 0,
        expectedRoomsSold: roomsSold
      };
    }));

    res.json(forecast);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Internal utility to sync analytics
export const triggerSync = async (req: AuthRequest, res: Response) => {
    try {
        const { hotelId } = req;
        const { start, end } = req.query;
        if(!start || !end) return res.status(400).json({ error: 'Start and end dates required' });
        
        await AnalyticsService.syncDailyAnalytics(hotelId!.toString(), parseISO(start as string), parseISO(end as string));
        res.json({ message: 'Sync complete' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}

import { format, addDays } from 'date-fns';
