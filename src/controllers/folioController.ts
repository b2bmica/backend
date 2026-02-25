import type { Response } from 'express';
import type { AuthRequest } from '../middleware/tenant.js';
import FolioCharge from '../models/FolioCharge.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Counter from '../models/Counter.js';
import Booking from '../models/Booking.js';
import mongoose from 'mongoose';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';

// Generate sequential invoice number
const getNextInvoiceNumber = async (hotelId: mongoose.Types.ObjectId) => {
  const counter = await Counter.findOneAndUpdate(
    { hotelId, moduleName: 'invoice' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const year = new Date().getFullYear().toString().slice(-2);
  return `INV-${year}-${counter!.seq.toString().padStart(5, '0')}`;
};

export const downloadInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId!;

    const invoice = await Invoice.findOne({ _id: id, hotelId } as any).populate({
      path: 'bookingId',
      populate: { path: 'guestId' }
    });

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const booking = invoice.bookingId as any;
    const guest = booking.guestId as any;

    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      guestName: guest.name,
      guestPhone: guest.phone,
      items: invoice.items,
      subTotal: invoice.subTotal,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      balanceDue: invoice.balanceDue
    });

    res.contentType("application/pdf");
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const addCharge = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const { bookingId, type, description, amount, gstRate, isInterstate } = req.body;

    // Calculate GST
    const taxableAmount = amount / (1 + (gstRate / 100));
    const totalGst = amount - taxableAmount;
    
    let cgst = 0, sgst = 0, igst = 0;
    if (isInterstate) {
      igst = totalGst;
    } else {
      cgst = totalGst / 2;
      sgst = totalGst / 2;
    }

    const charge = await FolioCharge.create({
      hotelId,
      bookingId,
      type,
      description,
      amount,
      taxableAmount,
      gstRate,
      cgst,
      sgst,
      igst,
      date: new Date()
    });

    res.status(201).json(charge);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getFolio = async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const hotelId = req.hotelId!;

    const [charges, payments] = await Promise.all([
      FolioCharge.find({ hotelId, bookingId, isBilled: false } as any),
      Payment.find({ hotelId, bookingId } as any)
    ]);

    const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      charges,
      payments,
      summary: {
        totalCharges,
        totalPayments,
        balance: totalCharges - totalPayments
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const recordPayment = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const { bookingId, amount, method, transactionId, remarks } = req.body;

    const payment = await Payment.create({
      hotelId,
      bookingId,
      amount,
      method,
      transactionId,
      remarks,
      status: 'completed'
    });

    // Notify if amount is significant
    if (amount >= 10000) {
      try {
        const { notifyHotel } = await import('../utils/socket.util.js');
        notifyHotel(hotelId.toString(), 'large-payment', {
          title: 'High-Value Payment Received',
          message: `₹${amount.toLocaleString()} settled via ${method.toUpperCase()}`,
        });
      } catch (err) {
        console.error('Socket notification failed:', err);
      }
    }

    res.status(201).json(payment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const finalizeInvoice = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const hotelId = req.hotelId!;
    const { bookingId } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, hotelId } as any).populate('guestId');
    if (!booking) throw new Error('Booking not found');

    const charges = await FolioCharge.find({ hotelId, bookingId, isBilled: false } as any).session(session);
    if (charges.length === 0) throw new Error('No unbilled charges found');

    const payments = await Payment.find({ hotelId, bookingId } as any).session(session);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    const subTotal = charges.reduce((sum, c) => sum + c.taxableAmount, 0);
    const cgst = charges.reduce((sum, c) => sum + c.cgst, 0);
    const sgst = charges.reduce((sum, c) => sum + c.sgst, 0);
    const igst = charges.reduce((sum, c) => sum + c.igst, 0);
    const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0);

    const invoiceNumber = await getNextInvoiceNumber(new mongoose.Types.ObjectId(hotelId));

    const invoice = await Invoice.create([{
      hotelId,
      bookingId,
      invoiceNumber,
      guestId: booking.guestId,
      items: charges.map(c => ({
        description: c.description,
        amount: c.amount,
        taxableAmount: c.taxableAmount,
        cgst: c.cgst,
        sgst: c.sgst,
        igst: c.igst,
        gstRate: c.gstRate
      })),
      subTotal,
      cgst,
      sgst,
      igst,
      totalAmount,
      amountPaid: totalPaid,
      balanceDue: totalAmount - totalPaid,
      status: (totalAmount - totalPaid) <= 0 ? 'paid' : 'draft'
    }], { session });

    // Mark charges as billed
    await FolioCharge.updateMany(
      { _id: { $in: charges.map(c => c._id) } },
      { $set: { isBilled: true, invoiceId: (invoice[0] as any)._id } }
    ).session(session);

    await session.commitTransaction();
    res.json(invoice[0]);
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

export const getCashierReport = async (req: AuthRequest, res: Response) => {
  try {
    const hotelId = req.hotelId!;
    const { date } = req.query;
    const start = new Date(date as string || new Date());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const payments = await Payment.find({
      hotelId,
      date: { $gte: start, $lte: end },
      status: 'completed'
    } as any);

    const report = {
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      byMethod: {
        cash: payments.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0),
        card: payments.filter(p => p.method === 'card').reduce((sum, p) => sum + p.amount, 0),
        upi: payments.filter(p => p.method === 'upi').reduce((sum, p) => sum + p.amount, 0),
        razorpay: payments.filter(p => p.method === 'razorpay').reduce((sum, p) => sum + p.amount, 0),
      },
      count: payments.length
    };

    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
