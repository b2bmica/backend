import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
    if (!uri || uri.includes('<username>') || uri.includes('<password>')) {
      console.warn('⚠️ WARNING: MongoDB URI is missing or contains placeholders.');
      throw new Error('MongoDB configuration is missing. Please add MONGODB_URI to your environment variables.');
    }
    const conn = await mongoose.connect(uri);
    console.log(`🚀 MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ Database Connection Error: ${error.message}`);
    throw error;
  }
};
