'use strict';

const nodemailer = require('nodemailer');

function isMailConfigured() {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.MAIL_FROM || '').trim();
  return Boolean(user && pass && from);
}

function createTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends a 6-digit OTP for password reset (Gmail: use an App Password with 2FA on the Google account).
 * @param {{ to: string, otp: string }} opts
 */
async function sendPasswordResetOtp(opts) {
  const to = String(opts.to || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!to || !otp) throw new Error('sendPasswordResetOtp: missing to or otp');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const subject = process.env.MAIL_SUBJECT_RESET || 'MockTestApp — password reset code';
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text: `Your password reset code is: ${otp}\n\nIt expires in 15 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Your password reset code is:</p><p style="font-size:26px;font-weight:bold;letter-spacing:4px;">${otp}</p><p>This code expires in <strong>15 minutes</strong>.</p><p>If you did not request a reset, you can ignore this email.</p>`,
  });
}

/**
 * Sends a 6-digit OTP for email verification.
 * @param {{ to: string, otp: string }} opts
 */
async function sendEmailVerificationOtp(opts) {
  const to = String(opts.to || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!to || !otp) throw new Error('sendEmailVerificationOtp: missing to or otp');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const subject = process.env.MAIL_SUBJECT_EMAIL_VERIFY || 'MockTestApp — email verification code';
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text: `Your email verification code is: ${otp}\n\nIt expires in 15 minutes.`,
    html: `<p>Your email verification code is:</p><p style="font-size:26px;font-weight:bold;letter-spacing:4px;">${otp}</p><p>This code expires in <strong>15 minutes</strong>.</p>`,
  });
}

module.exports = { isMailConfigured, sendPasswordResetOtp, sendEmailVerificationOtp };
