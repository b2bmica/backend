import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:3000'],
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
