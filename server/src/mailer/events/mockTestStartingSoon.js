'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildMockTestStartingSoonEmail } = require('../templates/mockTestStartingSoonTemplate');

async function sendMockTestStartingSoonEmail(opts) {
  const to = String(opts?.to || '').trim();
  if (!to) throw new Error('sendMockTestStartingSoonEmail: missing recipient');

  const displayName = String(opts?.displayName || 'Learner').trim();
  const testTitle = String(opts?.testTitle || 'Mock Test').trim();
  const examDate = String(opts?.examDate || '').trim();
  const slotLabel = String(opts?.slotLabel || '').trim();
  const startAtIso = String(opts?.startAtIso || '').trim();
  const mockStartUser = String(process.env.SMTP_MOCK_START_USER || process.env.SMTP_USER || '').trim();
  const mockStartPass = String(process.env.SMTP_MOCK_START_PASS || process.env.SMTP_PASS || '').trim();
  if (!mockStartUser || !mockStartPass) {
    throw new Error('Mock-start SMTP not configured (set SMTP_MOCK_START_USER and SMTP_MOCK_START_PASS)');
  }

  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || mockStartUser).trim();
  const subject = String(process.env.MAIL_SUBJECT_MOCK_STARTING_SOON || `Starting Soon: ${testTitle}`).trim();
  const tpl = buildMockTestStartingSoonEmail({
    displayName,
    brandName: brand,
    testTitle,
    examDate,
    slotLabel,
    startAtIso,
    ctaLink: appUrl,
    supportEmail,
  });
  const transporter = createTransportForPrefix('SMTP_MOCK_START_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_MOCK_START || process.env.MAIL_FROM || mockStartUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_MOCK_START || process.env.MAIL_SUPPORT_EMAIL || mockStartUser).trim(),
    to,
    subject: subject.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendMockTestStartingSoonEmail };
