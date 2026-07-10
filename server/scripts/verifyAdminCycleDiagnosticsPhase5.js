#!/usr/bin/env node
'use strict';

/**
 * Phase 5 verify — cycle scheduler logs + admin cycle diagnostics API.
 *
 * Usage:
 *   node scripts/verifyAdminCycleDiagnosticsPhase5.js
 */

const fs = require('fs');
const path = require('path');
const {
  logCycleSchedulerSkip,
  isCycleSchedulerLogEnabled,
} = require('../src/lib/cycleSchedulerLog');
const { buildAdminTestCycleDiagnostics } = require('../src/lib/adminTestCycleDiagnostics');
const { buildExamStartMs } = require('../src/lib/examSchedule');
const { MS_PER_MINUTE } = require('../src/lib/testCycleWindow');

const indexJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin.js'), 'utf8');
const adminPerms = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'adminRoutePermissions.js'),
  'utf8',
);
const appTsx = fs.readFileSync(
  path.join(__dirname, '..', '..', 'admin-web', 'src', 'App.tsx'),
  'utf8',
);

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function main() {
  console.log('=== Phase 5: scheduler logs + admin diagnostics ===\n');
  let ok = true;

  ok = line(indexJs.includes('logCycleSchedulerSkip'), 'index.js uses logCycleSchedulerSkip') && ok;
  ok =
    line(
      indexJs.includes("logCycleSchedulerSkip(testId, 'pending_deferred_results'"),
      'index.js logs pending_deferred_results skip',
    ) && ok;
  ok =
    line(indexJs.includes('logCycleSchedulerRollover'), 'index.js logs successful rollover') && ok;
  ok =
    line(
      adminJs.includes('/tests/:id/cycle-diagnostics'),
      'admin GET /tests/:id/cycle-diagnostics route exists',
    ) && ok;
  ok =
    line(
      adminPerms.includes('cycle-diagnostics'),
      'RBAC includes cycle-diagnostics under tab_all_tests',
    ) && ok;
  ok =
    line(appTsx.includes('loadCycleDiagnostics'), 'admin UI loads cycle diagnostics on edit') && ok;
  ok = line(appTsx.includes('Cycle diagnostics'), 'admin UI shows diagnostics panel') && ok;
  ok = line(isCycleSchedulerLogEnabled() === true, 'scheduler logging enabled by default') && ok;

  const mockPool = {
    async query() {
      return { rows: [{ pending: false }] };
    },
  };

  const row = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-01T10:00:00.000Z',
  };
  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  const diag = await buildAdminTestCycleDiagnostics(
    mockPool,
    row,
    { resultVisibility: 'immediate' },
    afterExamMs,
  );
  ok = line(Boolean(diag.modeLabel), 'buildAdminTestCycleDiagnostics returns modeLabel') && ok;
  ok = line(diag.resultVisibility === 'immediate', 'diagnostics includes resultVisibility') && ok;
  ok =
    line(
      typeof diag.rolloverWouldExecute === 'boolean',
      'diagnostics includes rolloverWouldExecute',
    ) && ok;

  const prev = process.env.CYCLE_SCHEDULER_LOG;
  process.env.CYCLE_SCHEDULER_LOG = 'false';
  ok = line(isCycleSchedulerLogEnabled() === false, 'CYCLE_SCHEDULER_LOG=false disables logs') && ok;
  if (prev === undefined) delete process.env.CYCLE_SCHEDULER_LOG;
  else process.env.CYCLE_SCHEDULER_LOG = prev;

  logCycleSchedulerSkip('test-id', 'unit_test_reason');

  console.log('');
  if (ok) {
    console.log('VERIFY_ADMIN_CYCLE_DIAGNOSTICS_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_ADMIN_CYCLE_DIAGNOSTICS_PHASE5_FAILED');
  process.exit(1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
