import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (server: HttpServer) => {
  const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173', 'http://localhost:3000'];
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected to socket:', socket.id);

    // Join hotel-specific rooms for multitenancy
    socket.on('join-hotel', (hotelId: string) => {
      socket.join(`hotel-${hotelId}`);
      console.log(`Socket ${socket.id} joined hotel room: hotel-${hotelId}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected from socket:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const notifyHotel = (hotelId: string, type: string, payload: any) => {
  if (io) {
    io.to(`hotel-${hotelId}`).emit('notification', {
      type,
      ...payload,
      timestamp: new Date()
    });
  }
};
