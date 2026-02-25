import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import Room from '../models/Room.js';

export const getRooms = async (req: AuthRequest, res: Response) => {
  try {
    const rooms = await Room.find({ hotelId: req.hotelId! }).sort({ roomNumber: 1 });
    res.json(rooms);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const room = await Room.create({ ...req.body, hotelId: req.hotelId! });
    res.status(201).json(room);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ error: `Room ${req.body.roomNumber} already exists` });
    }
    res.status(400).json({ error: error.message });
  }
};

export const updateRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await Room.findOneAndUpdate(
      { _id: id, hotelId: req.hotelId! } as any,
      req.body,
      { new: true }
    );
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await Room.findOneAndDelete({ _id: id, hotelId: req.hotelId! } as any);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ message: 'Room deleted', room });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateRoomStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const room = await Room.findOneAndUpdate(
      { _id: id, hotelId: req.hotelId! } as any,
      { status },
      { new: true }
    );
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
