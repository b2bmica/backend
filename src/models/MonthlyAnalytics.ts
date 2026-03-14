import mongoose, { Schema, Document } from 'mongoose';

export interface IMonthlyAnalytics extends Document {
  month: string; // Format YYYY-MM
  hotelId: mongoose.Types.ObjectId;
  totalBookings: number;
  totalRoomNights: number;
  occupancyRate: number;
  grossRevenue: number;
  netRevenue: number;
  taxAmount: number;
  adr: number;
  revPar: number;
}

const MonthlyAnalyticsSchema: Schema = new Schema(
  {
    month: { type: String, required: true },
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true },
    totalBookings: { type: Number, default: 0 },
    totalRoomNights: { type: Number, default: 0 },
    occupancyRate: { type: Number, default: 0 },
    grossRevenue: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    adr: { type: Number, default: 0 },
    revPar: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MonthlyAnalyticsSchema.index({ hotelId: 1, month: 1 }, { unique: true });

export default mongoose.model<IMonthlyAnalytics>('MonthlyAnalytics', MonthlyAnalyticsSchema);
