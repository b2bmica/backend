import { Resend } from 'resend';
import logger from './logger.js';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!resend) {
  logger.warn('RESEND_API_KEY is missing. Email functionality will be disabled.');
}

export const sendOTP = async (email: string, otp: string, type: 'signup' | 'forgot-password') => {
  try {
    const subject = type === 'signup' ? 'Verify your B2Bmica account' : 'Reset your B2Bmica password';
    const title = type === 'signup' ? 'Welcome to B2Bmica!' : 'Password reset request';
    const message = type === 'signup' 
      ? 'Please use the following OTP to verify your account:' 
      : 'We received a request to reset your password. Use the OTP below to proceed:';

    if (!resend) {
      logger.error('Attempted to send email but Resend is not configured.');
      throw new Error('Email service unconfigured');
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">${title}</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">${message}</p>
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #1e293b;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} B2Bmica. All rights reserved.</p>
        </div>
      `,
    });

    if (error) {
      logger.error('Resend email error:', error);
      throw new Error('Failed to send email');
    }

    return data;
  } catch (error) {
    logger.error('Email utility error:', error);
    throw error;
  }
};
