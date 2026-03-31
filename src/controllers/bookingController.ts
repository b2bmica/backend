import mongoose from 'mongoose';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import Hotel from '../models/Hotel.js';
import Group from '../models/Group.js';
import { calculateBookingPrice } from '../utils/pricing.util.js';

// Helper to detect booking conflicts using full datetime precision
const hasConflict = async (hotelId: string, roomId: string, checkin: Date, checkout: Date, excludeBookingId?: string) => {
  const query: any = {
    hotelId,
    roomId,
    // Exclude cancelled and expired bookings from conflict detection
    status: { $nin: ['cancelled', 'expired', 'checked-out'] },
    $or: [
      { 
        checkin: { $lt: checkout }, 
        checkout: { $gt: checkin } 
      },
      // Also consider blocks that haven't expired
      {
        reservationType: 'block',
        $or: [
          { blockExpiresAt: { $gt: new Date() } },
          { blockExpiresAt: null }
        ],
        checkin: { $lt: checkout }, 
        checkout: { $gt: checkin }
      }
    ]
  };

  if (excludeBookingId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeBookingId) };
  }

  const existing = await Booking.findOne(query);
  return !!existing;
};

// Standardization helper for consistent response shape
const standardizeBooking = (booking: any, hotel: any) => {
  if (!booking) return null;
  const bookingObj = booking.toObject ? booking.toObject() : booking;
  
  const pricing = calculateBookingPrice({
    roomPrice: bookingObj.roomPrice || (bookingObj.roomId as any)?.price || 0,
    checkin: new Date(bookingObj.checkin),
    checkout: new Date(bookingObj.checkout),
    adults: bookingObj.adults || 1,
    baseOccupancy: bookingObj.baseOccupancy || (bookingObj.roomId as any)?.baseOccupancy || 2,
    extraPersonRate: bookingObj.extraPersonPrice || (bookingObj.roomId as any)?.extraPersonPrice || 0,
    planType: bookingObj.planType || 'EP',
    mealRates: hotel.settings.mealRates,
    mealRateOverride: bookingObj.mealRate,
    gstRates: {
      cgst: hotel.settings.taxConfig.cgst,
      sgst: hotel.settings.taxConfig.sgst
    }
  });

  return {
    ...bookingObj,
    pricing,
    room: {
      ...(bookingObj.roomId as any),
      checkinTime: (bookingObj.roomId as any)?.checkinTime || hotel.settings.checkinTimes?.[0] || '14:00',
      checkoutTime: (bookingObj.roomId as any)?.checkoutTime || hotel.settings.checkoutTimes?.[0] || '11:00'
    }
  };
};

