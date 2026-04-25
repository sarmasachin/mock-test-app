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
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const otpPretty = otp.split('').join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Please contact support.';
  const subject = process.env.MAIL_SUBJECT_RESET || 'MockTestApp — password reset code';
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text:
      `Reset your password for ${brandName}.\n\n` +
      `Here is your ${brandName} password reset code: ${otp}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `If you did not request this reset, you can safely ignore this email.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:10px;padding:28px;">
          <p style="margin:0 0 10px 0;font-size:30px;line-height:1.2;font-weight:600;">Password reset requested,</p>
          <p style="margin:0 0 20px 0;font-size:40px;line-height:1.15;font-weight:700;">${brandName}</p>
          <div style="border:1px solid #d0d7de;border-radius:8px;padding:22px 20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:20px;line-height:1.4;">Here is your <strong>${brandName}</strong> password reset code:</p>
            <p style="margin:0 0 16px 0;font-size:50px;line-height:1.1;font-weight:700;letter-spacing:0.28em;">${otpPretty}</p>
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">If you did not request this reset, you can safely ignore this email.</p>
            <p style="margin:0;font-size:18px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:15px;line-height:1.5;color:#57606a;">
            You're receiving this email because a password reset was requested for your ${brandName} account.
            If this wasn't you, no further action is needed.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.5;color:#57606a;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
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
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const otpPretty = otp.split('').join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Please contact support.';
  const subject = process.env.MAIL_SUBJECT_EMAIL_VERIFY || 'MockTestApp — email verification code';
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text:
      `Please verify your identity for ${brandName}.\n\n` +
      `Here is your ${brandName} verification code: ${otp}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:10px;padding:28px;">
          <p style="margin:0 0 10px 0;font-size:30px;line-height:1.2;font-weight:600;">Please verify your identity,</p>
          <p style="margin:0 0 20px 0;font-size:40px;line-height:1.15;font-weight:700;">${brandName}</p>
          <div style="border:1px solid #d0d7de;border-radius:8px;padding:22px 20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:20px;line-height:1.4;">Here is your <strong>${brandName}</strong> authentication code:</p>
            <p style="margin:0 0 16px 0;font-size:50px;line-height:1.1;font-weight:700;letter-spacing:0.28em;">${otpPretty}</p>
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0;font-size:18px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:15px;line-height:1.5;color:#57606a;">
            You're receiving this email because a verification code was requested for your ${brandName} account.
            If this wasn't you, please ignore this email.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.5;color:#57606a;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = { isMailConfigured, sendPasswordResetOtp, sendEmailVerificationOtp };
