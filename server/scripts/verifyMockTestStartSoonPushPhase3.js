'use strict';

/**
 * Phase 3 — "notify before exam" app push (notifyBeforeMinutes > 0 only).
 *
 * Usage:
 *   node scripts/verifyMockTestStartSoonPushPhase3.js
 */
require('dotenv').config();

const assert = require('assert');
const { buildExamStartIso } = require('../src/lib/examStartTime');
const {
  buildTestStartSoonDedupeKey,
  shouldSendStartSoonPush,
  buildTestStartSoonPushPayload,
  listTestsReadyForStartSoonPush,
} = require('../src/lib/mockTestStartReminderPush');

function line(ok, msg) {
  const tag = ok ? 'OK ' : 'FAIL';
  console.log(`${tag}  ${msg}`);
  return ok;
}

let ok = true;

const startAtIso = buildExamStartIso('2026-07-08', '10:00 AM');
ok = line(Boolean(startAtIso), 'buildExamStartIso parses exam date + slot') && ok;

const startMs = Date.parse(startAtIso);
const notifyBefore = 30;
const inWindowNow = startMs - notifyBefore * 60 * 1000;
const decisionIn = shouldSendStartSoonPush({
  startAtIso,
  notifyBeforeMinutes: notifyBefore,
  nowMs: inWindowNow,
});
ok = line(decisionIn.send === true && decisionIn.reason === 'in_window', 'in_window when diff equals notifyBeforeMinutes') && ok;

const tooEarly = shouldSendStartSoonPush({
  startAtIso,
  notifyBeforeMinutes: notifyBefore,
  nowMs: startMs - 90 * 60 * 1000,
});
ok = line(tooEarly.send === false && tooEarly.reason === 'window_not_yet', 'skips when window not yet open') && ok;

const tooLate = shouldSendStartSoonPush({
  startAtIso,
  notifyBeforeMinutes: notifyBefore,
  nowMs: startMs - 10 * 60 * 1000,
});
ok = line(tooLate.send === false && tooLate.reason === 'window_passed', 'skips when window already passed') && ok;

const disabled = shouldSendStartSoonPush({
  startAtIso,
  notifyBeforeMinutes: 0,
  nowMs: inWindowNow,
});
ok = line(disabled.send === false && disabled.reason === 'notify_before_disabled', 'push requires notifyBeforeMinutes > 0') && ok;

const dedupeKey = buildTestStartSoonDedupeKey('test-uuid', startAtIso);
ok = line(dedupeKey.startsWith('test_start_soon:test-uuid:'), 'start-soon dedupe key prefix') && ok;

const payload = buildTestStartSoonPushPayload({
  testTitle: 'HP GK',
  notifyBeforeMinutes: 30,
});
ok = line(payload.title.includes('HP GK'), 'push title includes test name') && ok;
ok = line(payload.message.includes('30 minutes'), 'push message includes notify minutes') && ok;
ok = line(payload.deepLink === 'main/tests', 'push deepLink targets tests tab') && ok;

const advancedMap = {
  'abc-123': { notifyBeforeMinutes: 30 },
};
const ready = listTestsReadyForStartSoonPush(
  [
    {
      id: 'abc-123',
      title: 'HP GK',
      exam_date: '2026-07-08',
      slot_label: '10:00 AM',
    },
  ],
  advancedMap,
  inWindowNow,
);
ok = line(ready.length === 1 && ready[0].testId === 'abc-123', 'listTestsReadyForStartSoonPush selects in-window test') && ok;

const readyDisabled = listTestsReadyForStartSoonPush(
  [
    {
      id: 'abc-123',
      title: 'HP GK',
      exam_date: '2026-07-08',
      slot_label: '10:00 AM',
    },
  ],
  { 'abc-123': { notifyBeforeMinutes: 0 } },
  inWindowNow,
);
ok = line(readyDisabled.length === 0, 'list skips tests with notifyBeforeMinutes = 0') && ok;

assert.ok(ok, 'phase3 unit checks failed');

(async () => {
  console.log('=== Phase 3: mock test start-soon push verification ===\n');
  if (!process.env.DATABASE_URL) {
    console.log('INFO  DATABASE_URL unset — skipping live scheduler dry run');
    console.log('\nMOCK_TEST_START_SOON_PUSH_PHASE3_VERIFY_OK');
    return;
  }
  const { pool } = require('../src/db');
  const { runMockTestStartReminderPush } = require('../src/lib/mockTestStartReminderPush');
  try {
    const result = await runMockTestStartReminderPush({
      db: pool,
      loadAdvancedMap: async () => ({}),
      nowMs: Date.now(),
    });
    ok = line(Number.isFinite(Number(result.processed)), 'runMockTestStartReminderPush completes') && ok;
    if (!ok) {
      console.error('\nMOCK_TEST_START_SOON_PUSH_PHASE3_VERIFY_FAILED');
      process.exit(1);
    }
    console.log('\nMOCK_TEST_START_SOON_PUSH_PHASE3_VERIFY_OK');
  } finally {
    await pool.end();
  }
})().catch(async (e) => {
  console.error('mock_test_start_soon_push_phase3_verify_error', e.message || e);
  try {
    const { pool } = require('../src/db');
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
