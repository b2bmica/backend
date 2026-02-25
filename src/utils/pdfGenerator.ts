import puppeteer from 'puppeteer';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateInvoicePDF = async (invoiceData: any) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();

  // Basic HTML template for invoice - in a real app, this would be in a separate .ejs file
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .invoice-title { font-size: 30px; font-weight: bold; color: #1a56db; }
        .details { margin-top: 30px; display: flex; justify-content: space-between; }
        .table { width: 100%; border-collapse: collapse; margin-top: 40px; }
        .table th { background: #f9fafb; text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
        .table td { padding: 12px; border-bottom: 1px solid #eee; }
        .totals { margin-top: 40px; float: right; width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
        .grand-total { font-weight: bold; font-size: 18px; color: #1a56db; border-top: 2px solid #eee; padding-top: 10px; }
        .footer { margin-top: 100px; text-align: center; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="invoice-title">INVOICE</div>
          <div># <%= invoiceNumber %></div>
          <div>Date: <%= new Date().toLocaleDateString() %></div>
        </div>
        <div style="text-align: right;">
          <strong>Hotel Grand Resort & Spa</strong><br>
          123 Beach Road, Goa<br>
          GSTIN: 30AAAAA0000A1Z5
        </div>
      </div>

      <div class="details">
        <div>
          <strong>Billed To:</strong><br>
          <%= guestName %><br>
          Phone: <%= guestPhone %>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Base Amount</th>
            <th style="text-align: right;">GST Rate</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          <% items.forEach(item => { %>
            <tr>
              <td><%= item.description %></td>
              <td style="text-align: right;"><%= item.taxableAmount.toFixed(2) %></td>
              <td style="text-align: right;"><%= item.gstRate %>%</td>
              <td style="text-align: right;"><%= item.amount.toFixed(2) %></td>
            </tr>
          <% }) %>
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row"><span>Subtotal:</span> <span><%= subTotal.toFixed(2) %></span></div>
        <div class="total-row"><span>CGST:</span> <span><%= cgst.toFixed(2) %></span></div>
        <div class="total-row"><span>SGST:</span> <span><%= sgst.toFixed(2) %></span></div>
        <div class="total-row"><span>IGST:</span> <span><%= igst.toFixed(2) %></span></div>
        <div class="total-row grand-total"><span>Grand Total:</span> <span><%= totalAmount.toFixed(2) %></span></div>
        <div class="total-row"><span>Amount Paid:</span> <span><%= amountPaid.toFixed(2) %></span></div>
        <div class="total-row"><span>Balance Due:</span> <span><%= balanceDue.toFixed(2) %></span></div>
      </div>

      <div class="footer">
        This is a computer generated invoice and does not require a signature.
      </div>
    </body>
    </html>
  `;

  const renderedHtml = ejs.render(htmlTemplate, invoiceData);
  await page.setContent(renderedHtml);
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

  await browser.close();
  return pdfBuffer;
};
