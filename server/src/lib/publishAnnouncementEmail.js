'use strict';

const { pool } = require('../db');
const { isMailConfigured, sendAdminContentAlertEmail } = require('../mail');
const { buildTestPublishDedupeKey } = require('./notificationScheduling');

function buildPublishEmailDedupeKey(testId, lastCycleStartedAt) {
  return buildTestPublishDedupeKey(testId, lastCycleStartedAt);
}

/**
 * Decide whether to queue a publish announcement email for a mock test.
 * Dedupes per catalog cycle so repeated saves do not spam users.
 */
function evaluatePublishEmailSend({
  sendEmailOnPublish,
  isPublished,
  justPublished = false,
  cycleRenewed = false,
  previousSendEmailOnPublish = false,
  dedupeKey,
  lastSentDedupeKey = '',
}) {
  if (sendEmailOnPublish !== true) {
    return { send: false, reason: 'sendEmailOnPublish_off' };
  }
  if (isPublished !== true) {
    return { send: false, reason: 'test_not_published' };
  }
  const key = String(dedupeKey || '').trim();
  const lastSent = String(lastSentDedupeKey || '').trim();
  if (key && lastSent && key === lastSent) {
    return { send: false, reason: 'already_sent_this_cycle' };
  }
  if (justPublished || cycleRenewed) {
    return { send: true, reason: justPublished ? 'just_published' : 'cycle_renewed' };
  }
  if (previousSendEmailOnPublish !== true) {
    return { send: true, reason: 'checkbox_newly_enabled' };
  }
  return { send: false, reason: 'no_trigger' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendContentAnnouncementEmails(payload) {
  if (!isMailConfigured()) {
    console.warn('content_announcement_emails_skipped', { reason: 'smtp_not_configured' });
    return { attempted: 0, sent: 0, failed: 0 };
  }
  const { rows } = await pool.query(
    `SELECT id::text AS user_id, email, display_name
     FROM users
     WHERE is_banned = false
       AND trim(COALESCE(email, '')) <> ''
       AND marketing_emails_unsubscribed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 2000`,
  );
  const gapMs = Math.max(0, Number(process.env.PUBLISH_EMAIL_GAP_MS || 100));
  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    const to = String(row.email || '').trim();
    if (!to) continue;
    try {
      await sendAdminContentAlertEmail({
        userId: String(row.user_id || '').trim(),
        to,
        displayName: String(row.display_name || '').trim(),
        kind: String(payload.kind || 'mocktest'),
        title: String(payload.title || '').trim(),
        message: String(payload.message || '').trim(),
        ctaUrl: String(payload.ctaUrl || '').trim(),
        ctaLabel: String(payload.ctaLabel || 'Open App').trim(),
      });
      sent += 1;
    } catch (mailErr) {
      failed += 1;
      console.error('content_alert_email_failed', payload.kind, to, mailErr && (mailErr.message || mailErr));
    }
    if (gapMs > 0) {
      await sleep(gapMs);
    }
  }
  console.log('content_announcement_emails_done', {
    kind: payload.kind,
    title: payload.title,
    attempted: (rows || []).length,
    sent,
    failed,
  });
  return { attempted: (rows || []).length, sent, failed };
}

/** Fire-and-forget — does not block the admin HTTP response. */
function queueContentAnnouncementEmails(payload) {
  setImmediate(() => {
    sendContentAnnouncementEmails(payload).catch((err) => {
      console.error('content_announcement_emails_failed', err && (err.message || err));
    });
  });
}

/**
 * Queue mock-test publish emails when [evaluatePublishEmailSend] allows it.
 * Returns dedupe key to persist in testAdvancedConfigs.lastPublishEmailDedupeKey.
 */
function triggerTestPublishAnnouncementEmail({
  testId,
  testTitle,
  isPublished,
  lastCycleStartedAt,
  advancedConfig,
  previousAdvancedConfig,
  justPublished = false,
  cycleRenewed = false,
}) {
  const adv = advancedConfig && typeof advancedConfig === 'object' ? advancedConfig : {};
  const prev = previousAdvancedConfig && typeof previousAdvancedConfig === 'object' ? previousAdvancedConfig : {};
  const dedupeKey = buildPublishEmailDedupeKey(testId, lastCycleStartedAt);
  const decision = evaluatePublishEmailSend({
    sendEmailOnPublish: adv.sendEmailOnPublish === true,
    isPublished,
    justPublished,
    cycleRenewed,
    previousSendEmailOnPublish: prev.sendEmailOnPublish === true,
    dedupeKey,
    lastSentDedupeKey: String(prev.lastPublishEmailDedupeKey || adv.lastPublishEmailDedupeKey || '').trim(),
  });
  if (!decision.send) {
    return { queued: false, updateDedupeKey: null, reason: decision.reason, dedupeKey };
  }
  const title = String(testTitle || 'New test').trim() || 'New test';
  queueContentAnnouncementEmails({
    kind: 'mocktest',
    title,
    message: `${title} is now live. Open the app and start your attempt.`,
    ctaUrl: String(process.env.MAIL_APP_URL || '').trim(),
    ctaLabel: 'Start Mock Test',
  });
  console.log('publish_announcement_email_queued', {
    testId: String(testId || ''),
    title,
    reason: decision.reason,
    dedupeKey,
  });
  return { queued: true, updateDedupeKey: dedupeKey || null, reason: decision.reason, dedupeKey };
}

function mergePublishEmailDedupeKey(advancedConfig, updateDedupeKey) {
  const next = advancedConfig && typeof advancedConfig === 'object' ? { ...advancedConfig } : {};
  const key = String(updateDedupeKey || '').trim();
  if (key) next.lastPublishEmailDedupeKey = key;
  return next;
}

function preserveServerAdvancedFields(nextAdvancedConfig, previousAdvancedConfig) {
  const next = nextAdvancedConfig && typeof nextAdvancedConfig === 'object' ? { ...nextAdvancedConfig } : {};
  const prev = previousAdvancedConfig && typeof previousAdvancedConfig === 'object' ? previousAdvancedConfig : {};
  if (prev.lastPublishEmailDedupeKey && !next.lastPublishEmailDedupeKey) {
    next.lastPublishEmailDedupeKey = String(prev.lastPublishEmailDedupeKey || '').trim();
  }
  return next;
}

module.exports = {
  buildPublishEmailDedupeKey,
  evaluatePublishEmailSend,
  sendContentAnnouncementEmails,
  queueContentAnnouncementEmails,
  triggerTestPublishAnnouncementEmail,
  mergePublishEmailDedupeKey,
  preserveServerAdvancedFields,
};
