'use strict';
/**
 * Phase 0 — READ-ONLY diagnostic (no DB writes, no mutations).
 * Checks live API catalog + optional local DB cycle/scheduling state.
 *
 * Usage:
 *   node scripts/phase0Diag.js
 *   node scripts/phase0Diag.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/phase0Diag.js --skip-db
 */

require('dotenv').config();

const DEFAULT_API = String(process.env.PHASE0_API_BASE || 'https://admin-admin.govmocktest.com/v1').replace(/\/+$/, '');
const { resolveCycleRepublishGapMinutes } = require('../src/lib/cycleRepublishGap');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function resolveAdv(map, testId) {
  const key = String(testId || '').trim();
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(map || {})) {
    if (String(k).trim().toLowerCase() === lower) return v;
  }
  return null;
}

function catalogBlockReasons(row, adv, nowMs) {
  const reasons = [];
  if (row.is_published !== true) reasons.push('is_published=false');
  if (adv?.publishAt && Date.parse(adv.publishAt) > nowMs) {
    reasons.push(`publishAt_future:${adv.publishAt}`);
  }
  if (adv?.unpublishAt && Date.parse(adv.unpublishAt) <= nowMs) {
    reasons.push(`unpublishAt_passed:${adv.unpublishAt}`);
  }
  return reasons;
}

async function diagLiveApi(apiBase) {
  console.log('\n=== PHASE 0 — LIVE API (read-only) ===');
  console.log(`API base: ${apiBase}\n`);

  let allOk = true;

  const healthUrl = apiBase.replace(/\/v1$/, '') + '/health';
  const health = await fetchJson(healthUrl).catch((e) => ({
    ok: false,
    status: 0,
    body: { error: String(e.message || e) },
  }));
  if (health.status === 200) {
    line(true, `GET /health → 200`);
  } else {
    allOk = line(false, `GET /health → ${health.status || 'unreachable'} (${healthUrl})`);
  }

  const catalog = await fetchJson(`${apiBase}/tests?limit=100`).catch((e) => ({
    ok: false,
    status: 0,
    body: { error: String(e.message || e) },
  }));
  if (!catalog.ok) {
    allOk = line(false, `GET /tests → ${catalog.status} ${JSON.stringify(catalog.body)}`);
  } else {
    const items = Array.isArray(catalog.body?.items) ? catalog.body.items : [];
    if (items.length > 0) {
      line(true, `GET /tests → ${items.length} published test(s) in catalog`);
      for (const t of items.slice(0, 10)) {
        console.log(`     · ${t.title} (${String(t.id || '').slice(0, 8)}…)`);
      }
    } else {
      allOk = line(false, 'GET /tests → catalog EMPTY (0 apply-ready tests for app)');
    }
  }

  const lb = await fetchJson(`${apiBase}/leaderboard/tests?limit=20`).catch((e) => ({
    ok: false,
    status: 0,
    body: { error: String(e.message || e) },
  }));
  if (lb.ok) {
    const items = Array.isArray(lb.body?.items) ? lb.body.items : [];
    line(true, `GET /leaderboard/tests → ${items.length} test(s) with past attempts`);
    if (catalog.body?.items?.length === 0 && items.length > 0) {
      line(false, 'Catalog empty but attempts exist → tests likely is_published=false (between cycles)');
      for (const t of items.slice(0, 5)) {
        console.log(`     · ${t.testTitle} (last attempt ${t.lastAttemptAt || '—'})`);
      }
    }
  } else {
    allOk = line(false, `GET /leaderboard/tests → ${lb.status}`);
  }

  return { allOk, catalogCount: catalog.body?.items?.length || 0 };
}

async function diagLocalDb() {
  console.log('\n=== PHASE 0 — LOCAL DB (read-only) ===');
  if (!process.env.DATABASE_URL) {
    line(false, 'DATABASE_URL not set — skip local DB section');
    return { allOk: false, skipped: true };
  }

  const hostHint = process.env.DATABASE_URL.includes('127.0.0.1') ||
    process.env.DATABASE_URL.includes('localhost')
    ? 'localhost'
    : 'remote';
  console.log(`DB target: ${hostHint}\n`);

  const { pool } = require('../src/db');
  const nowMs = Date.now();
  let allOk = true;

  try {
    const advRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
    );
    let advancedMap = {};
    try {
      advancedMap = JSON.parse(String(advRes.rows[0]?.setting_value || '{}')) || {};
    } catch {
      advancedMap = {};
    }

    const tests = await pool.query(
      `SELECT id, title, is_published, duration_minutes, last_cycle_started_at,
              enrolled_count, subcategory, question_count, updated_at
       FROM tests
       ORDER BY updated_at DESC`,
    );

    const published = tests.rows.filter((r) => r.is_published === true).length;
    console.log(`Tests in DB: ${tests.rows.length} total, ${published} published\n`);

    if (tests.rows.length === 0) {
      allOk = line(false, 'No tests in this database');
    }

    for (const t of tests.rows) {
      const adv = resolveAdv(advancedMap, t.id) || {};
      const started = Date.parse(String(t.last_cycle_started_at || ''));
      const dur = Math.max(1, Number(t.duration_minutes || 0));
      const cycleEnd = Number.isFinite(started) ? started + dur * 60000 : NaN;
      const gapMinutes = resolveCycleRepublishGapMinutes(adv);
      const republishAt = Number.isFinite(cycleEnd) ? cycleEnd + gapMinutes * 60000 : NaN;
      const reasons = catalogBlockReasons(t, adv, nowMs);
      const overdueRepublish = Number.isFinite(republishAt) && nowMs >= republishAt;

      const row = {
        title: t.title,
        id: String(t.id).slice(0, 8),
        is_published: t.is_published,
        duration_min: t.duration_minutes,
        cycle_ended: Number.isFinite(cycleEnd) ? nowMs >= cycleEnd : null,
        republish_at: Number.isFinite(republishAt) ? new Date(republishAt).toISOString() : null,
        republish_gap_minutes: gapMinutes,
        republish_overdue: overdueRepublish,
        catalog_block: reasons,
      };
      console.log(JSON.stringify(row, null, 2));

      if (!t.is_published && overdueRepublish) {
        allOk = line(false, `  → ${t.title}: republish OVERDUE — scheduler should have republished`);
      } else if (!t.is_published && Number.isFinite(republishAt) && nowMs < republishAt) {
        const mins = ((republishAt - nowMs) / 60000).toFixed(1);
        line(true, `  → ${t.title}: between cycles, republish in ~${mins} min`);
      } else if (t.is_published) {
        line(true, `  → ${t.title}: LIVE in catalog`);
      }
    }

    const pubRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'publishScheduling' LIMIT 1`,
    );
    let pubItems = [];
    try {
      pubItems = JSON.parse(String(pubRes.rows[0]?.setting_value || '{}')).items || [];
    } catch {
      pubItems = [];
    }

    const pending = pubItems.filter(
      (i) =>
        String(i.status || '').toLowerCase() === 'scheduled' &&
        String(i.entityType || '').toLowerCase() === 'test',
    );
    console.log(`\nPending test republish schedules: ${pending.length}`);
    for (const p of pending.slice(0, 15)) {
      const scheduleMs = Date.parse(String(p.scheduleAt || ''));
      const overdue = Number.isFinite(scheduleMs) && scheduleMs <= nowMs;
      console.log(
        JSON.stringify({
          id: String(p.id || '').slice(0, 24),
          entityId: String(p.entityId || '').slice(0, 8),
          scheduleAt: p.scheduleAt,
          overdue,
          source: p.source || '',
        }),
      );
      if (overdue) {
        allOk = line(false, `  → overdue schedule ${p.id} — needs server scheduler or manual admin republish`);
      }
    }

    await pool.end();
    return { allOk };
  } catch (e) {
    await pool.end().catch(() => {});
    line(false, `Local DB error: ${e.message || e}`);
    return { allOk: false };
  }
}

function printActions(liveCatalogCount) {
  console.log('\n=== PHASE 0 — SAFE ACTIONS (manual, no auto-fix) ===\n');
  console.log('1) Admin panel → All Tests → har test open karo');
  console.log('   · "Published" checkbox ON rakho → Save');
  console.log('   · Testing ke liye duration_minutes badha do (e.g. 1440 = 24h)');
  console.log('');
  console.log('2) Admin → Publish Scheduling → Load');
  console.log('   · status=scheduled + overdue rows dekho');
  console.log('   · Queue cleanup → Preview (pehle) → Apply sirf agar preview theek ho');
  console.log('');
  console.log('3) Server par PM2/process running confirm (scheduler har 60s):');
  console.log('   · pm2 status / pm2 logs mocktestapp-api --lines 30');
  console.log('');
  console.log('4) Verify (read-only):');
  console.log('   · node scripts/phase0Diag.js');
  console.log(`   · GET ${DEFAULT_API}/tests → items.length > 0`);
  console.log('');
  if (liveCatalogCount === 0) {
    console.log('!!  Abhi live catalog EMPTY hai — app par apply tab tak nahi khulega');
    console.log('    jab tak admin se tests dubara publish na hon.');
  } else {
    console.log('OK  Live catalog mein tests hain — app par apply try karo.');
  }
  console.log('\nFull steps: server/PHASE0_APPLY_FIX_RUNBOOK.txt\n');
}

(async () => {
  const apiBase = (argValue('--api') || DEFAULT_API).replace(/\/+$/, '');
  const skipDb = hasFlag('--skip-db');

  console.log('PHASE0_DIAG — read-only, no writes\n');

  const live = await diagLiveApi(apiBase);
  if (!skipDb) {
    await diagLocalDb();
  } else {
    console.log('\n(skipped local DB: --skip-db)\n');
  }

  printActions(live.catalogCount);

  const exitCode = live.allOk && live.catalogCount > 0 ? 0 : 2;
  console.log(exitCode === 0 ? 'PHASE0_DIAG_OK' : 'PHASE0_DIAG_NEEDS_ACTION');
  process.exit(exitCode);
})().catch((e) => {
  console.error('PHASE0_DIAG_FATAL', e);
  process.exit(1);
});
