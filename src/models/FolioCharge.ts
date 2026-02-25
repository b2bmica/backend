import mongoose, { Schema, Document } from 'mongoose';

export interface IFolioCharge extends Document {
  hotelId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  type: 'room' | 'restaurant' | 'laundry' | 'extra-bed' | 'other';
  description: string;
  amount: number;
  taxableAmount: number;
  gstRate: number; // e.g. 12, 18
  cgst: number;
  sgst: number;
  igst: number;
  date: Date;
  isBilled: boolean;
  invoiceId?: mongoose.Types.ObjectId;
}

const FolioChargeSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    type: { 
      type: String, 
      enum: ['room', 'restaurant', 'laundry', 'extra-bed', 'other'],
      required: true 
    },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    taxableAmount: { type: Number, required: true },
    gstRate: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    isBilled: { type: Boolean, default: false },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  },
  { timestamps: true }
);

export default mongoose.model<IFolioCharge>('FolioCharge', FolioChargeSchema);
