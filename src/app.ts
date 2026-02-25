import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import logger from './utils/logger.js';
import { initSocket } from './utils/socket.util.js';

import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import guestRoutes from './routes/guestRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import housekeepingRoutes from './routes/housekeepingRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import publicRoutes from './routes/publicRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

// Security & Production Middleware
app.use(helmet());
const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // increased for dev
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);        // Public: register + login
app.use('/api/bookings', bookingRoutes); // Protected
app.use('/api/rooms', roomRoutes);       // Protected
app.use('/api/guests', guestRoutes);     // Protected
app.use('/api/billing', billingRoutes);  // Protected
app.use('/api/housekeeping', housekeepingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/public', publicRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hotel SaaS API is running' });
});

// Central Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📡 API: http://localhost:${PORT}/api`);
      logger.info(`❤️ Health: http://localhost:${PORT}/health`);
      logger.info(`🔌 WebSocket: Enabled`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