// GET /api/bookings — List all bookings for this hotel
export const getBookings = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;
    const status = req.query.status as string;

    const filter: any = { hotelId };
    if (status) filter.status = status;

    const [hotel, [bookings, total]] = await Promise.all([
      Hotel.findById(hotelId),
      Promise.all([
        Booking.find(filter)
          .populate('roomId')
          .populate('guestId', 'name phone email')
          .populate('createdBy', 'name email')
          .skip(skip).limit(limit)
          .sort({ checkin: -1 }),
        Booking.countDocuments(filter)
      ])
    ]);

    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    res.json({
      bookings: bookings.map(b => standardizeBooking(b, hotel)),
      pagination: { total, page, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/bookings — Create a new booking
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, checkin, checkout, reservationType, planType, enquiryExpiresAt, blockExpiresAt, adults, ...details } = req.body;
    const hotelId = req.hotelId!;

    const cTime = details.checkinTime || req.body.checkinTime || '14:00';
    const oTime = details.checkoutTime || req.body.checkoutTime || '11:00';
    
    // Ensure checkin is yyyy-MM-dd format before combining
    const ciDateStr = checkin.includes('T') ? checkin.split('T')[0] : checkin;
    const coDateStr = checkout.includes('T') ? checkout.split('T')[0] : checkout;

    const startDate = new Date(`${ciDateStr}T${cTime}:00`);
    const endDate = new Date(`${coDateStr}T${oTime}:00`);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid checkin or checkout date' });
    }

    if (endDate <= startDate) {
      return res.status(400).json({ error: 'Checkout must be after checkin' });
    }

    const [hotel, room] = await Promise.all([
      Hotel.findById(hotelId),
      Room.findById(roomId)
    ]);

    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    // Validation for enquiry
    if (reservationType === 'enquiry') {
      if (!enquiryExpiresAt || new Date(enquiryExpiresAt) <= new Date()) {
        return res.status(400).json({ error: 'Valid enquiryExpiresAt is required for enquiries' });
      }
    }

    // guestId required for everything except blocks
    const guestId = details.guestId;
    if (reservationType !== 'block' && !guestId) {
      return res.status(400).json({ error: 'guestId is required for booking and enquiry reservations' });
    }
    // Remove it from details to prevent it spreading into bookingData with an invalid value
    delete details.guestId;

    // Overlap Check
    const conflict = await hasConflict(hotelId, roomId, startDate, endDate);
    if (conflict) {
      return res.status(409).json({ error: 'ROOM_UNAVAILABLE' });
    }

    // Calculate Price
    const pricing = calculateBookingPrice({
      roomPrice: room.price,
      checkin: startDate,
      checkout: endDate,
      adults: adults || 1,
      baseOccupancy: room.baseOccupancy,
      extraPersonRate: room.extraPersonPrice,
      planType: planType || 'EP',
      mealRates: hotel.settings.mealRates,
      gstRates: {
        cgst: hotel.settings.taxConfig.cgst,
        sgst: hotel.settings.taxConfig.sgst
      }
    });

    const bookingData: any = {
      ...details,
      roomId,
      roomPrice: room.price,
      checkin: startDate,
      checkout: endDate,
      hotelId,
      reservationType: reservationType || 'booking',
      planType: planType || 'EP',
      mealRate: (planType && planType.toUpperCase() !== 'EP' && planType.toUpperCase() !== 'CUSTOM') ? (hotel.settings.mealRates[planType.toUpperCase()] || 0) : 0,
      mealChargeTotal: pricing.mealChargeTotal,
      adults: adults || 1,
      createdBy: req.user?.userId
    };

    // Only set guestId when a valid one exists (blocks may have none)
    if (guestId) bookingData.guestId = guestId;

    if (reservationType === 'enquiry') bookingData.enquiryExpiresAt = enquiryExpiresAt;
    if (reservationType === 'block') {
      bookingData.blockExpiresAt = blockExpiresAt;
      bookingData.status = 'blocked';
    }

    if (details.advancePayment > 0) {
      bookingData.paymentLogs = [{
        amount: details.advancePayment,
        method: details.paymentMethod || 'cash',
        date: new Date(),
        note: 'Initial advance'
      }];
    }

    const booking = await Booking.create(bookingData);

    const populated = await Booking.findById(booking._id)
      .populate('roomId')
      .populate('guestId', 'name phone email')
      .populate('createdBy', 'name email');

    if (!populated) return res.status(404).json({ error: 'Booking created but not found' });

    // Standardization
    const result = standardizeBooking(populated, hotel);

    // Notify via Socket
    try {
      const { notifyHotel } = await import('../utils/socket.util.js');
      notifyHotel(hotelId.toString(), 'new-booking', {
        title: 'New Reservation Secured',
        message: `Reservation recorded for Room ${room.roomNumber}`,
        booking: result
      });
    } catch (err) {
      console.error('Socket notification failed:', err);
    }

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// PUT /api/bookings/:id — Modify a booking
export const modifyBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { roomId, checkin, checkout, paymentMethod, advancePayment, adults, planType } = req.body;
    const hotelId = req.hotelId!;

    const cTime = req.body.checkinTime || '14:00';
    const oTime = req.body.checkoutTime || '11:00';
    const ciDateStr = checkin ? (checkin.includes('T') ? checkin.split('T')[0] : checkin) : undefined;
    const coDateStr = checkout ? (checkout.includes('T') ? checkout.split('T')[0] : checkout) : undefined;

    const startDate = ciDateStr ? new Date(`${ciDateStr}T${cTime}:00`) : undefined;
    const endDate = coDateStr ? new Date(`${coDateStr}T${oTime}:00`) : undefined;

    if (startDate && endDate && roomId) {
      const conflict = await hasConflict(hotelId, roomId as string, startDate, endDate, id as string);
      if (conflict) {
        return res.status(409).json({ error: 'ROOM_UNAVAILABLE' });
      }
    }

    const [hotel, existing] = await Promise.all([
      Hotel.findById(hotelId),
      Booking.findOne({ _id: id, hotelId } as any).populate('roomId')
    ]);
    
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });
    if (!existing) return res.status(404).json({ error: 'Booking not found' });

    const updateData: any = { ...req.body };
    if (startDate) updateData.checkin = startDate;
    if (endDate) updateData.checkout = endDate;
    
    // Recalculate meal charge if relevant fields changed
    if (planType || adults || startDate || endDate || roomId) {
      const room = roomId ? await Room.findById(roomId) : existing.roomId as any;
      const pricing = calculateBookingPrice({
        roomPrice: room.price,
        checkin: startDate || existing.checkin,
        checkout: endDate || existing.checkout,
        adults: adults || existing.adults || 1,
        baseOccupancy: room.baseOccupancy,
        extraPersonRate: room.extraPersonPrice,
        planType: planType || existing.planType || 'EP',
        mealRates: hotel.settings.mealRates,
        gstRates: {
          cgst: hotel.settings.taxConfig.cgst,
          sgst: hotel.settings.taxConfig.sgst
        }
      });
      updateData.mealChargeTotal = pricing.mealChargeTotal;
      const targetPlan = planType || existing.planType || 'EP';
      updateData.mealRate = (targetPlan && targetPlan.toUpperCase() !== 'EP' && targetPlan.toUpperCase() !== 'CUSTOM') ? (hotel.settings.mealRates[targetPlan.toUpperCase()] || 0) : 0;
    }

    if (paymentMethod && typeof advancePayment === 'number' && advancePayment > (existing.advancePayment || 0)) {
      const delta = advancePayment - (existing.advancePayment || 0);
      updateData.$push = {
        paymentLogs: {
          amount: delta,
          method: paymentMethod,
          date: new Date(),
          note: req.body.status === 'checked-out' ? 'Final settlement' : 'Partial payment'
        }
      };
    }

    const setFields = { ...updateData };
    delete setFields.$push; 

    const finalUpdate: any = { $set: setFields };
    if (updateData.$push) finalUpdate.$push = updateData.$push;

    const booking = await Booking.findOneAndUpdate(
      { _id: id, hotelId } as any,
      finalUpdate,
      { new: true }
    ).populate('roomId').populate('guestId', 'name phone email').populate('createdBy', 'name email');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (req.body.status === 'checked-in') {
      await Room.findByIdAndUpdate(booking.roomId, { status: 'occupied' });
    }
    if (req.body.status === 'checked-out') {
      await Room.findByIdAndUpdate(booking.roomId, { status: 'dirty' });
    }

    res.json(standardizeBooking(booking, hotel));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};


