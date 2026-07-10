#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — cycle rollover defers until deferred results unlock.
 *
 * Usage:
 *   node scripts/e2eCycleRolloverDeferResult.js
 */

const {
  isResultVisibilityDeferred,
  isCycleRolloverDeferEnabled,
  resolveAttemptUnlockAtMs,
  shouldDeferCycleRolloverForTest,
  parseResultUnlockEmailSettings,
} = require('../src/lib/resultUnlock');
const { shouldRunSchedulerRollover, MS_PER_MINUTE } = require('../src/lib/testCycleWindow');
const { buildExamStartMs } = require('../src/lib/examSchedule');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 3: cycle rollover defer until result unlock ===\n');
  let ok = true;

  ok = line(isResultVisibilityDeferred('immediate') === false, 'immediate is not deferred') && ok;
  ok = line(isResultVisibilityDeferred('after_result_time') === true, 'after_result_time is deferred') && ok;

  const submitMs = Date.parse('2026-07-10T16:05:00.000Z');
  const unlockMs = resolveAttemptUnlockAtMs(submitMs, null, 3);
  ok = line(unlockMs === submitMs + 3 * 60 * 60 * 1000, 'unlock = completed_at + 3h when no result_release_at') && ok;

  const fixedReleaseMs = Date.parse('2026-07-10T20:00:00.000Z');
  ok =
    line(
      resolveAttemptUnlockAtMs(submitMs, '2026-07-10T20:00:00.000Z', 3) === fixedReleaseMs,
      'unlock uses result_release_at when set',
    ) && ok;

  ok =
    line(
      shouldDeferCycleRolloverForTest({
        resultVisibility: 'immediate',
        deferEnabled: true,
        hasPendingResults: true,
      }) === false,
      'immediate test: never defer rollover for pending results',
    ) && ok;

  ok =
    line(
      shouldDeferCycleRolloverForTest({
        resultVisibility: 'after_result_time',
        deferEnabled: true,
        hasPendingResults: true,
      }) === true,
      'deferred test with pending results: defer rollover',
    ) && ok;

  ok =
    line(
      shouldDeferCycleRolloverForTest({
        resultVisibility: 'after_result_time',
        deferEnabled: true,
        hasPendingResults: false,
      }) === false,
      'deferred test, all results unlocked: allow rollover',
    ) && ok;

  ok =
    line(
      shouldDeferCycleRolloverForTest({
        resultVisibility: 'after_result_time',
        deferEnabled: false,
        hasPendingResults: true,
      }) === false,
      'flag off: legacy rollover even with pending results',
    ) && ok;

  const parsed = parseResultUnlockEmailSettings(JSON.stringify({ enabled: true, delayHours: 5 }));
  ok = line(parsed.delayHours === 5, 'parseResultUnlockEmailSettings reads delayHours') && ok;

  const hpGkRow = {
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-10',
    slot_label: '09:00 PM',
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: '2026-07-10T15:00:00.000Z',
  };
  const examStartMs = buildExamStartMs('2026-07-10', '09:00 PM');
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  ok =
    line(
      shouldRunSchedulerRollover(hpGkRow, afterExamMs) === true,
      'scheduler still wants rollover after exam end (defer is separate gate)',
    ) && ok;

  const examEndMs = examStartMs + 30 * MS_PER_MINUTE;
  const stillPendingMs = submitMs + 2 * 60 * 60 * 1000;
  ok = line(stillPendingMs < unlockMs && stillPendingMs > examEndMs, 'scenario: exam ended but result still pending') && ok;

  ok = line(isCycleRolloverDeferEnabled() === true, 'defer enabled by default (env unset)') && ok;

  console.log('');
  console.log('Integration: hasPendingDeferredResultsInCycle runs in processTestCycleAutoReschedule');
  console.log('  when resultVisibility=after_result_time and unlock_at > now().');
  console.log('');
  if (ok) {
    console.log('E2E_CYCLE_ROLLOVER_DEFER_RESULT_PHASE3_OK');
    process.exit(0);
  }
  console.error('E2E_CYCLE_ROLLOVER_DEFER_RESULT_PHASE3_FAILED');
  process.exit(1);
}

main();
