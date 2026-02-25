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
    checkinTime: string;
    checkoutTime: string;
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
      checkinTime: { type: String, default: '12:00 PM' },
      checkoutTime: { type: String, default: '11:00 AM' },
      currency: { type: String, default: 'INR' },
      taxConfig: {
        enabled: { type: Boolean, default: true },
        cgst: { type: Number, default: 6 }, // 12% total GST is common
        sgst: { type: Number, default: 6 },
        igst: { type: Number, default: 12 },
        hsnCode: { type: String, default: '9963' } // HSN for Accommodation services
      }
    }
  },
  { timestamps: true }
);

export default mongoose.model<IHotel>('Hotel', HotelSchema);
