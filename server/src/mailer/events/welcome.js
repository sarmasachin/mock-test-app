'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildWelcomeEmail } = require('../templates/welcomeTemplate');

async function sendWelcomeEmail(opts) {
  const to = String(opts?.to || '').trim();
  const displayName = String(opts?.displayName || 'User').trim();
  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const welcomeUser = String(process.env.SMTP_WELCOME_USER || process.env.SMTP_USER || '').trim();
  const welcomePass = String(process.env.SMTP_WELCOME_PASS || process.env.SMTP_PASS || '').trim();
  if (!welcomeUser || !welcomePass) {
    throw new Error('Welcome SMTP not configured (set SMTP_WELCOME_USER and SMTP_WELCOME_PASS)');
  }
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || welcomeUser).trim();
  const appUrl = String(process.env.MAIL_APP_URL || '').trim();
  const ctaLink = appUrl || 'https://play.google.com/store';
  const ctaLabel = appUrl ? 'Open Dashboard' : 'Start Your First Test';
  const subject = String(process.env.MAIL_SUBJECT_WELCOME || `Welcome to ${brand}`).trim();
  const transporter = createTransportForPrefix('SMTP_WELCOME_');
  const tpl = buildWelcomeEmail({ displayName, brandName: brand, ctaLink, ctaLabel, supportEmail });
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_WELCOME || process.env.MAIL_FROM || welcomeUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_WELCOME || process.env.MAIL_SUPPORT_EMAIL || welcomeUser).trim(),
    to,
    subject,
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendWelcomeEmail };
