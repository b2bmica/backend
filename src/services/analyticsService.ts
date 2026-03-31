import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import Hotel from '../models/Hotel.js';
import DailyAnalytics from '../models/DailyAnalytics.js';
import MonthlyAnalytics from '../models/MonthlyAnalytics.js';
import { startOfDay, endOfDay, addDays, format, subDays, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { calculateBookingPrice } from '../utils/pricing.util.js';

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
  /**
   * Generates a dashboard summary with owner-centric metrics
   */
  static async getDashboardSummary(hotelId: string) {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const yesterday = subDays(today, 1);

    const [todayStats, yesterdayStats, rooms] = await Promise.all([
      DailyAnalytics.findOne({ hotelId, date: today }),
      DailyAnalytics.findOne({ hotelId, date: yesterday }),
      Room.find({ hotelId })
    ]);

    const totalRooms = rooms.length;
    const roomsByStatus = {
      available: rooms.filter(r => r.status === 'clean' || !r.status).length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
      dirty: rooms.filter(r => r.status === 'dirty').length,
      maintenance: rooms.filter(r => r.status === 'maintenance').length,
    };

    const occupancyPercent = totalRooms > 0 ? (roomsByStatus.occupied / totalRooms) * 100 : 0;

    // Today & Tomorrow Flows
    const todayCheckins = await Booking.find({
      hotelId,
      checkin: { $gte: startOfDay(today), $lte: endOfDay(today) },
      status: { $ne: 'cancelled' }
    });

    const tomorrowCheckinsCount = await Booking.countDocuments({
      hotelId,
      checkin: { $gte: startOfDay(tomorrow), $lte: endOfDay(tomorrow) },
      status: { $ne: 'cancelled' }
    });

    const todayCheckouts = await Booking.find({
      hotelId,
      checkout: { $gte: startOfDay(today), $lte: endOfDay(today) },
      status: { $ne: 'cancelled' }
    });

    // Cash in Hand (Today's payment logs)
    const todayPayments = await Booking.aggregate([
      { $match: { hotelId: new mongoose.Types.ObjectId(hotelId) } },
      { $unwind: '$paymentLogs' },
      { 
        $match: { 
          'paymentLogs.date': { $gte: startOfDay(today), $lte: endOfDay(today) } 
        } 
      },
      {
        $group: {
          _id: '$paymentLogs.method',
          total: { $sum: '$paymentLogs.amount' }
        }
      }
    ]);

    const cashInHand = {
      cash: todayPayments.find(p => p._id?.toLowerCase() === 'cash')?.total || 0,
      upi: todayPayments.find(p => p._id?.toLowerCase() === 'upi')?.total || 0,
      card: todayPayments.find(p => p._id?.toLowerCase() === 'card')?.total || 0,
    };

    // Pending Payments (Balance for active bookings)
    // We consider 'checked-in' and 'reserved' (if check-in is today)
    const activeBookings = await Booking.find({
      hotelId,
      status: { $in: ['checked-in', 'reserved'] },
      checkin: { $lte: endOfDay(today) }
    });

    let totalPendingAmount = 0;
    let unpaidRoomsCount = 0;

    activeBookings.forEach(b => {
      const paid = b.paymentLogs.reduce((sum, log) => sum + log.amount, 0);
      const totalDue = b.roomPrice + (b.mealChargeTotal || 0); // Simplified calculation
      const balance = totalDue - paid;
      if (balance > 10) { // Small threshold
        totalPendingAmount += balance;
        unpaidRoomsCount++;
      }
    });

    // Expected Revenue (Today's check-ins total)
    const expectedRevenueToday = todayCheckins.reduce((sum, b) => sum + b.roomPrice, 0);

    // Alerts
    const now = new Date();
    const checkoutsSoon = todayCheckouts.filter(b => {
      const coTime = new Date(b.checkout);
      const diffHours = (coTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      return diffHours > 0 && diffHours <= 1;
    }).length;

    // Insights (Last 30 days)
    const last30Days = await Booking.find({
      hotelId,
      status: { $in: ['checked-in', 'checked-out'] },
      checkin: { $gte: subDays(today, 30) }
    }).populate('roomId');

    const roomTypeStats: Record<string, number> = {};
    let totalStayDays = 0;
    let walkinCount = 0;
    let onlineCount = 0;

    last30Days.forEach(b => {
      const room = b.roomId as any;
      if (room?.roomType) {
        roomTypeStats[room.roomType] = (roomTypeStats[room.roomType] || 0) + 1;
      }
      const days = Math.max(1, Math.ceil((new Date(b.checkout).getTime() - new Date(b.checkin).getTime()) / (1000 * 60 * 60 * 24)));
      totalStayDays += days;
      if (b.bookingSource?.toLowerCase() === 'walk-in' || b.bookingSource?.toLowerCase() === 'direct') {
        walkinCount++;
      } else {
        onlineCount++;
      }
    });

    const topRoomType = Object.entries(roomTypeStats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const avgStayDuration = last30Days.length > 0 ? (totalStayDays / last30Days.length).toFixed(1) : '0';
    const totalBookingsCount = last30Days.length || 1;

    return {
      kpis: {
        todayRevenue: todayStats?.grossRevenue || 0,
        revenueChange: todayStats && yesterdayStats ? ((todayStats.grossRevenue - yesterdayStats.grossRevenue) / (yesterdayStats.grossRevenue || 1)) * 100 : 0,
        occupancyPercent: Math.round(occupancyPercent),
        totalRooms,
        occupiedRooms: roomsByStatus.occupied,
        availableRooms: roomsByStatus.available,
        todayCheckins: todayCheckins.length,
        tomorrowCheckins: tomorrowCheckinsCount,
        todayCheckouts: todayCheckouts.length,
        adr: todayStats?.adr || 0,
        revPar: todayStats?.revPar || 0,
      },
      money: {
        cashInHand,
        pendingPayments: {
          amount: totalPendingAmount,
          count: unpaidRoomsCount
        },
        expectedRevenueToday
      },
      operations: {
        roomStatusDistribution: roomsByStatus,
        roomsToClean: roomsByStatus.dirty,
        maintenanceRooms: roomsByStatus.maintenance,
      },
      alerts: {
        dirtyRooms: roomsByStatus.dirty,
        checkoutsSoon,
        unpaidRooms: unpaidRoomsCount
      },
      insights: {
        topRoomType,
        avgStayDuration,
        sourceDist: {
          walkin: Math.round((walkinCount / totalBookingsCount) * 100),
          online: Math.round((onlineCount / totalBookingsCount) * 100)
        }
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

  static async getFinanceSummary(hotelId: string) {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) throw new Error('Hotel not found');

    const tc = hotel.settings.taxConfig;
    const allBookings = await Booking.find({ hotelId, status: { $ne: 'cancelled' } }).populate('roomId');

    let outstandingAmount = 0;
    let advanceCollected = 0; 
    
    const todayCollection: any = { cash: 0, upi: 0, card: 0, total: 0 };
    
    let unpaidCheckoutsTodayCount = 0;
    let unpaidCheckoutsTodayAmount = 0;
    
    let overdueBillsCount = 0;
    let overdueBillsAmount = 0;

    let depositsToRefundCount = 0;
    let depositsToRefundAmount = 0;

    let partialPaidGuestsCount = 0;
    let partialPaidGuestsAmount = 0;

    allBookings.forEach(b => {
      const pricing = calculateBookingPrice({
        roomPrice: b.roomPrice || (b.roomId as any)?.price || 0,
        checkin: b.checkin,
        checkout: b.checkout,
        adults: b.adults || 1,
        baseOccupancy: b.baseOccupancy || (b.roomId as any)?.baseOccupancy || 2,
        extraPersonRate: b.extraPersonPrice || (b.roomId as any)?.extraPersonPrice || 0,
        planType: (b.planType || 'EP') as any,
        mealRates: hotel.settings.mealRates,
        mealRateOverride: b.mealRate,
        gstRates: { cgst: tc.cgst, sgst: tc.sgst }
      });

      const totalAmount = pricing.grandTotal;
      const totalPaid = b.paymentLogs?.reduce((sum, log) => sum + log.amount, 0) || b.advancePayment || 0;
      const balance = Math.max(0, totalAmount - totalPaid);

      if (['reserved', 'checked-in'].includes(b.status)) {
        outstandingAmount += balance;
      }
      advanceCollected += totalPaid;

      b.paymentLogs?.forEach(log => {
        const logDate = new Date(log.date);
        if (logDate >= today && logDate < tomorrow) {
          const method = log.method.toLowerCase();
          if (method === 'cash') todayCollection.cash += log.amount;
          else if (method === 'upi') todayCollection.upi += log.amount;
          else if (method === 'card') todayCollection.card += log.amount;
          
          todayCollection.total += log.amount;
        }
      });

      const isCheckingOutToday = startOfDay(new Date(b.checkout)).getTime() === today.getTime();
      const hasCheckedOut = b.status === 'checked-out';

      if (b.status === 'checked-in' && isCheckingOutToday && balance > 0) {
        unpaidCheckoutsTodayCount++;
        unpaidCheckoutsTodayAmount += balance;
      }

      if (hasCheckedOut && balance > 0) {
        overdueBillsCount++;
        overdueBillsAmount += balance;
      }

      if (['reserved', 'checked-in'].includes(b.status) && balance > 0 && totalPaid > 0) {
        partialPaidGuestsCount++;
        partialPaidGuestsAmount += balance;
      }
    });

    // Fetch opening cash from DailyAnalytics
    const todayStats = await DailyAnalytics.findOne({ hotelId, date: today });
    let openingCash = todayStats?.openingCash || 0;

    if (!todayStats) {
      // Try to find yesterday's closing to suggest opening
      const yesterday = subDays(today, 1);
      const yesterdayStats = await DailyAnalytics.findOne({ hotelId, date: yesterday });
      if (yesterdayStats) {
        openingCash = yesterdayStats.openingCash + yesterdayStats.cashCollection;
      }
    }

    const cashRefunds = 0; // Future: track actual refunds

    return {
      row1: {
        outstandingAmount,
        todayCollection,
        advanceCollected,
      },
      row2: {
        unpaidCheckoutsToday: { count: unpaidCheckoutsTodayCount, amount: unpaidCheckoutsTodayAmount },
        overdueBills: { count: overdueBillsCount, amount: overdueBillsAmount },
        depositsToRefund: { count: depositsToRefundCount, amount: depositsToRefundAmount },
        partialPaidGuests: { count: partialPaidGuestsCount, amount: partialPaidGuestsAmount }
      },
      cashClosing: {
        openingCash,
        collectedToday: todayCollection.cash,
        refunds: cashRefunds,
        closingCash: openingCash + todayCollection.cash - cashRefunds
      }
    };
  }

  static async finalizeDailyFinance(hotelId: string, summary: any) {
    const today = startOfDay(new Date());
    
    return await DailyAnalytics.findOneAndUpdate(
      { hotelId, date: today },
      {
        openingCash: summary.cashClosing.openingCash,
        cashCollection: summary.todayCollection.cash,
        upiCollection: summary.todayCollection.upi,
        cardCollection: summary.todayCollection.card,
        isFinalized: true
      },
      { upsert: true, new: true }
    );
  }

  static async updateOpeningCash(hotelId: string, amount: number) {
    const today = startOfDay(new Date());
    return await DailyAnalytics.findOneAndUpdate(
      { hotelId, date: today },
      { openingCash: amount },
      { upsert: true, new: true }
    );
  }
}
