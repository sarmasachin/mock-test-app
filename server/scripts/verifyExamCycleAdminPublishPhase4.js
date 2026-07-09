#!/usr/bin/env node
'use strict';

/**
 * Phase 4 verify — admin create/edit does not start duration timer on future exams.
 *
 * Usage:
 *   node scripts/verifyExamCycleAdminPublishPhase4.js
 */

const fs = require('fs');
const path = require('path');
const {
  CYCLE_MODES,
  classifyCycleMode,
  shouldSeedCycleStartOnAdminPublish,
  resolveAdminCycleStartUpdate,
  MS_PER_MINUTE,
  MS_PER_DAY,
} = require('../src/lib/testCycleWindow');
const { buildExamStartMs } = require('../src/lib/examSchedule');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function row(overrides) {
  return {
    is_published: true,
    duration_minutes: 60,
    exam_date: null,
    slot_label: '',
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: null,
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 4: admin publish cycle start ===\n');
  let ok = true;

  const ff = row({
    title: 'ff',
    duration_minutes: 60,
    exam_date: null,
    dynamic_date_enabled: false,
    date_cycle_days: 0,
  });
  ok = line(classifyCycleMode(ff) === CYCLE_MODES.MANUAL_NO_AUTO_CYCLE, 'ff → Mode C') && ok;
  ok = line(shouldSeedCycleStartOnAdminPublish(ff), 'ff: seed cycle on publish') && ok;
  const ffPublish = resolveAdminCycleStartUpdate(ff, null, { justPublished: true });
  ok = line(ffPublish.setCycleStart === true, 'ff: first publish sets cycle start') && ok;

  const hpGk = row({
    title: 'HP GK',
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
  });
  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const beforeExamMs = examStartMs - 2 * MS_PER_DAY;
  ok =
    line(
      shouldSeedCycleStartOnAdminPublish(hpGk, beforeExamMs) === false,
      'HP GK: defer cycle start before future exam',
    ) && ok;
  const hpFuturePublish = resolveAdminCycleStartUpdate(hpGk, null, {
    justPublished: true,
    nowMs: beforeExamMs,
  });
  ok =
    line(
      hpFuturePublish.setCycleStart === false,
      'HP GK: first publish does NOT set last_cycle_started_at before exam',
    ) && ok;
  ok =
    line(
      hpFuturePublish.reason === 'future_exam_deferred',
      'HP GK: deferred reason is future_exam_deferred',
    ) && ok;

  const hpPublishedBefore = {
    ...hpGk,
    last_cycle_started_at: '2026-07-08T10:00:00.000Z',
  };
  const hpEditDuringWait = resolveAdminCycleStartUpdate(hpPublishedBefore, hpPublishedBefore, {
    justPublished: false,
    nowMs: beforeExamMs,
  });
  ok =
    line(
      hpEditDuringWait.setCycleStart === false,
      'HP GK: admin edit does NOT bump cycle while waiting for exam',
    ) && ok;

  const duringExamMs = examStartMs + 15 * MS_PER_MINUTE;
  const hpEditDuringExam = resolveAdminCycleStartUpdate(hpPublishedBefore, hpPublishedBefore, {
    justPublished: false,
    nowMs: duringExamMs,
  });
  ok =
    line(
      hpEditDuringExam.setCycleStart === false,
      'HP GK: admin edit does NOT bump cycle during exam (no duration timer)',
    ) && ok;

  const legacyDurationBump = {
    ...hpGk,
    last_cycle_started_at: new Date(beforeExamMs - 90 * MS_PER_MINUTE).toISOString(),
  };
  const hpEditAfterLegacyDuration = resolveAdminCycleStartUpdate(legacyDurationBump, legacyDurationBump, {
    justPublished: false,
    nowMs: beforeExamMs,
  });
  ok =
    line(
      hpEditAfterLegacyDuration.setCycleStart === false,
      'HP GK: edit after 30/60min does NOT renew cycle (legacy duration bug removed)',
    ) && ok;

  const rolling = row({
    title: 'rolling',
    dynamic_date_enabled: true,
    date_cycle_days: 7,
    exam_date: null,
  });
  ok = line(shouldSeedCycleStartOnAdminPublish(rolling), 'rolling Mode B: seed on publish') && ok;

  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  ok =
    line(
      shouldSeedCycleStartOnAdminPublish(hpGk, afterExamMs),
      'HP GK: seed allowed after exam window ends',
    ) && ok;

  const hpMissingMarker = { ...hpGk, last_cycle_started_at: null };
  const hpSeedAfterExam = resolveAdminCycleStartUpdate(hpMissingMarker, hpMissingMarker, {
    justPublished: false,
    nowMs: afterExamMs,
  });
  ok =
    line(
      hpSeedAfterExam.setCycleStart === true,
      'HP GK: seed missing cycle marker after exam (legacy row)',
    ) && ok;

  console.log('\n-- Static wiring --');
  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin.js'), 'utf8');
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const windowSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testCycleWindow.js'), 'utf8');

  ok =
    line(
      windowSrc.includes('shouldSeedCycleStartOnAdminPublish') &&
        windowSrc.includes('resolveAdminCycleStartUpdate'),
      'testCycleWindow exports admin cycle start helpers',
    ) && ok;
  ok =
    line(
      adminSrc.includes('resolveAdminCycleStartUpdate') &&
        !/durationMinutes \* 60 \* 1000/.test(adminSrc),
      'admin.js uses resolveAdminCycleStartUpdate (no duration bump)',
    ) && ok;
  ok =
    line(
      adminSrc.includes('resolveAdminCycleStartUpdate') &&
        adminSrc.includes("cycleAction.reason === 'admin_reschedule_new_cycle'"),
      'admin PATCH: cycle renew on admin_reschedule_new_cycle',
    ) && ok;
  ok =
    line(
      indexSrc.includes('resolveAdminCycleStartUpdate') &&
        indexSrc.includes('future_exam_deferred') === false &&
        indexSrc.includes('cycleAction.setCycleStart'),
      'index.js scheduled publish respects deferred cycle start',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_ADMIN_PUBLISH_PHASE4_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_ADMIN_PUBLISH_PHASE4_FAILED');
  process.exit(1);
}

main();
