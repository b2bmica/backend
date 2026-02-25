import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  hotelId: mongoose.Types.ObjectId;
  roomNumber: string;
  roomType: string;
  amenities: string[];
  price: number;
  status: 'clean' | 'dirty' | 'occupied' | 'maintenance';
}

const RoomSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    roomNumber: { type: String, required: true },
    roomType: { type: String, required: true },
    amenities: [{ type: String }],
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ['clean', 'dirty', 'occupied', 'maintenance'],
      default: 'clean',
    },
  },
  { timestamps: true }
);

// Compound index for fast lookup within a hotel
RoomSchema.index({ hotelId: 1, roomNumber: 1 }, { unique: true });

export default mongoose.model<IRoom>('Room', RoomSchema);
