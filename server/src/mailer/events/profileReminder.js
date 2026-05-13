'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildProfileReminderEmail } = require('../templates/profileReminderTemplate');
const { marketingFooterAppend } = require('../emailMarketingFooter');
const { buildMarketingUnsubscribeUrl } = require('../../lib/marketingEmailUnsubscribe');

async function sendCompleteProfileReminderEmail(opts) {
  const to = String(opts?.to || '').trim();
  const displayName = String(opts?.displayName || 'Learner').trim();
  const reminderUser = String(process.env.SMTP_PROFILE_REMINDER_USER || process.env.SMTP_USER || '').trim();
  const reminderPass = String(process.env.SMTP_PROFILE_REMINDER_PASS || process.env.SMTP_PASS || '').trim();
  if (!reminderUser || !reminderPass) {
    throw new Error(
      'Profile reminder SMTP not configured (set SMTP_PROFILE_REMINDER_USER and SMTP_PROFILE_REMINDER_PASS)',
    );
  }

  const transporter = createTransportForPrefix('SMTP_PROFILE_REMINDER_');
  const brandName = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const profileDeepLink = String(process.env.MAIL_COMPLETE_PROFILE_DEEP_LINK || 'mocktestapp://complete-profile').trim();
  const ctaLink = profileDeepLink || appUrl || 'https://play.google.com/store';
  const fallbackLink = appUrl || 'https://play.google.com/store';
  const subject = String(process.env.MAIL_SUBJECT_PROFILE_REMINDER || `Complete your profile on ${brandName}`).trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || reminderUser).trim();
  let tpl = buildProfileReminderEmail({ displayName, brandName, ctaLink, fallbackLink, supportEmail });
  tpl = marketingFooterAppend(tpl, {
    unsubscribeUrl: buildMarketingUnsubscribeUrl(opts.userId),
    brandName,
  });

  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_PROFILE_REMINDER || process.env.MAIL_FROM || reminderUser).trim(),
    replyTo: String(
      process.env.MAIL_REPLY_TO_PROFILE_REMINDER || process.env.MAIL_SUPPORT_EMAIL || reminderUser,
    ).trim(),
    to,
    subject,
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendCompleteProfileReminderEmail };
