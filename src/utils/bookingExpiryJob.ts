import Booking from '../models/Booking.js';

export const startExpiryJob = () => {
  // Run every 10 minutes
  setInterval(async () => {
    try {
      const now = new Date();

      // 1. Expire Enquiries
      const expiredEnquiries = await Booking.updateMany(
        {
          reservationType: 'enquiry',
          status: 'reserved',
          enquiryExpiresAt: { $lt: now }
        },
        { $set: { status: 'expired' } }
      );

      // 2. Expire Blocks
      const expiredBlocks = await Booking.updateMany(
        {
          reservationType: 'block',
          status: 'blocked',
          blockExpiresAt: { $lt: now, $ne: null }
        },
        { $set: { status: 'expired' } }
      );

      if (expiredEnquiries.modifiedCount > 0 || expiredBlocks.modifiedCount > 0) {
        console.log(`[ExpiryJob] Expired ${expiredEnquiries.modifiedCount} enquiries and ${expiredBlocks.modifiedCount} blocks.`);
      }
    } catch (error) {
      console.error('[ExpiryJob] Error during auto-expiry check:', error);
    }
  }, 10 * 60 * 1000); 
};
