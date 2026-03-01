import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  hotelId: mongoose.Types.ObjectId;
  guestId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  checkin: Date;
  checkout: Date;
  adults: number;
  children: number;
  roomPrice: number;
  baseOccupancy: number;
  extraPersonPrice: number;
  advancePayment: number;
  bookingSource: string;
  paymentMethod?: string;
  paymentLogs: Array<{ amount: number; method: string; date: Date; note?: string }>;
  status: 'reserved' | 'checked-in' | 'checked-out' | 'cancelled';
  createdBy?: mongoose.Types.ObjectId;
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
    paymentMethod: { type: String },
    paymentLogs: [{
      amount: { type: Number, required: true },
      method: { type: String, required: true },
      date: { type: Date, default: Date.now },
      note: { type: String }
    }],
    status: {
      type: String,
      enum: ['reserved', 'checked-in', 'checked-out', 'cancelled'],
      default: 'reserved',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

BookingSchema.index({ hotelId: 1, roomId: 1, checkin: 1, checkout: 1 });
BookingSchema.index({ hotelId: 1, status: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);
