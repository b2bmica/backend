import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import HousekeepingTicket from '../models/HousekeepingTicket.js';
import MaintenanceTicket from '../models/MaintenanceTicket.js';
import Room from '../models/Room.js';

export const getHousekeepingBoard = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const tickets = await HousekeepingTicket.find({ hotelId } as any)
      .populate('roomId', 'roomNumber roomType status')
      .populate('assignedTo', 'name')
      .sort({ priority: -1, createdAt: 1 });
    
    res.json(tickets);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createCleaningTicket = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const { roomId, priority, notes } = req.body;

    const ticket = await HousekeepingTicket.create({
      hotelId,
      roomId,
      priority,
      notes,
      status: 'pending'
    });

    // Update room status to "dirty" or "cleaning" if not already
    await Room.findByIdAndUpdate(roomId, { status: 'dirty' });

    res.status(201).json(ticket);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const assignCleaningTask = async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId, userId } = req.body;
    const hotelId = req.hotelId!;

    const ticket = await HousekeepingTicket.findOneAndUpdate(
      { _id: ticketId, hotelId } as any,
      { assignedTo: userId, status: 'pending' },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateCleaningStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // pending, cleaning, ready
    const hotelId = req.hotelId!;

    const ticket = await HousekeepingTicket.findOneAndUpdate(
      { _id: id, hotelId } as any,
      { status },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // If status is "ready", update the actual Room model to "clean"
    if (status === 'ready') {
      await Room.findByIdAndUpdate(ticket.roomId, { status: 'available' });
    } else if (status === 'cleaning') {
      await Room.findByIdAndUpdate(ticket.roomId, { status: 'cleaning' });
    }

    res.json(ticket);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createMaintenanceTicket = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const { roomId, issue, priority } = req.body;

    const ticket = await MaintenanceTicket.create({
      hotelId,
      roomId,
      issue,
      priority,
      reportedBy: req.user?.userId,
      status: 'pending'
    });

    // Update room status to denote maintenance if priority is urgent
    if (priority === 'urgent') {
      await Room.findByIdAndUpdate(roomId, { status: 'maintenance' });
    }

    // Populate for context
    const populated = await MaintenanceTicket.findById(ticket._id).populate('roomId', 'roomNumber');

    // Notify via Socket
    try {
      const { notifyHotel } = await import('../utils/socket.util.js');
      const populatedAny = populated as any;
      notifyHotel(hotelId.toString(), 'maintenance-alert', {
        title: priority === 'urgent' ? 'CRITICAL: Asset Breakdown' : 'New Maintenance Logged',
        message: `Issue in Room ${populatedAny?.roomId?.roomNumber}: ${issue}`,
        priority
      });
    } catch (err) {
      console.error('Socket notification failed:', err);
    }

    res.status(201).json(ticket);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getMaintenanceTickets = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const tickets = await MaintenanceTicket.find({ hotelId } as any)
      .populate('roomId', 'roomNumber')
      .populate('reportedBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json(tickets);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateMaintenanceStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const hotelId = req.hotelId!;

    const ticket = await MaintenanceTicket.findOneAndUpdate(
      { _id: id, hotelId } as any,
      { status },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // If resolved, and it was urgent, maybe set room back to dirty or cleaning?
    // Let's set it to 'dirty' so housekeeping can check it
    if (status === 'resolved') {
      await Room.findByIdAndUpdate(ticket.roomId, { status: 'dirty' });
    }

    res.json(ticket);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
