import type { Request, Response } from 'express';
import Room from '../models/Room.js';
import Booking from '../models/Booking.js';
import Guest from '../models/Guest.js';
import Hotel from '../models/Hotel.js';
import mongoose from 'mongoose';

export const getPublicAvailability = async (req: Request, res: Response) => {
  try {
    const { hotelSlug, checkin, checkout } = req.query;

    const hotel = await Hotel.findOne({ slug: hotelSlug as string });
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    const startDate = new Date(checkin as string);
    const endDate = new Date(checkout as string);

    // Find busy bookings
    const busyBookings = await Booking.find({
      hotelId: hotel._id,
      status: { $ne: 'cancelled' },
      $or: [
        { checkin: { $lt: endDate }, checkout: { $gt: startDate } }
      ]
    } as any);

    const busyRoomIds = busyBookings.map(b => b.roomId.toString());
    
    // Find available rooms
    const availableRooms = await Room.find({
      hotelId: hotel._id,
      status: 'available',
      _id: { $nin: busyRoomIds.map(id => new mongoose.Types.ObjectId(id)) }
    } as any);

    res.json({
      hotel: {
        name: hotel.name,
        address: hotel.address
      },
      rooms: availableRooms
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createPublicBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { hotelSlug, roomId, checkin, checkout, guestDetails } = req.body;

    const hotel = await Hotel.findOne({ slug: hotelSlug });
    if (!hotel) throw new Error('Hotel not found');

    // 1. Create/Find Guest
    let guest = await Guest.findOne({ 
      hotelId: hotel._id, 
      $or: [{ phone: guestDetails.phone }, { email: guestDetails.email }] 
    } as any);

    if (!guest) {
      const guestResult = await Guest.create([{
        hotelId: hotel._id,
        ...guestDetails
      }], { session });
      guest = guestResult[0] as any;
    }

    // 2. Create Booking
    const booking = await Booking.create([{
      hotelId: hotel._id,
      guestId: guest!._id,
      roomId,
      checkin: new Date(checkin),
      checkout: new Date(checkout),
      status: 'reserved',
      bookingSource: 'direct-web'
    } as any], { session });

    await session.commitTransaction();
    res.status(201).json(booking[0]);
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};
