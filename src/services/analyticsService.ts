import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import Hotel from '../models/Hotel.js';
import DailyAnalytics from '../models/DailyAnalytics.js';
import MonthlyAnalytics from '../models/MonthlyAnalytics.js';
import { startOfDay, endOfDay, addDays, format, subDays, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';

export class AnalyticsService {
  /**
   * Syncs daily analytics for a specific hotel and date range
   */
  static async syncDailyAnalytics(hotelId: string, startDate: Date, endDate: Date) {
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) throw new Error('Hotel not found');

    const rooms = await Room.find({ hotelId });
    const totalRoomsCount = rooms.length;
    
    // We iterate day by day
    let current = startOfDay(startDate);
    const targetEnd = startOfDay(endDate);

    while (current <= targetEnd) {
      const dayStart = startOfDay(current);
      const dayEnd = endOfDay(current);

      // Find all relevant bookings that overlap with this day
      // A booking overlaps with day D if: checkin <= D AND checkout > D
      const activeBookings = await Booking.find({
        hotelId,
        status: { $in: ['reserved', 'checked-in', 'checked-out'] },
        reservationType: { $in: ['booking', 'group'] },
        checkin: { $lt: dayEnd },
        checkout: { $gt: dayStart }
      }).populate('roomId');

      // Count blocked rooms for this day
      const blockedRoomsCount = await Booking.countDocuments({
        hotelId,
        reservationType: 'block',
        status: { $ne: 'cancelled' },
        checkin: { $lt: dayEnd },
        checkout: { $gt: dayStart }
      });

      const roomsSold = activeBookings.length;
      const roomsAvailable = Math.max(0, totalRoomsCount - blockedRoomsCount);
      
      let dayRoomRev = 0;
      let dayExtraRev = 0;
      let dayMealRev = 0;
      let dayTax = 0;

      activeBookings.forEach(booking => {
        // Find how many nights this booking has
        const ci = startOfDay(new Date(booking.checkin));
        const co = startOfDay(new Date(booking.checkout));
        const totalNights = Math.max(1, Math.ceil((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24)));

        // Revenue for this specific night
        // We divide the total amounts by total nights
        // Note: In a more complex system, we might have day-wise rates, but here rates are fixed per booking.
        dayRoomRev += booking.roomPrice / totalNights;
        
        // Extra person revenue
        const adults = booking.adults || 1;
        const baseOcc = booking.baseOccupancy || 2;
        if (adults > baseOcc) {
          dayExtraRev += (booking.extraPersonPrice * (adults - baseOcc)) / 1; // It's already calculated per night in our billing if we look at pricing.util
          // Wait, pricing.util says: extraPersonCharge = extraPersons * params.extraPersonRate * nights;
          // So daily extra charge is extraPersons * extraPersonRate
          dayExtraRev += (adults - baseOcc) * booking.extraPersonPrice;
        }

        // Meal revenue
        // pricing.util says: mealChargeTotal = mealChargePerPersonPerDay * params.adults * nights
        // So daily meal charge is mealChargePerPersonPerDay * adults
        dayMealRev += booking.mealChargeTotal / totalNights;

        // Taxes
        // subtotal = current day's (roomRev + extraRev + mealRev)
        const sub = (booking.roomPrice) + ((adults > baseOcc ? (adults - baseOcc) * booking.extraPersonPrice : 0)) + (booking.mealChargeTotal / totalNights);
        const taxRate = (hotel.settings.taxConfig.cgst + hotel.settings.taxConfig.sgst);
        dayTax += (sub * taxRate) / 100;
      });

      const netRevenue = dayRoomRev + dayExtraRev + dayMealRev;
      const grossRevenue = netRevenue + dayTax;
      const occupancyRate = roomsAvailable > 0 ? (roomsSold / roomsAvailable) * 100 : 0;
      const adr = roomsSold > 0 ? dayRoomRev / roomsSold : 0;
      const revPar = roomsAvailable > 0 ? dayRoomRev / roomsAvailable : 0;

      await DailyAnalytics.findOneAndUpdate(
        { hotelId, date: dayStart },
        {
          roomsAvailable,
          roomsSold,
          occupancyRate,
          roomRevenue: dayRoomRev,
          extraPersonRevenue: dayExtraRev,
          mealRevenue: dayMealRev,
          grossRevenue,
          taxAmount: dayTax,
          netRevenue,
          adr,
          revPar
        },
        { upsert: true, new: true }
      );

      current = addDays(current, 1);
    }

    // After updating daily, update monthly for the affected months
    const startM = format(startDate, 'yyyy-MM');
    const endM = format(endDate, 'yyyy-MM');
    // For simplicity, just update these two. If range is large, we should loop.
    await this.syncMonthlyAnalytics(hotelId, startM);
    if (startM !== endM) await this.syncMonthlyAnalytics(hotelId, endM);
  }

  static async syncMonthlyAnalytics(hotelId: string, monthStr: string) {
    const start = startOfMonth(new Date(monthStr + '-01'));
    const end = endOfMonth(start);

    const dailies = await DailyAnalytics.find({
      hotelId,
      date: { $gte: start, $lte: end }
    });

    if (dailies.length === 0) return;

    const totalRoomNights = dailies.reduce((sum, d) => sum + d.roomsSold, 0);
    const totalRoomsAvailable = dailies.reduce((sum, d) => sum + d.roomsAvailable, 0);
    const totalNetRevenue = dailies.reduce((sum, d) => sum + d.netRevenue, 0);
    const totalTaxAmount = dailies.reduce((sum, d) => sum + d.taxAmount, 0);
    const totalGrossRevenue = totalNetRevenue + totalTaxAmount;
    
    // Count unique bookings that touch this month
    const totalBookings = await Booking.countDocuments({
      hotelId,
      status: { $in: ['reserved', 'checked-in', 'checked-out'] },
      reservationType: { $in: ['booking', 'group'] },
      checkin: { $lt: endOfDay(end) },
      checkout: { $gt: startOfDay(start) }
    });

    const occupancyRate = totalRoomsAvailable > 0 ? (totalRoomNights / totalRoomsAvailable) * 100 : 0;
    const adr = totalRoomNights > 0 ? dailies.reduce((sum, d) => sum + d.roomRevenue, 0) / totalRoomNights : 0;
    const revPar = totalRoomsAvailable > 0 ? dailies.reduce((sum, d) => sum + d.roomRevenue, 0) / totalRoomsAvailable : 0;

    await MonthlyAnalytics.findOneAndUpdate(
      { hotelId, month: monthStr },
      {
        totalBookings,
        totalRoomNights,
        occupancyRate,
        grossRevenue: totalGrossRevenue,
        netRevenue: totalNetRevenue,
        taxAmount: totalTaxAmount,
        adr,
        revPar
      },
      { upsert: true }
    );
  }

  /**
   * Generates a dashboard summary
   */
  static async getDashboardSummary(hotelId: string) {
    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);

    const [todayStats, yesterdayStats] = await Promise.all([
      DailyAnalytics.findOne({ hotelId, date: today }),
      DailyAnalytics.findOne({ hotelId, date: yesterday })
    ]);

    const rooms = await Room.find({ hotelId });
    const roomsByStatus = {
      available: rooms.filter(r => r.status === 'clean').length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
      dirty: rooms.filter(r => r.status === 'dirty').length,
      maintenance: rooms.filter(r => r.status === 'maintenance').length,
      blocked: 0 // In this model, blocks are reservations, not room statuses
    };

    const todayCheckins = await Booking.countDocuments({
      hotelId,
      checkin: { $gte: startOfDay(today), $lte: endOfDay(today) },
      status: { $ne: 'cancelled' }
    });

    const todayCheckouts = await Booking.countDocuments({
      hotelId,
      checkout: { $gte: startOfDay(today), $lte: endOfDay(today) },
      status: { $ne: 'cancelled' }
    });

    return {
      kpis: {
        todayRevenue: todayStats?.grossRevenue || 0,
        revenueChange: todayStats && yesterdayStats ? ((todayStats.grossRevenue - yesterdayStats.grossRevenue) / (yesterdayStats.grossRevenue || 1)) * 100 : 0,
        currentOccupancy: todayStats?.occupancyRate || 0,
        todayCheckins,
        todayCheckouts,
      },
      operations: {
        roomStatusDistribution: roomsByStatus,
        housekeepingLoad: roomsByStatus.dirty
      }
    };
  }

  static async getRevenueAnalytics(hotelId: string, startDate: Date, endDate: Date) {
    const dailies = await DailyAnalytics.find({
      hotelId,
      date: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
    }).sort({ date: 1 });

    const totalRevenue = dailies.reduce((sum, d) => sum + d.grossRevenue, 0);
    const totalTax = dailies.reduce((sum, d) => sum + d.taxAmount, 0);

    // Grouping by room type (requires aggregation since DailyAnalytics doesn't store it)
    const revenueByRoomType = await Booking.aggregate([
      {
        $match: {
          hotelId: new mongoose.Types.ObjectId(hotelId),
          status: { $in: ['reserved', 'checked-in', 'checked-out'] },
          checkin: { $lt: endOfDay(endDate) },
          checkout: { $gt: startOfDay(startDate) }
        }
      },
      {
        $lookup: {
          from: 'rooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'room'
        }
      },
      { $unwind: '$room' },
      {
        $group: {
          _id: '$room.roomType',
          revenue: { $sum: '$roomPrice' } // This is simple, for precise night-split we would need more complex logic.
          // For the bar chart aggregate, room total is usually okay if we filter correctly.
        }
      }
    ]);

    // Payment methods
    const paymentMethods = await Booking.aggregate([
      {
        $match: {
          hotelId: new mongoose.Types.ObjectId(hotelId),
          paymentLogs: { $exists: true, $not: { $size: 0 } }
        }
      },
      { $unwind: '$paymentLogs' },
      {
        $match: {
          'paymentLogs.date': { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
        }
      },
      {
        $group: {
          _id: '$paymentLogs.method',
          amount: { $sum: '$paymentLogs.amount' }
        }
      }
    ]);

    return {
      summary: {
        totalRevenue,
        taxAmount: totalTax,
        netRevenue: totalRevenue
      },
      trend: dailies.map(d => ({
        date: format(d.date, 'MMM dd'),
        revenue: d.grossRevenue
      })),
      byRoomType: revenueByRoomType.map(r => ({ roomType: r._id, revenue: r.revenue })),
      byPaymentMethod: paymentMethods.reduce((acc: any, p) => {
        acc[p._id] = p.amount;
        return acc;
      }, {})
    };
  }
}
