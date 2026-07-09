#!/usr/bin/env node
'use strict';

/**
 * Phase 2 verify — GET /tests/my-applications + GET /tests/resolve API consistency.
 *
 * Usage:
 *   node scripts/verifyExamCycleMyApplicationsPhase2.js
 */

const fs = require('fs');
const path = require('path');
const {
  evaluateApplicationCycleState,
  buildMyTestApplicationItem,
  shouldSyncMyApplicationToLocalAppliedSeries,
} = require('../src/lib/testApplicationCycle');
const { buildTestResolvePayload } = require('../src/lib/testResolve');
const { buildExamStartMs } = require('../src/lib/examSchedule');
const { MS_PER_MINUTE } = require('../src/lib/testCycleWindow');

const TEST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function row(overrides) {
  return {
    id: TEST_ID,
    title: 'Phase2 Test',
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-01T10:00:00.000Z',
    capacity_total: 100,
    enrolled_count: 8,
    slot_label: '10:00 am',
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 2: my-applications / resolve API consistency ===\n');
  let ok = true;

  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  const appliedAtIso = new Date(examStartMs - 60 * 60 * 1000).toISOString();
  const afterBump = row({
    last_cycle_started_at: new Date(afterExamMs).toISOString(),
    exam_date: '2026-07-20',
    enrolled_count: 0,
  });

  const currentState = evaluateApplicationCycleState(row(), appliedAtIso, examStartMs);
  const currentItem = buildMyTestApplicationItem({
    row: row(),
    appliedAtIso,
    cycleState: currentState,
    cyclePhase: 'live',
    examDate: '2026-07-12',
    startAccess: { canStart: false, startBlockReason: 'Exam not started', joinClosesAt: null },
    enrolledCount: 8,
    capacityTotal: 100,
  });
  ok =
    line(
      currentItem.alreadyAppliedInCurrentCycle === true &&
        currentItem.mayReapplyForNewCycle === false &&
        currentItem.enrolledInCurrentCycle === true,
      'current-cycle item flags',
    ) && ok;
  ok =
    line(
      shouldSyncMyApplicationToLocalAppliedSeries(currentItem) === true,
      'current-cycle item syncs to local appliedSeries',
    ) && ok;
  ok = line(Boolean(currentItem.lastCycleStartedAt), 'current-cycle item has lastCycleStartedAt') && ok;

  const reapplyState = evaluateApplicationCycleState(afterBump, appliedAtIso, afterExamMs);
  const reapplyItem = buildMyTestApplicationItem({
    row: afterBump,
    appliedAtIso,
    cycleState: reapplyState,
    cyclePhase: 'live',
    examDate: '2026-07-20',
    enrolledCount: 0,
    capacityTotal: 100,
    mayReapplyForNewCycle: true,
  });
  ok =
    line(
      reapplyState.mayReapplyForNewCycle === true,
      'older application → mayReapplyForNewCycle in cycle state',
    ) && ok;
  ok =
    line(
      reapplyItem.alreadyAppliedInCurrentCycle === false &&
        reapplyItem.mayReapplyForNewCycle === true &&
        reapplyItem.enrolledInCurrentCycle === false &&
        reapplyItem.canStart === false,
      're-apply item flags',
    ) && ok;
  ok =
    line(
      shouldSyncMyApplicationToLocalAppliedSeries(reapplyItem) === false,
      're-apply item must NOT sync to local appliedSeries',
    ) && ok;

  const resolveCurrent = buildTestResolvePayload({
    row: row(),
    advancedConfig: {},
    nowMs: examStartMs,
    alreadyAppliedInCurrentCycle: true,
    mayReapplyForNewCycle: false,
  });
  const resolveReapply = buildTestResolvePayload({
    row: afterBump,
    advancedConfig: {},
    nowMs: afterExamMs,
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: true,
  });
  ok =
    line(
      resolveCurrent.alreadyAppliedInCurrentCycle === true &&
        resolveCurrent.mayReapplyForNewCycle === false,
      'resolve: current-cycle applicant',
    ) && ok;
  ok =
    line(
      resolveReapply.canApply === true &&
        resolveReapply.mayReapplyForNewCycle === true &&
        resolveReapply.canStart === false,
      'resolve: re-apply applicant canApply, cannot start until re-enrolled',
    ) && ok;
  ok = line(Boolean(resolveReapply.lastCycleStartedAt), 'resolve payload has lastCycleStartedAt') && ok;

  console.log('\n-- Static wiring --');
  const testsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tests.js'), 'utf8');
  const authSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'data', 'AuthRepository.kt'),
    'utf8',
  );
  const applySrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'app',
      'src',
      'main',
      'java',
      'com',
      'freemocktest',
      'app',
      'newui',
      'apply',
      'ApplyForTestScreenNew.kt',
    ),
    'utf8',
  );

  ok =
    line(
      testsSrc.includes('buildMyTestApplicationItem') &&
        testsSrc.includes('cycleState.mayReapplyForNewCycle'),
      'tests.js builds my-applications re-apply rows',
    ) && ok;
  ok =
    line(
      authSrc.includes('mayReapplyForNewCycle') && authSrc.includes('evictLocalTestIds'),
      'AuthRepository evicts re-apply rows from local appliedSeries sync',
    ) && ok;
  ok =
    line(
      applySrc.includes('TestApplyState.userHasAppliedForCurrentCycle'),
      'Apply screen uses shared apply-state helper',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_MY_APPLICATIONS_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_MY_APPLICATIONS_PHASE2_FAILED');
  process.exit(1);
}

main();
