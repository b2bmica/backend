import mongoose, { Schema, Document } from 'mongoose';

export interface ICounter extends Document {
  hotelId: mongoose.Types.ObjectId;
  moduleName: string;
  seq: number;
}

const CounterSchema: Schema = new Schema({
  hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true },
  moduleName: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

CounterSchema.index({ hotelId: 1, moduleName: 1 }, { unique: true });

export default mongoose.model<ICounter>('Counter', CounterSchema);
