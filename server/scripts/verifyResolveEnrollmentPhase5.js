'use strict';

/**
 * Phase 5 — GET /tests/resolve returns enrollment fields; Android applies them on fallback.
 *
 * Usage:
 *   node scripts/verifyResolveEnrollmentPhase5.js
 */

const fs = require('fs');
const path = require('path');
const {
  buildTestResolvePayload,
  resolveEnrollmentFromTestRow,
} = require('../src/lib/testResolve');

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

function main() {
  console.log('=== Phase 5: Resolve enrollment fields ===\n');
  let ok = true;

  const row = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'HP GK',
    slug: 'hp-gk',
    subcategory: 'HP GK',
    is_published: true,
    duration_minutes: 120,
    capacity_total: 500,
    enrolled_count: 12,
    slot_label: 'Morning',
    last_cycle_started_at: '2026-07-01T11:30:00.000Z',
    valid_until: null,
  };

  const enrollment = resolveEnrollmentFromTestRow(row);
  ok = line(enrollment.enrolledCount === 12, 'resolveEnrollmentFromTestRow enrolledCount=12') && ok;
  ok = line(enrollment.capacityTotal === 500, 'resolveEnrollmentFromTestRow capacityTotal=500') && ok;
  ok = line(enrollment.remainingSeats === 488, 'resolveEnrollmentFromTestRow remainingSeats=488') && ok;

  const payload = buildTestResolvePayload({
    row,
    advancedConfig: {},
    nowMs: Date.parse('2026-07-01T12:00:00.000Z'),
    publishScheduleItems: [],
    alreadyAppliedInCurrentCycle: false,
  });
  ok = line(payload.found === true, 'resolve payload found=true') && ok;
  ok = line(payload.enrolledCount === 12, 'resolve payload enrolledCount=12') && ok;
  ok = line(payload.capacityTotal === 500, 'resolve payload capacityTotal=500') && ok;
  ok = line(payload.remainingSeats === 488, 'resolve payload remainingSeats=488') && ok;

  const zeroRow = { ...row, enrolled_count: 0 };
  const zeroPayload = buildTestResolvePayload({ row: zeroRow, advancedConfig: {} });
  ok = line(zeroPayload.enrolledCount === 0, 'zero enrollment is valid in resolve payload') && ok;
  ok = line(zeroPayload.remainingSeats === 500, 'zero enrollment remainingSeats=capacity') && ok;

  const missing = buildTestResolvePayload({ row: null });
  ok = line(missing.found === false, 'not_found omits enrollment requirement') && ok;
  ok = line(missing.enrolledCount === undefined, 'not_found has no enrolledCount') && ok;

  console.log('\n-- Static source checks --');
  const resolveJs = read('server/src/lib/testResolve.js');
  const apiModels = read('app/src/main/java/com/freemocktest/app/data/remote/ApiModels.kt');
  const repo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');

  ok = line(resolveJs.includes('resolveEnrollmentFromTestRow'), 'testResolve.js has resolveEnrollmentFromTestRow') && ok;
  ok = line(resolveJs.includes('enrolledCount: enrollment.enrolledCount'), 'buildTestResolvePayload sets enrolledCount') && ok;
  ok = line(
    /lookupTestForResolve[\s\S]*?enrolled_count/.test(resolveJs),
    'lookupTestForResolve SQL selects enrolled_count',
  ) && ok;
  ok = line(apiModels.includes('data class TestResolveResponse'), 'TestResolveResponse exists') && ok;
  ok = line(
    /data class TestResolveResponse[\s\S]*?enrolledCount/.test(apiModels),
    'TestResolveResponse has enrolledCount',
  ) && ok;
  ok = line(repo.includes('applyResolveEnrollment'), 'ContentRepository applies resolve enrollment') && ok;
  ok = line(
    /resolveTestForApply[\s\S]*?applyResolveEnrollment/.test(repo),
    'resolveTestForApply uses applyResolveEnrollment',
  ) && ok;

  if (!ok) {
    console.error('\nVERIFY_RESOLVE_ENROLLMENT_PHASE5_FAILED');
    process.exit(1);
  }
  console.log('\nVERIFY_RESOLVE_ENROLLMENT_PHASE5_OK');
}

main();
