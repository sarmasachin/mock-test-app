#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — apply window gated during exam (offline + static wiring).
 *
 * Usage:
 *   node scripts/verifyExamCycleApplyWindowPhase3.js
 */

const fs = require('fs');
const path = require('path');
const { buildTestResolvePayload } = require('../src/lib/testResolve');
const {
  resolveApplyWindowState,
  isExamInProgress,
  CYCLE_MODES,
  classifyCycleMode,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const { buildExamStartMs } = require('../src/lib/examSchedule');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function row(overrides) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Test',
    slug: 'test',
    subcategory: 'GK',
    is_published: true,
    duration_minutes: 60,
    exam_date: null,
    slot_label: '',
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: new Date().toISOString(),
    capacity_total: 100,
    enrolled_count: 0,
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 3: apply window during exam ===\n');
  let ok = true;

  const hpGk = row({
    title: 'HP GK',
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-08T10:00:00.000Z',
  });

  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const duringExamMs = examStartMs + 15 * MS_PER_MINUTE;
  const beforeExamMs = examStartMs - 24 * 60 * MS_PER_MINUTE;

  ok =
    line(
      classifyCycleMode(hpGk) === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS,
      'HP GK → Mode A',
    ) && ok;
  ok = line(isExamInProgress(hpGk, duringExamMs), 'HP GK: exam in progress (mid-window)') && ok;

  const applyDuring = resolveApplyWindowState(hpGk, duringExamMs);
  ok = line(applyDuring.open === false, 'resolveApplyWindowState: closed during exam') && ok;
  ok =
    line(
      String(applyDuring.reason || '').includes('exam in progress'),
      'resolveApplyWindowState: block reason mentions exam in progress',
    ) && ok;

  const resolveDuring = buildTestResolvePayload({
    row: hpGk,
    advancedConfig: {},
    nowMs: duringExamMs,
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: false,
  });
  ok = line(resolveDuring.cyclePhase === 'live', 'buildTestResolvePayload: live during exam') && ok;
  ok = line(resolveDuring.canApply === false, 'buildTestResolvePayload: canApply=false during exam') && ok;
  ok =
    line(
      String(resolveDuring.blockReason || '').includes('exam in progress'),
      'buildTestResolvePayload: blockReason during exam',
    ) && ok;

  const resolveBefore = buildTestResolvePayload({
    row: hpGk,
    advancedConfig: {},
    nowMs: beforeExamMs,
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: false,
  });
  ok = line(resolveBefore.canApply === true, 'buildTestResolvePayload: canApply=true before exam') && ok;
  ok = line(resolveBefore.blockReason == null, 'buildTestResolvePayload: no blockReason before exam') && ok;

  const reapplyDuring = buildTestResolvePayload({
    row: hpGk,
    advancedConfig: {},
    nowMs: duringExamMs,
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: true,
  });
  ok =
    line(
      reapplyDuring.canApply === false && reapplyDuring.mayReapplyForNewCycle === false,
      'buildTestResolvePayload: re-apply blocked during exam',
    ) && ok;

  const ff = row({
    title: 'ff',
    duration_minutes: 60,
    exam_date: null,
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: '2026-07-08T18:24:08.000Z',
  });
  const ffResolve = buildTestResolvePayload({
    row: ff,
    advancedConfig: {},
    nowMs: Date.parse('2026-07-08T19:00:00.000Z'),
    alreadyAppliedInCurrentCycle: false,
  });
  ok = line(ffResolve.canApply === true, 'ff (Mode C): canApply stays open while published') && ok;

  const postExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  const postExamApply = resolveApplyWindowState(hpGk, postExamMs);
  ok =
    line(
      postExamApply.open === false,
      'HP GK: apply closed after exam until scheduler rollover',
    ) && ok;
  ok =
    line(
      String(postExamApply.reason || '').includes('preparing next cycle') ||
        String(postExamApply.reason || '').includes('ended'),
      'HP GK: post-exam block reason set',
    ) && ok;

  console.log('\n-- Static wiring --');
  const testResolveSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'testResolve.js'),
    'utf8',
  );
  const testsRouteSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'tests.js'),
    'utf8',
  );

  ok =
    line(
      testResolveSrc.includes("require('./testCycleWindow')") &&
        testResolveSrc.includes('resolveApplyWindowState'),
      'testResolve.js imports resolveApplyWindowState',
    ) && ok;
  ok =
    line(
      testResolveSrc.includes('applyWindow.open') &&
        testResolveSrc.includes('applyWindow.reason'),
      'testResolve.js gates canApply with applyWindow',
    ) && ok;
  ok =
    line(
      testsRouteSrc.includes("require('../lib/testCycleWindow')") &&
        testsRouteSrc.includes('resolveApplyWindowState(test)'),
      'tests.js POST /apply uses resolveApplyWindowState',
    ) && ok;
  ok =
    line(
      /resolveApplyWindowState\(test\)[\s\S]*may_reapply_same_test/.test(testsRouteSrc),
      'tests.js apply window gate runs before may_reapply / fresh apply',
    ) && ok;
  ok =
    line(
      /already_applied_same_test[\s\S]*resolveApplyWindowState\(test\)/.test(testsRouteSrc),
      'tests.js already-applied short-circuit stays before apply window gate',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_APPLY_WINDOW_PHASE3_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_APPLY_WINDOW_PHASE3_FAILED');
  process.exit(1);
}

main();
