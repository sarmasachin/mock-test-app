#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — admin reschedule warning (shared logic parity + admin-web wiring).
 *
 * Usage:
 *   node scripts/verifyAdminRescheduleWarningPhase5.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server');
const ADMIN_WEB = path.join(ROOT, 'admin-web');

const { buildExamStartMs } = require('../src/lib/examSchedule');
const {
  shouldRenewCycleOnAdminEdit: serverRenew,
  hasAdminScheduleFieldsChanged: serverScheduleChanged,
  hasPreviousCatalogCycleEnded: serverCycleEnded,
} = require('../src/lib/testCycleWindow');
const { MS_PER_MINUTE } = require('../src/lib/testCycleWindow');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function baseRow(overrides = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'Phase 5 Warning Test',
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-01T10:00:00.000Z',
    enrolled_count: 8,
    ...overrides,
  };
}

async function loadSharedClient() {
  const modPath = path.join(ADMIN_WEB, 'src', 'lib', 'adminRescheduleCycle.mjs');
  return import(pathToFileURL(modPath).href);
}

async function main() {
  console.log('=== Phase 5: admin reschedule warning ===\n');
  let ok = true;

  const appTsx = read('admin-web/src/App.tsx');
  const sharedMjs = read('admin-web/src/lib/adminRescheduleCycle.mjs');
  const adminTs = read('admin-web/src/lib/adminRescheduleCycle.mjs.d.ts');
  const adminCss = read('admin-web/src/App.css');

  ok = line(sharedMjs.includes('shouldRenewCycleOnAdminEdit'), 'shared: shouldRenewCycleOnAdminEdit') && ok;
  ok = line(sharedMjs.includes('buildRescheduleConfirmDialog'), 'shared: confirm dialog builder') && ok;
  ok = line(sharedMjs.includes('buildRescheduleInlineNotice'), 'shared: inline notice builder') && ok;
  ok = line(adminTs.includes('AdminScheduleBaseline'), 'admin-web: schedule baseline types') && ok;

  ok =
    line(
      appTsx.includes('editingScheduleBaseline') &&
        appTsx.includes('adminRescheduleCycle.mjs') &&
        appTsx.includes('previewRescheduleCycleRenewal') &&
        appTsx.includes('buildRescheduleConfirmDialog') &&
        appTsx.includes('buildRescheduleInlineNotice'),
      'App.tsx: reschedule baseline + preview + confirm wiring',
    ) && ok;
  ok =
    line(
      appTsx.includes('adminConfirm') && appTsx.includes('rescheduleRenewalPending'),
      'App.tsx: confirm dialog + live preview flag',
    ) && ok;
  ok =
    line(
      appTsx.includes('cycleRenewed') || appTsx.includes('res.data?.cycleRenewed'),
      'App.tsx: post-save cycleRenewed handling',
    ) && ok;
  ok =
    line(
      adminCss.includes('all-tests-cycle-notice'),
      'App.css: reschedule notice styles',
    ) && ok;

  const bannedLiteral =
    'This starts a new application cycle. Previous applicants can re-apply.';
  ok =
    line(
      !sharedMjs.includes(bannedLiteral) && !appTsx.includes(bannedLiteral),
      'copy: avoids informal placeholder wording',
    ) && ok;

  const client = await loadSharedClient();

  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  const beforeExamMs = examStartMs - 2 * 24 * 60 * 60 * 1000;
  const beforeRound = baseRow();
  const afterReschedule = baseRow({
    exam_date: '2026-07-20',
    slot_label: '11:00 am',
  });
  const titleOnly = baseRow({ title: 'Renamed only' });

  const parityCases = [
    {
      label: 'after exam + schedule change',
      fn: () =>
        serverRenew(beforeRound, afterReschedule, afterExamMs) ===
        client.shouldRenewCycleOnAdminEdit(beforeRound, afterReschedule, afterExamMs),
    },
    {
      label: 'no bump while waiting for exam',
      fn: () =>
        serverRenew(beforeRound, afterReschedule, beforeExamMs) ===
        client.shouldRenewCycleOnAdminEdit(beforeRound, afterReschedule, beforeExamMs),
    },
    {
      label: 'title-only edit',
      fn: () =>
        serverRenew(beforeRound, titleOnly, afterExamMs) ===
        client.shouldRenewCycleOnAdminEdit(beforeRound, titleOnly, afterExamMs),
    },
    {
      label: 'schedule field detection',
      fn: () =>
        serverScheduleChanged(beforeRound, afterReschedule) ===
        client.hasAdminScheduleFieldsChanged(beforeRound, afterReschedule),
    },
    {
      label: 'prior cycle ended',
      fn: () =>
        serverCycleEnded(beforeRound, afterExamMs) ===
        client.hasPreviousCatalogCycleEnded(beforeRound, afterExamMs),
    },
  ];

  for (const c of parityCases) {
    ok = line(c.fn(), `parity: shared vs server — ${c.label}`) && ok;
  }

  const dialog = client.buildRescheduleConfirmDialog({
    testTitle: 'HP GK',
    enrolledCount: 12,
  });
  ok = line(Boolean(dialog.title && dialog.message && dialog.confirmLabel), 'dialog: confirm payload') && ok;
  ok = line(dialog.message.includes('12'), 'dialog: mentions enrolled count when > 0') && ok;

  const adminJs = read('server/src/routes/admin.js');
  ok =
    line(
      adminJs.includes('cycleRenewed') && adminJs.includes('return res.json({ item:'),
      'server PATCH: exposes cycleRenewed on update',
    ) && ok;

  try {
    execSync('npx tsc -b', { cwd: ADMIN_WEB, stdio: 'pipe' });
    ok = line(true, 'admin-web: TypeScript build passes') && ok;
  } catch (e) {
    ok = line(false, `admin-web: TypeScript build failed — ${String(e.stderr || e.message || e).slice(0, 240)}`) && ok;
  }

  console.log('');
  if (ok) {
    console.log('VERIFY_ADMIN_RESCHEDULE_WARNING_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_ADMIN_RESCHEDULE_WARNING_PHASE5_FAILED');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