// DELETE /api/bookings/:id — Cancel a booking
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findOneAndUpdate(
      { _id: id, hotelId: req.hotelId! } as any,
      { status: 'cancelled' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ message: 'Booking cancelled', booking });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/bookings/availability
export const checkAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const checkin = req.query.checkin as string;
    const checkout = req.query.checkout as string;
    const hotelId = req.hotelId!;

    if (!checkin || !checkout) {
      return res.status(400).json({ error: 'Checkin and checkout dates are required' });
    }

    // Use standard 14:00/11:00 unless exact time is provided by query
    const ciDateStr = checkin.includes('T') ? checkin.split('T')[0] : checkin;
    const coDateStr = checkout.includes('T') ? checkout.split('T')[0] : checkout;
    const startDate = new Date(`${ciDateStr}T14:00:00`);
    const endDate = new Date(`${coDateStr}T11:00:00`);

    const [hotel, rooms] = await Promise.all([
      Hotel.findById(hotelId),
      Room.find({ hotelId })
    ]);

    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    const busyBookings = await Booking.find({
      hotelId,
      status: { $nin: ['cancelled', 'expired', 'checked-out'] },
      $or: [
        { 
          checkin: { $lt: endDate }, 
          checkout: { $gt: startDate } 
        },
        // Blocks
        {
          reservationType: 'block',
          $or: [
            { blockExpiresAt: { $gt: new Date() } },
            { blockExpiresAt: null }
          ],
          checkin: { $lt: endDate }, 
          checkout: { $gt: startDate }
        }
      ]
    } as any).populate('guestId', 'name');

    const result = rooms.map(room => {
      const roomBusy = busyBookings.find(b => b.roomId.toString() === room._id.toString());
      
      return {
        id: room._id,
        roomNumber: room.roomNumber,
        type: room.roomType,
        floor: room.floor,
        price: room.price,
        maxOccupancy: room.maxOccupancy,
        baseOccupancy: room.baseOccupancy,
        status: roomBusy ? (roomBusy.reservationType === 'block' ? 'blocked' : 'occupied') : 'available',
        checkinTime: room.checkinTime || hotel.settings.checkinTimes?.[0] || '14:00',
        checkoutTime: room.checkoutTime || hotel.settings.checkoutTimes?.[0] || '11:00',
        currentGuest: roomBusy ? { 
          name: (roomBusy.guestId as any)?.name || 'Blocked', 
          checkin: roomBusy.checkin, 
          checkout: roomBusy.checkout 
        } : null
      };
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/bookings/calendar
export const getCalendarData = async (req: AuthRequest, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    const hotelId = req.hotelId!;

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const [hotel, bookings] = await Promise.all([
      Hotel.findById(hotelId),
      Booking.find({
        hotelId,
        status: { $ne: 'cancelled' },
        checkin: { $lte: new Date(end) },
        checkout: { $gte: new Date(start) }
      } as any)
        .populate('roomId')
        .populate('guestId', 'name phone email')
        .populate('createdBy', 'name email')
    ]);

    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    res.json(bookings.map(b => standardizeBooking(b, hotel)));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/bookings/group — Atomic group booking creation
export const createGroupBooking = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { groupName, leadGuestId, billingType, checkin, checkout, rooms, planType } = req.body;
    const hotelId = req.hotelId!;
    const cTime = req.body.checkinTime || '14:00';
    const oTime = req.body.checkoutTime || '11:00';
    const ciDateStr = checkin.includes('T') ? checkin.split('T')[0] : checkin;
    const coDateStr = checkout.includes('T') ? checkout.split('T')[0] : checkout;
    const startDate = new Date(`${ciDateStr}T${cTime}:00`);
    const endDate = new Date(`${coDateStr}T${oTime}:00`);

    const [hotel, leadGuest] = await Promise.all([
      Hotel.findById(hotelId),
      mongoose.model('Guest').findById(leadGuestId)
    ]);

    if (!hotel) throw new Error('Hotel not found');
    if (!leadGuest) throw new Error('Lead guest not found');

    const groupId = new mongoose.Types.ObjectId().toString();

    await Group.create([{
      _id: groupId,
      groupName,
      leadGuestId,
      hotelId,
      billingType: billingType || 'individual',
      totalRooms: rooms.length
    }], { session });

    const bookingIds = [];
    const clashingRooms = [];

    for (const r of rooms) {
      const conflict = await hasConflict(hotelId, r.roomId, startDate, endDate);
      if (conflict) {
        clashingRooms.push(r.roomId);
        continue;
      }

      const roomDetail = await Room.findById(r.roomId);
      if (!roomDetail) throw new Error(`Room ${r.roomId} not found`);

      const pricing = calculateBookingPrice({
        roomPrice: r.price || roomDetail.price,
        checkin: startDate,
        checkout: endDate,
        adults: r.adults || 1,
        baseOccupancy: roomDetail.baseOccupancy,
        extraPersonRate: roomDetail.extraPersonPrice,
        planType: r.planType || planType || 'EP',
        mealRates: hotel.settings.mealRates,
        gstRates: {
          cgst: hotel.settings.taxConfig.cgst,
          sgst: hotel.settings.taxConfig.sgst
        }
      });

      const created = (await Booking.create([{
        hotelId,
        guestId: r.guestId || leadGuestId,
        roomId: r.roomId,
        checkin: startDate,
        checkout: endDate,
        adults: r.adults || 1,
        roomPrice: r.price || roomDetail.price,
        baseOccupancy: roomDetail.baseOccupancy,
        extraPersonPrice: roomDetail.extraPersonPrice,
        reservationType: 'group',
        planType: r.planType || planType || 'EP',
        groupId,
        mealChargeTotal: pricing.mealChargeTotal,
        createdBy: req.user?.userId,
        status: 'reserved'
      }], { session })) as any[]; 

      if (created && created[0]) {
        bookingIds.push(created[0]._id);
      }
    }

    if (clashingRooms.length > 0) {
      await session.abortTransaction();
      return res.status(409).json({ error: 'GROUP_CLASH', failedRooms: clashingRooms });
    }

    await session.commitTransaction();
    res.status(201).json({ groupId, bookingIds });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// GET /api/bookings/group/:groupId
export const getGroupBookings = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const hotelId = req.hotelId!;

    const [hotel, group, bookings] = await Promise.all([
      Hotel.findById(hotelId),
      mongoose.Types.ObjectId.isValid(groupId as string) ? Group.findOne({ _id: groupId as string, hotelId }).populate('leadGuestId', 'name phone email') : Promise.resolve(null),
      Booking.find({ groupId, hotelId })
        .populate('roomId')
        .populate('guestId', 'name phone email')
        .populate('createdBy', 'name email')
    ]);

    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    res.json({
      group,
      bookings: bookings.map(b => standardizeBooking(b, hotel))
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// PATCH /api/bookings/:id/expire — Manual expiry
export const expireBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId!;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    const booking = await Booking.findOneAndUpdate(
      { _id: id, hotelId, reservationType: { $in: ['enquiry', 'block'] } } as any,
      { 
        status: 'expired',
        enquiryExpiresAt: new Date() 
      },
      { new: true }
    ).populate('roomId').populate('guestId', 'name').populate('createdBy', 'name');

    if (!booking) return res.status(404).json({ error: 'Enquiry or Block not found' });

    res.json(standardizeBooking(booking, hotel));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// PATCH /api/bookings/group/:groupId — Update group metadata
export const updateGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { groupName, totalRooms, billingType, leadGuestId } = req.body;
    const hotelId = req.hotelId!;

    // If groupId is not a valid ObjectId, this group might be ad-hoc (string ID in bookings only)
    if (!mongoose.Types.ObjectId.isValid(groupId as string)) {
       return res.status(404).json({ error: 'Group record not found (Ad-hoc Group)' });
    }

    const group = await Group.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(groupId as string), hotelId } as any,
      { groupName, totalRooms, billingType, leadGuestId },
      { new: true }
    );

    if (!group) return res.status(404).json({ error: 'Group not found' });

    res.json(group);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
