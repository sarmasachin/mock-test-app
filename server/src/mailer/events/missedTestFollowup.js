'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildMissedTestFollowupEmail } = require('../templates/missedTestFollowupTemplate');

async function sendMissedTestFollowupEmail(opts) {
  const to = String(opts?.to || '').trim();
  if (!to) throw new Error('sendMissedTestFollowupEmail: missing recipient');

  const displayName = String(opts?.displayName || 'Learner').trim();
  const testTitle = String(opts?.testTitle || 'Today Mock Test').trim();
  const missedUser = String(process.env.SMTP_MISSED_TEST_USER || process.env.SMTP_USER || '').trim();
  const missedPass = String(process.env.SMTP_MISSED_TEST_PASS || process.env.SMTP_PASS || '').trim();
  if (!missedUser || !missedPass) {
    throw new Error('Missed-test SMTP not configured (set SMTP_MISSED_TEST_USER and SMTP_MISSED_TEST_PASS)');
  }

  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || missedUser).trim();
  const subject = String(process.env.MAIL_SUBJECT_MISSED_TEST || `You Missed a Test: ${testTitle}`).trim();
  const tpl = buildMissedTestFollowupEmail({
    displayName,
    brandName: brand,
    testTitle,
    ctaLink: appUrl,
    supportEmail,
  });
  const transporter = createTransportForPrefix('SMTP_MISSED_TEST_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_MISSED_TEST || process.env.MAIL_FROM || missedUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_MISSED_TEST || process.env.MAIL_SUPPORT_EMAIL || missedUser).trim(),
    to,
    subject: subject.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendMissedTestFollowupEmail };
