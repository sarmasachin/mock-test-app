#!/usr/bin/env node
'use strict';

/**
 * Phase 0 — Exam / cycle baseline (READ-ONLY).
 *
 * Documents why tests flip publish state on duration_minutes instead of exam_date + date_cycle_days.
 * No DB writes. No apply mutations.
 *
 * Usage:
 *   node scripts/phase0ExamCycleBaseline.js
 *   node scripts/phase0ExamCycleBaseline.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/phase0ExamCycleBaseline.js --skip-db
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const {
  classifyCycleMode,
  resolveCycleWindows,
  legacyParseCycleEndMs,
  MS_PER_DAY,
} = require('../src/lib/testCycleWindow');
const { getPublishSchedulingItems } = require('../src/lib/testVisibility');

const DEFAULT_API = String(
  process.env.PHASE0_API_BASE || process.env.E2E_API_BASE || 'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function line(ok, msg) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${msg}`);
  return ok;
}

function info(msg) {
  console.log(`     ${msg}`);
}

function warn(msg) {
  console.log(`WARN  ${msg}`);
}

async function fetchJson(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 400) };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Current production scheduler: rollovers per 24h from duration_minutes. */
function estimateSchedulerRolloversPer24h(row) {
  const durationMinutes = Math.max(0, Number(row.duration_minutes || 0));
  if (!row.is_published || durationMinutes <= 0) return 0;
  const startedMs = Date.parse(String(row.last_cycle_started_at || ''));
  if (!Number.isFinite(startedMs)) return 0;
  const cycleMs = durationMinutes * 60 * 1000;
  if (cycleMs <= 0) return 0;
  return Math.floor(MS_PER_DAY / cycleMs);
}

function formatIso(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toISOString();
}

function analyzeTestRow(row, advancedConfig, publishItems, nowMs = Date.now()) {
  const windows = resolveCycleWindows(row, nowMs);
  const mode = windows.mode;
  const schedulerCycleEndMs = legacyParseCycleEndMs(row);
  const schedulerExpired = Number.isFinite(schedulerCycleEndMs) && nowMs >= schedulerCycleEndMs;
  const rolloversPer24h = estimateSchedulerRolloversPer24h(row);
  const resolvedExam = windows.resolvedExamDate || '';
  const examStartMs = windows.examStartMs ?? Number.NaN;
  const examEndMs = windows.examEndMs ?? Number.NaN;
  const durationMin = windows.durationMinutes;
  const cycleDays = windows.dateCycleDays;
  const targetCycleEndMs = windows.schedulerCycleEndMs ?? Number.NaN;

  const pendingSchedules = (publishItems || []).filter(
    (item) =>
      String(item?.entityType || '').toLowerCase() === 'test' &&
      String(item?.entityId || '') === String(row.id) &&
      String(item?.status || '').toLowerCase() === 'scheduled',
  );

  const mismatch =
    (mode === 'scheduled_with_cycle_days' || mode === 'rolling_no_exam_date') &&
    rolloversPer24h > 1;

  const findings = [];
  if (mismatch) {
    findings.push({
      kind: 'duration_drives_scheduler_not_cycle_days',
      rolloversPer24h,
      durationMinutes: durationMin,
      dateCycleDays: cycleDays,
      plannedMode: mode,
    });
  }
  if (mode === 'manual_no_auto_cycle' && rolloversPer24h > 0) {
    findings.push({
      kind: 'manual_mode_but_duration_rollover_active',
      rolloversPer24h,
      durationMinutes: durationMin,
    });
  }
  if (schedulerExpired && mode === 'scheduled_with_cycle_days' && Number.isFinite(examStartMs) && nowMs < examStartMs) {
    findings.push({
      kind: 'scheduler_expired_before_exam_date',
      schedulerCycleEnd: formatIso(schedulerCycleEndMs),
      examStart: formatIso(examStartMs),
    });
  }
  if (advancedConfig?.autoCatalogUnpublish === true) {
    findings.push({ kind: 'legacy_auto_catalog_unpublish_enabled' });
  }
  if (pendingSchedules.length > 0) {
    findings.push({
      kind: 'pending_publish_schedule_items',
      count: pendingSchedules.length,
      items: pendingSchedules.map((x) => ({
        action: x.action,
        scheduleAt: x.scheduleAt,
        source: x.source,
      })),
    });
  }

  return {
    title: row.title,
    id: row.id,
    mode,
    plannedModeLabel: windows.modeLabel,
    isPublished: row.is_published === true,
    durationMinutes: durationMin,
    examDate: row.exam_date ? String(row.exam_date).slice(0, 10) : '',
    resolvedExamDate: resolvedExam || '',
    slotLabel: String(row.slot_label || ''),
    dynamicDateEnabled: row.dynamic_date_enabled === true,
    dateCycleDays: cycleDays,
    dynamicFluctuationOnPublish: row.dynamic_fluctuation_on_publish !== false,
    lastCycleStartedAt: row.last_cycle_started_at
      ? new Date(row.last_cycle_started_at).toISOString()
      : null,
    schedulerCycleEndMs,
    schedulerExpired,
    examStartMs,
    examEndMs,
    targetCycleEndMs,
    rolloversPer24h,
    findings,
    advancedPublishAt: advancedConfig?.publishAt || '',
    advancedUnpublishAt: advancedConfig?.unpublishAt || '',
  };
}

function staticCodeAudit() {
  console.log('\n=== PHASE 0 — STATIC CODE AUDIT (exam cycle) ===\n');
  let ok = true;

  const timingJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testCycleTiming.js'), 'utf8');
  const indexJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const cycleJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testApplicationCycle.js'), 'utf8');

  const durationOnlyEnd = /duration_minutes.*60.*1000/s.test(timingJs);
  ok =
    line(
      durationOnlyEnd,
      durationOnlyEnd
        ? 'KNOWN: parseCycleEndMs = last_cycle_started_at + duration_minutes (ignores exam_date)'
        : 'parseCycleEndMs pattern not found',
    ) && ok;

  const adminCycleJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'adminTestCycleStatus.js'), 'utf8');
  const testResolveJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testResolve.js'), 'utf8');
  const testStartJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testStartAccess.js'), 'utf8');
  ok =
    line(
      adminCycleJs.includes('shouldRunSchedulerRollover'),
      'Phase 8: adminTestCycleStatus uses shouldRunSchedulerRollover',
    ) && ok;
  ok =
    line(
      testResolveJs.includes('resolveSchedulerCycleEndMs'),
      'Phase 8: testResolve uses resolveSchedulerCycleEndMs',
    ) && ok;
  ok =
    line(
      testStartJs.includes('resolveSchedulerCycleEndMs'),
      'Phase 8: testStartAccess join window uses resolveSchedulerCycleEndMs',
    ) && ok;

  const schedulerUsesDuration =
    /processTestCycleAutoReschedule[\s\S]*?duration_minutes \* 60 \* 1000/.test(indexJs) ||
    /lockedDurationMinutes \* 60 \* 1000/.test(indexJs);
  ok =
    line(
      !schedulerUsesDuration,
      schedulerUsesDuration
        ? 'FAIL: scheduler still uses duration_minutes for rollover'
        : 'Phase 2: scheduler does not use duration-only rollover',
    ) && ok;

  const createSetsCycleNow =
    /INSERT INTO tests[\s\S]*?last_cycle_started_at = now\(\)/.test(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin.js'), 'utf8'),
    );
  ok =
    line(
      createSetsCycleNow,
      createSetsCycleNow
        ? 'KNOWN: published test create sets last_cycle_started_at = now() immediately'
        : 'Create cycle-start pattern not found',
    ) && ok;

  const resolveExamInCycleJs = cycleJs.includes('function resolveExamDate');
  const examDateNotInTiming = !timingJs.includes('exam_date');
  ok =
    line(
      resolveExamInCycleJs && examDateNotInTiming,
      resolveExamInCycleJs && examDateNotInTiming
        ? 'resolveExamDate exists for display/apply but NOT in testCycleTiming.js'
        : 'Unexpected exam_date usage in cycle timing',
    ) && ok;

  ok =
    line(
      indexJs.includes('enrolled_count = 0, last_cycle_started_at = now()'),
      'Default rollover keeps is_published=true (Phase 2 style in-place rollover)',
    ) && ok;

  ok =
    line(
      indexJs.includes('autoCatalogUnpublish === true'),
      'Legacy autoCatalogUnpublish path still present (opt-in unpublish between cycles)',
    ) && ok;

  const windowJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testCycleWindow.js'), 'utf8');
  ok = line(windowJs.includes('resolveSchedulerCycleEndMs'), 'Phase 1: testCycleWindow.js canonical cycle end helper') && ok;
  ok =
    line(
      indexJs.includes('testCycleWindow') && indexJs.includes('shouldRunSchedulerRollover'),
      'Phase 2: scheduler wired to testCycleWindow',
    ) && ok;

  return ok;
}

async function auditLiveApi(apiBase) {
  console.log('\n=== PHASE 0 — LIVE API (catalog cycle fields) ===');
  console.log(`API: ${apiBase}\n`);

  let ok = true;
  const health = await fetchJson(apiBase.replace(/\/v1$/, '') + '/health');
  ok = line(health.ok, `GET /health → ${health.status}`) && ok;

  const catalog = await fetchJson(`${apiBase}/tests?limit=100`);
  const items = Array.isArray(catalog.body?.items) ? catalog.body.items : [];
  ok = line(catalog.ok, `GET /tests → HTTP ${catalog.status}, ${items.length} item(s)`) && ok;

  console.log('\n--- Catalog tests (user-visible) ---');
  console.log('title | duration | examDate | DateNd | lastCycleStarted | scheduler rollovers/24h est.');
  console.log('-'.repeat(95));

  for (const item of items) {
    const pseudoRow = {
      id: item.id,
      title: item.title,
      is_published: true,
      duration_minutes: item.durationMinutes,
      exam_date: item.examDate,
      slot_label: item.slotLabel,
      dynamic_date_enabled: item.dynamicDateEnabled,
      date_cycle_days: item.dateCycleDays,
      last_cycle_started_at: item.lastCycleStartedAt,
      dynamic_fluctuation_on_publish: true,
    };
    const analysis = analyzeTestRow(pseudoRow, {}, [], Date.now());
    const dateNd = item.dynamicDateEnabled ? `${item.dateCycleDays || 0}d` : 'Off';
    console.log(
      `${String(item.title).padEnd(12).slice(0, 12)} | ${String(item.durationMinutes).padStart(3)} min | ${String(item.examDate || '-').padEnd(10)} | ${dateNd.padStart(4)} | ${(item.lastCycleStartedAt || '-').slice(0, 19)} | ~${analysis.rolloversPer24h}`,
    );
    info(`planned: ${analysis.plannedModeLabel}`);
    for (const f of analysis.findings) {
      warn(`${item.title}: ${f.kind} ${JSON.stringify(f)}`);
      if (f.kind === 'duration_drives_scheduler_not_cycle_days' || f.kind === 'manual_mode_but_duration_rollover_active') {
        ok = line(false, `"${item.title}" — scheduler uses duration (${f.durationMinutes}min), not admin cycle days`) && ok;
      }
    }
  }

  return ok;
}

async function loadAdvancedConfigMap() {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
    );
    if (!rows[0]) return {};
    const parsed = JSON.parse(String(rows[0].setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function advancedForTest(map, testId) {
  const id = String(testId || '').trim();
  return map[id] || map[`test-${id}`] || null;
}

async function auditDatabase() {
  console.log('\n=== PHASE 0 — DATABASE (cycle truth) ===\n');
  let ok = true;

  if (!process.env.DATABASE_URL) {
    return line(true, 'DATABASE_URL not set — run on VPS server/ for full DB audit');
  }

  try {
    const advancedMap = await loadAdvancedConfigMap();
    const publishItems = await getPublishSchedulingItems(pool);

    const { rows } = await pool.query(
      `SELECT id::text AS id, title, slug, is_published, duration_minutes, question_count,
              exam_date, slot_label, dynamic_date_enabled, date_cycle_days,
              COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish,
              last_cycle_started_at, updated_at, enrolled_count, capacity_total
       FROM tests
       ORDER BY updated_at DESC
       LIMIT 50`,
    );

    ok = line(rows.length >= 0, `${rows.length} test row(s) in DB (latest 50)`) && ok;

    const published = rows.filter((r) => r.is_published === true);
    info(`Published: ${published.length}`);

    console.log('\n--- Per-test cycle matrix ---');
    const allFindings = [];

    for (const row of rows) {
      const adv = advancedForTest(advancedMap, row.id) || {};
      const analysis = analyzeTestRow(row, adv, publishItems);
      const flag = analysis.isPublished ? 'PUB' : 'unpub';
      console.log(`\n[${flag}] ${analysis.title} (${analysis.id.slice(0, 8)}…)`);
      info(`Planned mode: ${analysis.plannedModeLabel}`);
      info(
        `duration=${analysis.durationMinutes}min | exam=${analysis.examDate || '(empty)'} | resolvedExam=${analysis.resolvedExamDate || '-'} | slot=${analysis.slotLabel || '-'}`,
      );
      info(
        `Date: ${analysis.dynamicDateEnabled ? `On (${analysis.dateCycleDays}d)` : 'Off'} | Fluctuation: ${analysis.dynamicFluctuationOnPublish ? 'On' : 'Off'}`,
      );
      info(`last_cycle_started_at: ${analysis.lastCycleStartedAt || '—'}`);
      info(`Scheduler cycle end (duration): ${formatIso(analysis.schedulerCycleEndMs)} expired=${analysis.schedulerExpired}`);
      info(`Target cycle end (planned): ${formatIso(analysis.targetCycleEndMs)}`);
      info(`Est. scheduler rollovers per 24h: ~${analysis.rolloversPer24h}`);
      if (analysis.advancedPublishAt || analysis.advancedUnpublishAt) {
        info(`advanced publishAt=${analysis.advancedPublishAt || '-'} unpublishAt=${analysis.advancedUnpublishAt || '-'}`);
      }

      for (const f of analysis.findings) {
        allFindings.push({ title: analysis.title, ...f });
        warn(`${analysis.title}: ${f.kind}`);
      }
    }

    const pendingAll = publishItems.filter((x) => String(x?.status || '').toLowerCase() === 'scheduled');
    console.log(`\n--- publishScheduling queue (${pendingAll.length} pending) ---`);
    for (const item of pendingAll.slice(0, 20)) {
      info(
        `${String(item.action || 'publish').padEnd(8)} | test=${String(item.entityId || '').slice(0, 8)}… | at=${item.scheduleAt} | source=${item.source || '?'}`,
      );
    }
    if (pendingAll.length > 20) {
      info(`… and ${pendingAll.length - 20} more`);
    }

    if (allFindings.length) {
      console.log('\n--- Cycle baseline findings ---');
      for (const f of allFindings) {
        info(`${f.title}: ${f.kind} ${JSON.stringify(f)}`);
      }
      const critical = allFindings.filter(
        (f) =>
          f.kind === 'duration_drives_scheduler_not_cycle_days' ||
          f.kind === 'manual_mode_but_duration_rollover_active' ||
          f.kind === 'scheduler_expired_before_exam_date' ||
          f.kind === 'legacy_auto_catalog_unpublish_enabled',
      );
      if (critical.length) {
        ok = line(false, `${critical.length} test(s) with cycle scheduler mismatch vs admin intent`) && ok;
      }
    } else {
      ok = line(true, 'No cycle scheduler mismatches detected on audited rows') && ok;
    }

    return ok;
  } catch (e) {
    return line(false, `DB audit failed: ${e.message}`);
  }
}

function printPhasePlan() {
  console.log('\n=== PHASE 0 — RECOMMENDED FIX ORDER (exam cycle) ===\n');
  info('Phase 1: testCycleWindow.js — single source (exam + date_cycle_days) [DONE]');
  info('Phase 2: processTestCycleAutoReschedule — rollover on planned cycle end only [DONE]');
  info('Phase 3: canApply=false during exam window');
  info('Phase 4: admin create/edit — do not start duration timer on future exams');
  info('Phase 5: apply/resolve/my-applications align with new windows');
  info('Phase 6: admin UI labels (duration vs cycle days)');
  info('Phase 7: Android cycle phase display');
  info('Phase 8: E2E live + deploy');
}

async function main() {
  const apiBase = argValue('--api') || DEFAULT_API;
  const skipDb = hasFlag('--skip-db');

  console.log('=== PHASE 0 EXAM CYCLE BASELINE (read-only) ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  let ok = staticCodeAudit();
  ok = (await auditLiveApi(apiBase)) && ok;
  if (!skipDb) {
    ok = (await auditDatabase()) && ok;
  } else {
    info('--skip-db: database audit skipped');
  }

  printPhasePlan();

  console.log('');
  if (ok) {
    console.log('PHASE0_EXAM_CYCLE_BASELINE_OK');
    console.log('(OK = baseline captured; mismatches above document the bug before fix)');
    process.exit(0);
  }
  console.error('PHASE0_EXAM_CYCLE_BASELINE_ISSUES');
  console.error('Issues documented above — expected before exam-cycle fix phases 1–8');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error('phase0_exam_cycle_baseline_error', e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
