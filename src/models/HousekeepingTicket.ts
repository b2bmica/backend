import mongoose, { Schema, Document } from 'mongoose';

export interface IHousekeepingTicket extends Document {
  hotelId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId; // User ID with role 'housekeeping'
  status: 'pending' | 'cleaning' | 'ready';
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

const HousekeepingTicketSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { 
      type: String, 
      enum: ['pending', 'cleaning', 'ready'], 
      default: 'pending' 
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    notes: { type: String }
  },
  { timestamps: true }
);

HousekeepingTicketSchema.index({ hotelId: 1, status: 1 });

export default mongoose.model<IHousekeepingTicket>('HousekeepingTicket', HousekeepingTicketSchema);
