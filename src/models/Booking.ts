import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  hotelId: mongoose.Types.ObjectId;
  guestId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  checkin: Date;
  checkout: Date;
  adults: number;
  children: number;
  roomPrice: number; // Snapshot of price at booking
  baseOccupancy: number; // Snapshot
  extraPersonPrice: number; // Snapshot
  advancePayment: number;
  bookingSource: string;
  status: 'reserved' | 'checked-in' | 'checked-out' | 'cancelled';
}

const BookingSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'Guest', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    checkin: { type: Date, required: true },
    checkout: { type: Date, required: true },
    adults: { type: Number, default: 1 },
    children: { type: Number, default: 0 },
    roomPrice: { type: Number, default: 0 },
    baseOccupancy: { type: Number, default: 2 },
    extraPersonPrice: { type: Number, default: 0 },
    advancePayment: { type: Number, default: 0 },
    bookingSource: { type: String, default: 'direct' },
    status: {
      type: String,
      enum: ['reserved', 'checked-in', 'checked-out', 'cancelled'],
      default: 'reserved',
    },
  },
  { timestamps: true }
);

// Index for conflict detection: Query by hotel/room and overlapping dates
BookingSchema.index({ hotelId: 1, roomId: 1, checkin: 1, checkout: 1 });
BookingSchema.index({ hotelId: 1, status: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);
