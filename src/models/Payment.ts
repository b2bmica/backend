import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  hotelId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId;
  amount: number;
  method: 'cash' | 'card' | 'upi' | 'razorpay' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transactionId?: string;
  remarks?: string;
  date: Date;
}

const PaymentSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    amount: { type: Number, required: true },
    method: { 
      type: String, 
      enum: ['cash', 'card', 'upi', 'razorpay', 'other'],
      required: true 
    },
    status: { 
      type: String, 
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'completed' 
    },
    transactionId: { type: String },
    remarks: { type: String },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IPayment>('Payment', PaymentSchema);
