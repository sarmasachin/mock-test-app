'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildBirthdayEmail } = require('../templates/birthdayTemplate');

async function sendBirthdayEmail(opts) {
  const to = String(opts?.to || '').trim();
  if (!to) throw new Error('sendBirthdayEmail: missing recipient');

  const displayName = String(opts?.displayName || 'Learner').trim();
  const birthdayUser = String(process.env.SMTP_BIRTHDAY_USER || process.env.SMTP_USER || '').trim();
  const birthdayPass = String(process.env.SMTP_BIRTHDAY_PASS || process.env.SMTP_PASS || '').trim();
  if (!birthdayUser || !birthdayPass) {
    throw new Error('Birthday SMTP not configured (set SMTP_BIRTHDAY_USER and SMTP_BIRTHDAY_PASS)');
  }

  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || birthdayUser).trim();
  const subject = String(process.env.MAIL_SUBJECT_BIRTHDAY || 'Happy Birthday from MockTestApp').trim();
  const tpl = buildBirthdayEmail({
    displayName,
    brandName: brand,
    ctaLink: appUrl,
    supportEmail,
  });

  const transporter = createTransportForPrefix('SMTP_BIRTHDAY_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_BIRTHDAY || process.env.MAIL_FROM || birthdayUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_BIRTHDAY || process.env.MAIL_SUPPORT_EMAIL || birthdayUser).trim(),
    to,
    subject: subject.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendBirthdayEmail };
