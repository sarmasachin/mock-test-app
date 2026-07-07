'use strict';

const { pool } = require('../db');
const { buildExamStartIso } = require('./examStartTime');
const { normalizeDeliveryDedupeKey, sendPushToAudience } = require('./pushAudienceDelivery');

const TEST_START_SOON_DEDUPE_PREFIX = 'test_start_soon:';
const DEFAULT_WINDOW_TOLERANCE_MINUTES = 5;

function normalizeStartAtIsoForDedupe(startAtIso) {
  const ms = Date.parse(String(startAtIso || '').trim());
  if (!Number.isFinite(ms)) return '';
  return new Date(Math.floor(ms / 1000) * 1000).toISOString();
}

function buildTestStartSoonDedupeKey(testId, startAtIso) {
  const id = String(testId || '').trim();
  const startBucket = normalizeStartAtIsoForDedupe(startAtIso);
  if (!id || !startBucket) return '';
  return normalizeDeliveryDedupeKey(`${TEST_START_SOON_DEDUPE_PREFIX}${id}:${startBucket}`);
}

/**
 * Push fires only when admin set notifyBeforeMinutes > 0 (unlike email which defaults to 60).
 */
function shouldSendStartSoonPush({
  startAtIso,
  notifyBeforeMinutes,
  nowMs = Date.now(),
  toleranceMinutes = DEFAULT_WINDOW_TOLERANCE_MINUTES,
}) {
  const notifyBefore = Math.max(0, Math.floor(Number(notifyBeforeMinutes || 0)));
  if (notifyBefore <= 0) {
    return { send: false, reason: 'notify_before_disabled' };
  }
  const startMs = Date.parse(String(startAtIso || '').trim());
  if (!Number.isFinite(startMs)) {
    return { send: false, reason: 'invalid_start_at' };
  }
  const tolerance = Math.max(1, Math.min(30, Math.floor(Number(toleranceMinutes || DEFAULT_WINDOW_TOLERANCE_MINUTES))));
  const diffMin = (startMs - nowMs) / 60000;
  if (diffMin < notifyBefore - tolerance) {
    return { send: false, reason: 'window_passed', diffMin, notifyBefore };
  }
  if (diffMin > notifyBefore + tolerance) {
    return { send: false, reason: 'window_not_yet', diffMin, notifyBefore };
  }
  return { send: true, reason: 'in_window', diffMin, notifyBefore };
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  const key = String(testId || '').trim();
  if (!key || !advancedMap || typeof advancedMap !== 'object') return null;
  if (advancedMap[key] && typeof advancedMap[key] === 'object') return advancedMap[key];
  const lower = key.toLowerCase();
  for (const [mapKey, value] of Object.entries(advancedMap)) {
    if (String(mapKey).trim().toLowerCase() === lower && value && typeof value === 'object') {
      return value;
    }
  }
  return null;
}

function buildTestStartSoonPushPayload({ testTitle, notifyBeforeMinutes }) {
  const name = String(testTitle || 'Mock Test').trim() || 'Mock Test';
  const minutes = Math.max(1, Math.floor(Number(notifyBeforeMinutes || 0)));
  const minuteLabel = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return {
    title: `${name} starts soon`,
    message: `Your test starts in ${minuteLabel}. Open the app to get ready.`,
    target: 'all',
    deepLink: 'main/tests',
  };
}

/**
 * @returns {Array<{ testId: string, testTitle: string, startAtIso: string, notifyBeforeMinutes: number, dedupeKey: string }>}
 */
function listTestsReadyForStartSoonPush(testRows, advancedMap, nowMs = Date.now(), toleranceMinutes = DEFAULT_WINDOW_TOLERANCE_MINUTES) {
  const ready = [];
  for (const raw of Array.isArray(testRows) ? testRows : []) {
    const testRow = raw || {};
    const testId = String(testRow.id || '').trim();
    if (!testId) continue;
    const startAtIso = buildExamStartIso(testRow.exam_date, testRow.slot_label);
    if (!startAtIso) continue;
    const adv = resolveAdvancedConfigForTest(advancedMap, testId) || {};
    const notifyBeforeMinutes = Math.max(0, Math.floor(Number(adv.notifyBeforeMinutes || 0)));
    const decision = shouldSendStartSoonPush({
      startAtIso,
      notifyBeforeMinutes,
      nowMs,
      toleranceMinutes,
    });
    if (!decision.send) continue;
    const dedupeKey = buildTestStartSoonDedupeKey(testId, startAtIso);
    if (!dedupeKey) continue;
    ready.push({
      testId,
      testTitle: String(testRow.title || 'Mock Test').trim() || 'Mock Test',
      startAtIso,
      notifyBeforeMinutes,
      dedupeKey,
    });
  }
  return ready;
}

/**
 * Send "test starting soon" app pushes for tests in the notifyBeforeMinutes window.
 * Per-user dedupe is enforced via user_push_deliveries (Phase 2).
 */
async function runMockTestStartReminderPush({
  db = pool,
  loadAdvancedMap,
  nowMs = Date.now(),
  toleranceMinutes = DEFAULT_WINDOW_TOLERANCE_MINUTES,
} = {}) {
  const advancedMap =
    typeof loadAdvancedMap === 'function'
      ? await loadAdvancedMap(db)
      : {};

  const testsRes = await db.query(
    `SELECT id::text AS id, title, exam_date, slot_label
     FROM tests
     WHERE is_published = true
       AND exam_date IS NOT NULL
       AND trim(COALESCE(slot_label, '')) <> ''
       AND exam_date BETWEEN (now()::date - interval '1 day') AND (now()::date + interval '2 days')
     ORDER BY exam_date ASC
     LIMIT 120`,
  );

  const ready = listTestsReadyForStartSoonPush(testsRes.rows || [], advancedMap, nowMs, toleranceMinutes);
  const outcomes = [];

  for (const item of ready) {
    const payload = buildTestStartSoonPushPayload({
      testTitle: item.testTitle,
      notifyBeforeMinutes: item.notifyBeforeMinutes,
    });
    const result = await sendPushToAudience({
      title: payload.title,
      message: payload.message,
      target: payload.target,
      deepLink: payload.deepLink,
      dedupeKey: item.dedupeKey,
      db,
    });
    outcomes.push({
      testId: item.testId,
      testTitle: item.testTitle,
      startAtIso: item.startAtIso,
      notifyBeforeMinutes: item.notifyBeforeMinutes,
      dedupeKey: item.dedupeKey,
      sent: Number(result.sent || 0),
      failed: Number(result.failed || 0),
      skipped: Number(result.skipped || 0),
      eligible: Number(result.eligible || result.total || 0),
    });
    console.log('mock_test_start_reminder_push', {
      testId: item.testId,
      title: item.testTitle,
      notifyBeforeMinutes: item.notifyBeforeMinutes,
      dedupeKey: item.dedupeKey,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      eligible: result.eligible,
    });
  }

  return { processed: ready.length, outcomes };
}

module.exports = {
  TEST_START_SOON_DEDUPE_PREFIX,
  DEFAULT_WINDOW_TOLERANCE_MINUTES,
  normalizeStartAtIsoForDedupe,
  buildTestStartSoonDedupeKey,
  shouldSendStartSoonPush,
  buildTestStartSoonPushPayload,
  listTestsReadyForStartSoonPush,
  runMockTestStartReminderPush,
};
