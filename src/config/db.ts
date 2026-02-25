import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || '';
    if (uri.includes('<username>') || uri.includes('<password>')) {
      console.warn('⚠️ WARNING: MONGODB_URI contains placeholders. Please update your .env file with actual credentials.');
      // For development, we could fallback to local or throw a more specific error
      throw new Error('MONGODB_URI is not configured. Please add your MongoDB connection string to the .env file.');
    }
    const conn = await mongoose.connect(uri);
    console.log(`🚀 MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ Database Connection Error: ${error.message}`);
    throw error;
  }
};
