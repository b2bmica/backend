import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoice extends Document {
  hotelId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  guestId: mongoose.Types.ObjectId;
  items: any[];
  subTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: 'draft' | 'paid' | 'cancelled';
  pdfUrl?: string;
  dueDate?: Date;
}

const InvoiceSchema: Schema = new Schema(
  {
    hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    invoiceNumber: { type: String, required: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'Guest', required: true },
    items: [{ type: Schema.Types.Mixed }],
    subTotal: { type: Number, required: true },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true },
    status: { 
      type: String, 
      enum: ['draft', 'paid', 'cancelled'],
      default: 'draft' 
    },
    pdfUrl: { type: String },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

InvoiceSchema.index({ hotelId: 1, invoiceNumber: 1 }, { unique: true });

export default mongoose.model<IInvoice>('Invoice', InvoiceSchema);
