'use strict';

/**
 * Phase 4 — Subcategory duplicate apply guard (offline verify).
 *
 * Usage:
 *   node scripts/verifyApplyOncePhase4.js
 */

const fs = require('fs');
const path = require('path');
const {
  resolveApplyEligibilityForTest,
  resolveAlreadyAppliedForTarget,
  findCurrentCycleSiblingApplication,
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
  const sub = 'SSC CGL';
  const testA = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'SSC CGL Mock A',
    subcategory: sub,
    last_cycle_started_at: cycleStart,
    enrolled_count: 5,
    capacity_total: 100,
  };
  const testB = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    title: 'SSC CGL Mock B',
    subcategory: sub,
    last_cycle_started_at: cycleStart,
    enrolled_count: 2,
    capacity_total: 50,
  };
  const apps = [
    {
      ...testA,
      applied_at: '2026-07-01T10:15:00.000Z',
    },
  ];

  const sibling = findCurrentCycleSiblingApplication(testB, apps);
  ok = line(Boolean(sibling), 'findCurrentCycleSiblingApplication: detects sibling in subcategory') && ok;

  const blocked = resolveApplyEligibilityForTest(testB, apps);
  ok =
    line(
      blocked.kind === 'already_applied_sibling_subcategory',
      'resolveApplyEligibilityForTest: blocks second UUID in same subcategory',
    ) && ok;
  ok =
    line(
      blocked.testRow.id === testA.id,
      'resolveApplyEligibilityForTest: returns canonical applied test row',
    ) && ok;

  const same = resolveApplyEligibilityForTest(testA, apps);
  ok = line(same.kind === 'already_applied_same_test', 'resolveApplyEligibilityForTest: same test id') && ok;

  const fresh = resolveApplyEligibilityForTest(testB, []);
  ok = line(fresh.kind === 'may_apply_fresh', 'resolveApplyEligibilityForTest: no apps → fresh apply') && ok;

  const resolveState = resolveAlreadyAppliedForTarget(testB, apps);
  ok =
    line(
      resolveState.alreadyAppliedInCurrentCycle === true,
      'resolveAlreadyAppliedForTarget: sibling marks already applied',
    ) && ok;
  ok = line(resolveState.appliedTestRow?.id === testA.id, 'resolveAlreadyAppliedForTarget: appliedTestRow') && ok;

  const otherSubApps = [
    {
      ...testA,
      subcategory: 'Railway',
      applied_at: '2026-07-01T10:15:00.000Z',
    },
  ];
  const allowed = resolveApplyEligibilityForTest(testB, otherSubApps);
  ok =
    line(allowed.kind === 'may_apply_fresh', 'different subcategory does not block apply') && ok;

  return ok;
}

function runStaticChecks() {
  let ok = true;
  const lib = read('server/src/lib/testApplicationCycle.js');
  const routes = read('server/src/routes/tests.js');

  ok = line(lib.includes('findCurrentCycleSiblingApplication'), 'testApplicationCycle: sibling helper') && ok;
  ok = line(lib.includes('resolveApplyEligibilityForTest'), 'testApplicationCycle: eligibility helper') && ok;
  ok = line(routes.includes('already_applied_sibling_subcategory'), 'tests.js: sibling apply branch') && ok;
  ok = line(routes.includes('resolveAlreadyAppliedForTarget'), 'tests.js: resolve uses subcategory guard') && ok;
  ok = line(routes.includes('USER_TEST_APPLICATIONS_SQL'), 'tests.js: shared applications query') && ok;
  ok =
    line(
      routes.includes('You already applied for a test in this category'),
      'tests.js: sibling apply message',
    ) && ok;

  return ok;
}

function main() {
  console.log('=== verifyApplyOncePhase4 ===\n');
  let ok = runStaticChecks();
  console.log('');
  ok = runLogicTests() && ok;
  console.log('');
  if (ok) {
    console.log('PASS  Apply-once Phase 4 checks');
    process.exit(0);
  }
  console.error('FAIL  Apply-once Phase 4 checks');
  process.exit(1);
}

main();
