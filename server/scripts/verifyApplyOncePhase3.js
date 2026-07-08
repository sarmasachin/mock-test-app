'use strict';

/**
 * Phase 3 — Server apply / enrolled flags + canonical cycle rules (offline verify).
 *
 * Usage:
 *   node scripts/verifyApplyOncePhase3.js
 */

const fs = require('fs');
const path = require('path');
const {
  isApplicationFromOlderCycle,
  evaluateApplicationCycleState,
  buildApplyResponseBody,
  normalizeEnrollmentCounts,
} = require('../src/lib/testApplicationCycle');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function runLogicTests() {
  let ok = true;
  const cycleStart = '2026-07-01T10:00:00.000Z';
  const row = {
    last_cycle_started_at: cycleStart,
    dynamic_date_enabled: false,
    exam_date: null,
  };

  ok =
    line(
      evaluateApplicationCycleState(row, '2026-07-01T10:30:00.000Z').alreadyAppliedInCurrentCycle === true,
      'evaluateApplicationCycleState: applied after cycle start → current',
    ) && ok;
  ok =
    line(
      evaluateApplicationCycleState(row, '2026-07-01T09:30:00.000Z').mayReapplyForNewCycle === true,
      'evaluateApplicationCycleState: applied before cycle start → may reapply',
    ) && ok;
  ok =
    line(
      isApplicationFromOlderCycle({ last_cycle_started_at: null }, '2026-07-01T09:00:00.000Z') === false,
      'isApplicationFromOlderCycle: no cycle boundary → not older (safe default)',
    ) && ok;

  const dup = buildApplyResponseBody({
    test: { id: 't1', title: 'Mock 1', capacity_total: 100, enrolled_count: 40 },
    enrolledCount: 40,
    capacityTotal: 100,
    alreadyApplied: true,
    alreadyAppliedInCurrentCycle: true,
    message: 'You already applied for this test',
  });
  ok = line(dup.alreadyAppliedInCurrentCycle === true, 'buildApplyResponseBody: duplicate apply flags') && ok;
  ok = line(dup.enrolledInCurrentCycle === true, 'buildApplyResponseBody: enrolledInCurrentCycle on duplicate') && ok;
  ok = line(dup.remainingSeats === 60, 'buildApplyResponseBody: remainingSeats from enrolled/capacity') && ok;

  const fresh = buildApplyResponseBody({
    test: { id: 't1', title: 'Mock 1', capacity_total: 50, enrolled_count: 11 },
    alreadyAppliedInCurrentCycle: true,
    message: 'Application submitted successfully',
  });
  ok = line(fresh.enrolledInCurrentCycle === true, 'buildApplyResponseBody: fresh apply enrolledInCurrentCycle') && ok;

  const wait = buildApplyResponseBody({
    test: { id: 't1', title: 'Mock 1' },
    waitlisted: true,
    message: 'waiting',
  });
  ok = line(wait.enrolledInCurrentCycle === false, 'buildApplyResponseBody: waitlist not enrolled') && ok;

  const counts = normalizeEnrollmentCounts({ capacity_total: 10, enrolled_count: 3 });
  ok = line(counts.remainingSeats === 7, 'normalizeEnrollmentCounts: remaining seats') && ok;

  return ok;
}

function runStaticChecks() {
  let ok = true;
  const lib = read('server/src/lib/testApplicationCycle.js');
  const routes = read('server/src/routes/tests.js');
  const models = read('app/src/main/java/com/freemocktest/app/data/remote/ApiModels.kt');
  const applyScreen = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');

  ok = line(lib.includes('buildApplyResponseBody'), 'testApplicationCycle.js exists') && ok;
  ok = line(lib.includes('return false'), 'testApplicationCycle: safe default for unknown cycle') && ok;
  ok = line(routes.includes("require('../lib/testApplicationCycle')"), 'tests.js imports testApplicationCycle') && ok;
  ok = line(routes.includes('buildApplyResponseBody'), 'tests.js uses buildApplyResponseBody') && ok;
  ok = line(routes.includes('alreadyAppliedInCurrentCycle: true'), 'my-applications exposes cycle flags') && ok;
  ok = line(models.includes('alreadyAppliedInCurrentCycle'), 'Android ApplyTestResponse cycle flags') && ok;
  ok = line(models.includes('enrolledInCurrentCycle'), 'Android enrolledInCurrentCycle field') && ok;
  ok = line(applyScreen.includes('alreadyAppliedInCurrentCycle'), 'Apply screen uses server cycle flags') && ok;

  return ok;
}

function main() {
  console.log('=== verifyApplyOncePhase3 ===\n');
  let ok = runStaticChecks();
  console.log('');
  ok = runLogicTests() && ok;
  console.log('');
  if (ok) {
    console.log('PASS  Apply-once Phase 3 checks');
    process.exit(0);
  }
  console.error('FAIL  Apply-once Phase 3 checks');
  process.exit(1);
}

main();
