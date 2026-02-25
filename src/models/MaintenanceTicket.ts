import mongoose, { Schema, Document } from 'mongoose';

export interface IMaintenanceTicket extends Document {
  hotelId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  issue: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in-progress' | 'resolved' | 'on-hold';
  reportedBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
}

const MaintenanceTicketSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    issue: { type: String, required: true },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'urgent'], 
      default: 'medium' 
    },
    status: { 
      type: String, 
      enum: ['pending', 'in-progress', 'resolved', 'on-hold'], 
      default: 'pending' 
    },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

MaintenanceTicketSchema.index({ hotelId: 1, status: 1 });

export default mongoose.model<IMaintenanceTicket>('MaintenanceTicket', MaintenanceTicketSchema);
