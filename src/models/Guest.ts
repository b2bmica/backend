import mongoose, { Schema, Document } from 'mongoose';

export interface IGuest extends Document {
  hotelId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  nationality: string;
  address?: string;
  idProof: {
    idType: 'aadhaar' | 'passport' | 'driving-license';
    number: string;
    fileUrl?: string;
  };
  stayHistory: mongoose.Types.ObjectId[]; // Array of Booking IDs
}

const GuestSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    nationality: { type: String, required: true },
    address: { type: String },
    idProof: {
      idType: { 
        type: String, 
        enum: ['aadhaar', 'passport', 'driving-license'],
      },
      number: { type: String },
      fileUrl: { type: String },
    },
    stayHistory: [{ type: Schema.Types.ObjectId, ref: 'Booking' }],
  },
  { timestamps: true }
);

// Search indexes
GuestSchema.index({ hotelId: 1, phone: 1 }, { unique: true });
GuestSchema.index({ hotelId: 1, name: 'text', email: 'text' });

export default mongoose.model<IGuest>('Guest', GuestSchema);
