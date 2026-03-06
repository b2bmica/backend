import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
  id: string; // UUID
  groupName: string;
  leadGuestId: mongoose.Types.ObjectId;
  hotelId: mongoose.Types.ObjectId;
  billingType: 'group' | 'individual';
  totalRooms: number;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema: Schema = new Schema(
  {
    groupName: { type: String, required: true },
    leadGuestId: { type: Schema.Types.ObjectId, ref: 'Guest', required: true },
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    billingType: { 
      type: String, 
      enum: ['group', 'individual'], 
      default: 'individual' 
    },
    totalRooms: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IGroup>('Group', GroupSchema);
