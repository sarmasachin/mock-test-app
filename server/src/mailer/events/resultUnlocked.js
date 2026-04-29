'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildResultUnlockedEmail } = require('../templates/resultUnlockedTemplate');

async function sendResultUnlockedEmail(opts) {
  const to = String(opts?.to || '').trim();
  const displayName = String(opts?.displayName || 'Learner').trim();
  const testTitle = String(opts?.testTitle || 'Mock Test').trim();
  const resultUser = String(process.env.SMTP_RESULT_UNLOCKED_USER || process.env.SMTP_USER || '').trim();
  const resultPass = String(process.env.SMTP_RESULT_UNLOCKED_PASS || process.env.SMTP_PASS || '').trim();
  if (!resultUser || !resultPass) {
    throw new Error(
      'Result unlocked SMTP not configured (set SMTP_RESULT_UNLOCKED_USER and SMTP_RESULT_UNLOCKED_PASS)',
    );
  }
  if (!to) throw new Error('sendResultUnlockedEmail: missing recipient');

  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || resultUser).trim();
  const tpl = buildResultUnlockedEmail({
    displayName,
    testTitle,
    correct: Number(opts?.correct || 0),
    total: Number(opts?.total || 0),
    rank: Number(opts?.rank || 0),
    participants: Number(opts?.participants || 0),
    unlockAtIso: String(opts?.unlockAtIso || '').trim(),
    appUrl,
    supportEmail,
  });
  const transporter = createTransportForPrefix('SMTP_RESULT_UNLOCKED_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_RESULT_UNLOCKED || process.env.MAIL_FROM || resultUser).trim(),
    replyTo: String(
      process.env.MAIL_REPLY_TO_RESULT_UNLOCKED || process.env.MAIL_SUPPORT_EMAIL || resultUser,
    ).trim(),
    to,
    subject: `Result Unlocked: ${testTitle}`.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendResultUnlockedEmail };
