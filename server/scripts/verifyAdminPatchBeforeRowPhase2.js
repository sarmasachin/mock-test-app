#!/usr/bin/env node
'use strict';

/**
 * Phase 2 verify — PATCH /admin/tests/:id must load full schedule fields in beforeRow
 * so resolveAdminCycleStartUpdate can detect admin reschedule correctly.
 *
 * Usage:
 *   node scripts/verifyAdminPatchBeforeRowPhase2.js
 */

const fs = require('fs');
const path = require('path');
const {
  resolveAdminCycleStartUpdate,
  hasAdminScheduleFieldsChanged,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const { buildExamStartMs } = require('../src/lib/examSchedule');

const adminJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin.js'), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function incompleteBeforeRowFromPatch() {
  return {
    id: 'test-id',
    title: 'HP GK',
    is_published: true,
    last_cycle_started_at: '2026-07-10T16:00:54.461Z',
    enrolled_count: 5,
    dynamic_fluctuation_on_publish: true,
  };
}

function fullBeforeRowFromPatch() {
  return {
    ...incompleteBeforeRowFromPatch(),
    exam_date: '2026-07-10',
    slot_label: '09:00 PM',
    dynamic_date_enabled: true,
    date_cycle_days: 1,
    duration_minutes: 30,
  };
}

function afterRescheduleRow() {
  return {
    ...fullBeforeRowFromPatch(),
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
  };
}

function main() {
  console.log('=== Phase 2: admin PATCH beforeRow schedule fields ===\n');
  let ok = true;

  ok =
    line(
      /exam_date, slot_label, dynamic_date_enabled, date_cycle_days, duration_minutes/.test(adminJs),
      'admin.js PATCH before SELECT includes schedule + duration fields',
    ) && ok;

  const examStartMs = buildExamStartMs('2026-07-10', '09:00 PM');
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;

  const incomplete = incompleteBeforeRowFromPatch();
  const full = fullBeforeRowFromPatch();
  const after = afterRescheduleRow();

  ok =
    line(
      hasAdminScheduleFieldsChanged(incomplete, after) === true,
      'BUGGY incomplete beforeRow: false-positive schedule change',
    ) && ok;

  const brokenReschedule = resolveAdminCycleStartUpdate(after, incomplete, {
    justPublished: false,
    nowMs: afterExamMs,
  });
  ok =
    line(
      brokenReschedule.reason !== 'admin_reschedule_new_cycle',
      `BUGGY incomplete beforeRow blocks admin_reschedule (got ${brokenReschedule.reason})`,
    ) && ok;

  ok =
    line(
      hasAdminScheduleFieldsChanged(full, after) === true,
      'full beforeRow: real schedule change detected',
    ) && ok;

  ok =
    line(
      hasAdminScheduleFieldsChanged(full, { ...full, title: 'HP GK Renamed' }) === false,
      'full beforeRow: title-only edit is not schedule change',
    ) && ok;

  const phase9Before = {
    id: 'phase2-test',
    title: 'Phase2 Test',
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-01T10:00:00.000Z',
    enrolled_count: 5,
  };
  const phase9After = { ...phase9Before, exam_date: '2026-07-20', slot_label: '11:00 am' };
  const phase9ExamStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const phase9AfterExamMs = phase9ExamStartMs + 30 * MS_PER_MINUTE + 1000;
  const phase9Reschedule = resolveAdminCycleStartUpdate(phase9After, phase9Before, {
    justPublished: false,
    nowMs: phase9AfterExamMs,
  });
  ok =
    line(
      phase9Reschedule.setCycleStart === true && phase9Reschedule.reason === 'admin_reschedule_new_cycle',
      'Phase9-shaped full beforeRow → admin_reschedule_new_cycle',
    ) && ok;

  const titleOnlyAction = resolveAdminCycleStartUpdate(
    { ...full, title: 'HP GK Renamed' },
    full,
    { justPublished: false, nowMs: afterExamMs },
  );
  ok =
    line(
      titleOnlyAction.reason !== 'admin_reschedule_new_cycle',
      `title-only PATCH must not renew cycle (got ${titleOnlyAction.reason})`,
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_ADMIN_PATCH_BEFOREROW_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_ADMIN_PATCH_BEFOREROW_PHASE2_FAILED');
  process.exit(1);
}

main();
