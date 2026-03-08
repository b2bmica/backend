import mongoose, { Schema, Document } from 'mongoose';

export interface IHotel extends Document {
  name: string;
  slug: string; // Used for direct booking URLs
  address: string;
  phone: string;
  email: string;
  gstin?: string;
  logo?: string;
  status: 'active' | 'deleted';
  deletedAt?: Date;
  settings: {
    checkinTimes: string[];
    checkoutTimes: string[];
    earlyCheckinBuffer: number;
    lateCheckoutBuffer: number;
    mealRates: Record<string, number>;
    stayPlans: Array<{
      key: string;
      label: string;
      description: string;
    }>;
    defaultEnquiryHold: number;
    defaultBlockDuration: number;
    currency: string;
    taxConfig: {
      enabled: boolean;
      cgst: number;
      sgst: number;
      igst: number;
      hsnCode: string;
    };
  };
}

const HotelSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    gstin: { type: String },
    logo: { type: String },
    status: { type: String, enum: ['active', 'deleted'], default: 'active' },
    deletedAt: { type: Date },
    settings: {
      checkinTimes: { type: [String], default: ['14:00'] },
      checkoutTimes: { type: [String], default: ['11:00'] },
      earlyCheckinBuffer: { type: Number, default: 0 },
      lateCheckoutBuffer: { type: Number, default: 0 },
      mealRates: { type: Schema.Types.Mixed, default: { CP: 350, MAP: 650, AP: 950 } },
      stayPlans: {
        type: [{
          key: String,
          label: String,
          description: String
        }],
        default: [
          { key: 'EP', label: 'Room Only', description: 'No meals included' },
          { key: 'CP', label: 'Continental Plan', description: 'Room + Breakfast' },
          { key: 'MAP', label: 'Modified American', description: 'Room + Breakfast + Dinner' },
          { key: 'AP', label: 'American Plan', description: 'Room + All Meals (B+L+D)' },
          { key: 'custom', label: 'Custom Inclusions', description: 'Specify your own package' }
        ]
      },
      defaultEnquiryHold: { type: Number, default: 240 },
      defaultBlockDuration: { type: Number, default: 1440 },
      currency: { type: String, default: 'INR' },
      taxConfig: {
        enabled: { type: Boolean, default: true },
        cgst: { type: Number, default: 6 },
        sgst: { type: Number, default: 6 },
        igst: { type: Number, default: 12 },
        hsnCode: { type: String, default: '9963' }
      }
    }
  },
  { timestamps: true }
);

export default mongoose.model<IHotel>('Hotel', HotelSchema);
