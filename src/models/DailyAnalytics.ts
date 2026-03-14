import mongoose, { Schema, Document } from 'mongoose';

export interface IDailyAnalytics extends Document {
  date: Date;
  hotelId: mongoose.Types.ObjectId;
  roomsAvailable: number;
  roomsSold: number;
  occupancyRate: number;
  roomRevenue: number;
  extraPersonRevenue: number;
  mealRevenue: number;
  grossRevenue: number; // Sum of the above 3 (Pre-tax)
  taxAmount: number;
  netRevenue: number; // Currently same as grossRevenue in this PMS context if GST is tracked separately
  adr: number;
  revPar: number;
}

const DailyAnalyticsSchema: Schema = new Schema(
  {
    date: { type: Date, required: true },
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true },
    roomsAvailable: { type: Number, default: 0 },
    roomsSold: { type: Number, default: 0 },
    occupancyRate: { type: Number, default: 0 },
    roomRevenue: { type: Number, default: 0 },
    extraPersonRevenue: { type: Number, default: 0 },
    mealRevenue: { type: Number, default: 0 },
    grossRevenue: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    adr: { type: Number, default: 0 },
    revPar: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DailyAnalyticsSchema.index({ hotelId: 1, date: 1 }, { unique: true });

export default mongoose.model<IDailyAnalytics>('DailyAnalytics', DailyAnalyticsSchema);
