import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  hotelId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: 'Super Admin' | 'Manager' | 'Front Desk' | 'Housekeeping' | 'Deactivated';
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true, select: false },
    role: { 
      type: String, 
      enum: ['Super Admin', 'Manager', 'Front Desk', 'Housekeeping', 'Deactivated'],
      default: 'Front Desk' 
    },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });

// Hash password before save — using async/await without calling next()
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password as string, salt);
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password as string);
};

export default mongoose.model<IUser>('User', UserSchema);
