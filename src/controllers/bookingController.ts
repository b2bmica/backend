import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';

// Helper to detect booking conflicts
const hasConflict = async (hotelId: string, roomId: string, checkin: Date, checkout: Date, excludeBookingId?: string) => {
  const query: any = {
    hotelId,
    roomId,
    // Exclude cancelled and checked-out bookings from conflict detection
    status: { $nin: ['cancelled', 'checked-out'] },
    $or: [
      { checkin: { $lt: checkout }, checkout: { $gt: checkin } }
    ]
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const existing = await Booking.findOne(query);
  return !!existing;
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

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('roomId', 'roomNumber roomType price')
        .populate('guestId', 'name phone email')
        .populate('createdBy', 'name email')
        .skip(skip).limit(limit)
        .sort({ checkin: -1 }),
      Booking.countDocuments(filter)
    ]);

    res.json({
      bookings,
      pagination: { total, page, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/bookings — Create a new booking
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, checkin, checkout, ...details } = req.body;
    const hotelId = req.hotelId!;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const conflict = await hasConflict(hotelId, roomId, new Date(checkin), new Date(checkout));
    if (conflict) {
      return res.status(409).json({ error: 'Room is already booked for these dates' });
    }

    const bookingData: any = {
      ...details,
      roomId,
      roomPrice: room.price,
      checkin,
      checkout,
      hotelId,
      createdBy: req.user?.userId
    };

    if (details.advancePayment > 0) {
      bookingData.paymentLogs = [{
        amount: details.advancePayment,
        method: details.paymentMethod || 'cash',
        date: new Date(),
        note: 'Initial advance'
      }];
    }

    const booking = await Booking.create(bookingData);

    // Populate before returning
    const populated = await Booking.findById(booking._id)
      .populate('roomId', 'roomNumber roomType price')
      .populate('guestId', 'name phone email')
      .populate('createdBy', 'name email');

    // Notify via Socket
    try {
      const { notifyHotel } = await import('../utils/socket.util.js');
      const populatedAny = populated as any;
      notifyHotel(hotelId.toString(), 'new-booking', {
        title: 'New Reservation Secured',
        message: `Guest ${populatedAny?.guestId?.name} booked Room ${populatedAny?.roomId?.roomNumber}`,
        booking: populated
      });
    } catch (err) {
      console.error('Socket notification failed:', err);
    }

    res.status(201).json(populated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// PUT /api/bookings/:id — Modify a booking (also used for check-in/check-out)
export const modifyBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { roomId, checkin, checkout, paymentMethod, advancePayment } = req.body;
    const hotelId = req.hotelId!;

    if (checkin && checkout && roomId) {
      const conflict = await hasConflict(hotelId, roomId as string, new Date(checkin), new Date(checkout), id as string);
      if (conflict) {
        return res.status(409).json({ error: 'New dates/room have a conflict' });
      }
    }

    // Fetch current booking to compute payment delta
    const existing = await Booking.findOne({ _id: id, hotelId } as any);
    
    const updateData: any = { ...req.body };
    
    // If a payment is being recorded (advancePayment increased with a paymentMethod), log it
    if (
      paymentMethod &&
      typeof advancePayment === 'number' &&
      existing &&
      advancePayment > (existing.advancePayment || 0)
    ) {
      const delta = advancePayment - (existing.advancePayment || 0);
      updateData.$push = {
        paymentLogs: {
          amount: delta,
          method: paymentMethod,
          date: new Date(),
          note: req.body.status === 'checked-out' ? 'Final settlement' : 'Partial payment'
        }
      };
      
      // We still update advancePayment as a normal field via $set
      // updateData at this point is like { roomId, ..., advancePayment: 1000 }
      // To use $push and fields in top-level together, we should be explicit
    }

    // Explicitly separate top-level fields for $set
    const setFields = { ...updateData };
    delete setFields.$push; // remove operator if it exists

    const finalUpdate: any = { $set: setFields };
    if (updateData.$push) {
      finalUpdate.$push = updateData.$push;
    }

    const booking = await Booking.findOneAndUpdate(
      { _id: id, hotelId } as any,
      finalUpdate,
      { new: true }
    ).populate('roomId', 'roomNumber roomType price')
     .populate('guestId', 'name phone email')
     .populate('createdBy', 'name email');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // If checking in, set room to occupied
    if (req.body.status === 'checked-in') {
      await Room.findByIdAndUpdate(booking.roomId, { status: 'occupied' });
    }
    // If checking out, set room to dirty and update checkout date to today if it was in the future
    if (req.body.status === 'checked-out') {
      await Room.findByIdAndUpdate(booking.roomId, { status: 'dirty' });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const originalCheckout = new Date(booking.checkout);
      originalCheckout.setHours(0, 0, 0, 0);
      
      if (today < originalCheckout) {
        // Guest is checking out early. Update the checkout record so the room is free for others.
        const dateStr = today.toISOString().split('T')[0];
        await Booking.findByIdAndUpdate(booking._id, { checkout: dateStr });
      }
    }

    res.json(booking);
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

    const startDate = new Date(checkin);
    const endDate = new Date(checkout);

    const rooms = await Room.find({ hotelId });

    const busyBookings = await Booking.find({
      hotelId,
      status: { $nin: ['cancelled', 'checked-out'] },
      $or: [
        { checkin: { $lt: endDate }, checkout: { $gt: startDate } }
      ]
    } as any);

    const busyRoomIds = busyBookings.map(b => b.roomId.toString());
    const availableRooms = rooms.filter(r => !busyRoomIds.includes(r._id.toString()));

    res.json(availableRooms);
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

    const bookings = await Booking.find({
      hotelId,
      status: { $ne: 'cancelled' },
      checkin: { $lte: new Date(end) },
      checkout: { $gte: new Date(start) }
    } as any)
      .populate('roomId', 'roomNumber roomType price')
      .populate('guestId', 'name phone email')
      .populate('createdBy', 'name email');

    res.json(bookings);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
