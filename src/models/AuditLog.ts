import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  hotelId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: string;
  module: string;
  details: any;
  ipAddress?: string;
}

const AuditLogSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    module: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

AuditLogSchema.index({ hotelId: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
