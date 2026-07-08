#!/usr/bin/env node
'use strict';

/**
 * Phase 0 — Enrollment baseline (READ-ONLY, no DB writes, no apply mutations unless --apply-test).
 *
 * Documents admin vs user enrollment truth before any fix.
 *
 * Usage:
 *   node scripts/phase0EnrollmentBaseline.js
 *   node scripts/phase0EnrollmentBaseline.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/phase0EnrollmentBaseline.js --skip-db
 *
 * Optional apply increment probe (mutates one test — use staging or dedicated QA test only):
 *   E2E_LOGIN_IDENTIFIER=... E2E_LOGIN_PASSWORD=... node scripts/phase0EnrollmentBaseline.js --apply-test
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const { isApplicationFromOlderCycle } = require('../src/lib/testApplicationCycle');

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

function enrolledLabel(enc, cap) {
  const e = Math.max(0, Number(enc || 0));
  const c = Math.max(0, Number(cap || 0));
  return c > 0 ? `${e}/${c}` : `${e}`;
}

function staticCodeAudit() {
  console.log('\n=== PHASE 0 — STATIC CODE AUDIT (read-only) ===\n');
  let ok = true;

  const testsJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tests.js'), 'utf8');
  const indexJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const resolveJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testResolve.js'), 'utf8');

  const reapplyBlock = testsJs.includes("message: 'Re-enrolled for new test cycle'");
  const reapplyIncrements = /if \(existing\) \{[\s\S]{0,1400}incrementTestEnrolledCount/.test(testsJs);
  ok =
    line(
      !reapplyBlock || reapplyIncrements,
      reapplyIncrements
        ? 'Re-apply path increments enrolled_count'
        : 'KNOWN BUG: re-apply for new cycle does NOT increment enrolled_count (tests.js)',
    ) && ok;

  const cycleResetsCount = indexJs.includes('enrolled_count = 0') && indexJs.includes('is_published = false');
  ok =
    line(
      true,
      cycleResetsCount
        ? 'KNOWN: cycle scheduler resets enrolled_count=0 and unpublishes (index.js)'
        : 'Cycle scheduler enrolled_count reset pattern not found',
    ) && ok;

  const resolveHasEnrollment =
    resolveJs.includes('enrolledCount:') || resolveJs.includes('enrolled_count:');
  ok =
    line(
      resolveHasEnrollment,
      resolveHasEnrollment
        ? 'Resolve payload includes enrollment fields'
        : 'KNOWN BUG: GET /tests/resolve omits enrolledCount (testResolve.js)',
    ) && !resolveHasEnrollment && ok;

  const usesCanonicalApply = testsJs.includes("require('../lib/testApplicationCycle')");
  ok =
    line(
      usesCanonicalApply,
      usesCanonicalApply
        ? 'tests.js imports testApplicationCycle helpers'
        : 'KNOWN: tests.js uses duplicate inline cycle logic (not testApplicationCycle.js)',
    ) && !usesCanonicalApply && ok;

  return ok;
}

async function auditLiveApi(apiBase) {
  console.log('\n=== PHASE 0 — LIVE API (user catalog source) ===');
  console.log(`API: ${apiBase}\n`);

  let ok = true;
  const findings = [];

  const health = await fetchJson(apiBase.replace(/\/v1$/, '') + '/health');
  ok = line(health.ok, `GET /health → ${health.status}`) && ok;

  const catalog = await fetchJson(`${apiBase}/tests?limit=100`);
  const items = Array.isArray(catalog.body?.items) ? catalog.body.items : [];
  ok = line(catalog.ok, `GET /tests?limit=100 → HTTP ${catalog.status}, ${items.length} item(s)`) && ok;

  for (const item of items) {
    const cap = Math.max(0, Number(item.capacityTotal || 0));
    const enc = Math.max(0, Number(item.enrolledCount || 0));
    const rem = Number(item.remainingSeats ?? Math.max(0, cap - enc));
    const mathOk = enc >= 0 && (cap <= 0 || enc <= cap) && rem === Math.max(0, cap - enc);
    ok = line(mathOk, `Catalog "${item.title}": enrolled=${enrolledLabel(enc, cap)} remaining=${rem}`) && ok;
    if (!mathOk) {
      findings.push({ test: item.title, issue: 'catalog_math_mismatch', enc, cap, rem });
    }
    if (cap > 0 && enc === 0) {
      findings.push({ test: item.title, issue: 'zero_enrollment_with_capacity', enc, cap });
    }
  }

  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '');
  let auth = null;

  if (identifier && password) {
    const login = await fetchJson(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (login.ok && login.body?.accessToken) {
      auth = { Authorization: `Bearer ${login.body.accessToken}` };
      ok = line(true, 'POST /auth/login → token received') && ok;
    } else {
      ok = line(true, `Auth skipped — login failed: ${login.body?.error || login.status}`) && ok;
    }
  } else {
    info('Set E2E_LOGIN_IDENTIFIER + E2E_LOGIN_PASSWORD for resolve/my-applications checks');
  }

  if (auth && items[0]?.id) {
    const testId = items[0].id;
    const resolve = await fetchJson(`${apiBase}/tests/resolve?testId=${encodeURIComponent(testId)}`, {
      headers: auth,
    });
    ok = line(resolve.ok, `GET /tests/resolve → HTTP ${resolve.status}`) && ok;
    if (resolve.ok) {
      const hasEnroll =
        Number.isFinite(Number(resolve.body?.enrolledCount)) ||
        Number.isFinite(Number(resolve.body?.capacityTotal));
      ok =
        line(
          hasEnroll,
          hasEnroll
            ? 'Resolve returns enrollment fields'
            : 'Resolve missing enrolledCount/capacityTotal (app may show stale/missing count)',
        ) && ok;
      if (!hasEnroll) {
        findings.push({ test: items[0].title, issue: 'resolve_missing_enrollment' });
      }
    }

    const myApps = await fetchJson(`${apiBase}/tests/my-applications`, { headers: auth });
    const apps = Array.isArray(myApps.body?.items) ? myApps.body.items : [];
    ok = line(myApps.ok, `GET /tests/my-applications → ${apps.length} item(s)`) && ok;
    for (const app of apps.slice(0, 10)) {
      info(
        `my-app "${app.testTitle}": ${enrolledLabel(app.enrolledCount, app.capacityTotal)} applied=${app.appliedAt || '?'}`,
      );
    }

    if (hasFlag('--apply-test') && items[0]) {
      console.log('\n--- Apply increment probe (mutating) ---');
      const before = Number(items[0].enrolledCount || 0);
      const applyRes = await fetchJson(`${apiBase}/tests/${testId}/apply`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
      });
      const catalogAfter = await fetchJson(`${apiBase}/tests?limit=100`);
      const afterItem = (catalogAfter.body?.items || []).find((x) => x.id === testId);
      const after = Number(afterItem?.enrolledCount ?? before);
      const dup = applyRes.body?.alreadyApplied === true;
      const msg = applyRes.body?.message || '';
      const increased = after > before;
      ok =
        line(
          dup || increased || applyRes.body?.reenrolledForNewCycle,
          `Apply probe: before=${before} after=${after} duplicate=${dup} message="${msg}"`,
        ) && ok;
      if (!dup && !increased && msg.includes('Re-enrolled')) {
        findings.push({ test: items[0].title, issue: 'reapply_no_count_increment', before, after });
        ok = line(false, 'Re-enroll did not increase catalog enrolledCount') && ok;
      }
    }
  }

  if (findings.length) {
    console.log('\n--- Live API findings ---');
    for (const f of findings) {
      info(`${f.issue}: ${JSON.stringify(f)}`);
    }
  }

  return ok;
}

async function auditDatabase() {
  console.log('\n=== PHASE 0 — DATABASE (enrollment truth) ===\n');
  let ok = true;

  if (!process.env.DATABASE_URL) {
    return line(true, 'DATABASE_URL not set — run this script on VPS server/ for DB audit');
  }

  try {
    const { rows: published } = await pool.query(
      `SELECT t.id::text AS id, t.title, t.is_published, t.capacity_total, t.enrolled_count,
              t.last_cycle_started_at, t.duration_minutes, t.updated_at,
              (SELECT COUNT(*)::int FROM test_applications ta WHERE ta.test_id = t.id) AS total_apps,
              (SELECT COUNT(*)::int FROM test_applications ta
                 WHERE ta.test_id = t.id
                   AND t.last_cycle_started_at IS NOT NULL
                   AND ta.applied_at >= t.last_cycle_started_at) AS current_cycle_apps
       FROM tests t
       WHERE t.is_published = true
       ORDER BY t.updated_at DESC`,
    );

    ok = line(published.length >= 0, `${published.length} published test(s) in DB`) && ok;

    console.log('\n--- Per-test enrollment matrix (admin DB vs applications) ---');
    console.log('title | db_enrolled | total_apps | current_cycle_apps | capacity | cycle_started');
    console.log('-'.repeat(90));

    const issues = [];

    for (const r of published) {
      const dbEnc = Number(r.enrolled_count || 0);
      const totalApps = Number(r.total_apps || 0);
      const cycleApps = Number(r.current_cycle_apps || 0);
      const cap = Number(r.capacity_total || 0);
      const cycle = r.last_cycle_started_at ? new Date(r.last_cycle_started_at).toISOString() : 'null';

      console.log(
        `${String(r.title).slice(0, 28).padEnd(28)} | ${String(dbEnc).padStart(5)} | ${String(totalApps).padStart(10)} | ${String(cycleApps).padStart(18)} | ${String(cap).padStart(8)} | ${cycle}`,
      );

      if (dbEnc !== totalApps) {
        issues.push({
          title: r.title,
          kind: 'db_count_vs_total_applications',
          enrolled_count: dbEnc,
          total_apps: totalApps,
        });
      }
      if (dbEnc !== cycleApps && r.last_cycle_started_at) {
        issues.push({
          title: r.title,
          kind: 'db_count_vs_current_cycle_apps',
          enrolled_count: dbEnc,
          current_cycle_apps: cycleApps,
        });
      }
      if (cap > 0 && dbEnc === 0 && cycleApps > 0) {
        issues.push({
          title: r.title,
          kind: 'zero_count_but_current_cycle_applications',
          cycleApps,
        });
      }
    }

    const { rows: driftSample } = await pool.query(
      `SELECT t.id::text, t.title, t.enrolled_count, t.last_cycle_started_at,
              ta.applied_at, ta.user_id::text
       FROM tests t
       INNER JOIN test_applications ta ON ta.test_id = t.id
       WHERE t.is_published = true
       ORDER BY t.title, ta.applied_at DESC
       LIMIT 50`,
    );

    let olderCycleApps = 0;
    for (const row of driftSample) {
      if (isApplicationFromOlderCycle(row, row.applied_at)) olderCycleApps += 1;
    }
    info(`Sample applications from older cycle (of ${driftSample.length}): ${olderCycleApps}`);

    if (issues.length) {
      console.log('\n--- DB enrollment issues (baseline) ---');
      for (const issue of issues) {
        info(`${issue.kind} → "${issue.title}" ${JSON.stringify(issue)}`);
        ok = line(false, `${issue.kind}: "${issue.title}"`) && ok;
      }
    } else if (published.length > 0) {
      ok = line(true, 'No DB enrolled_count vs applications mismatches on published tests') && ok;
    }

    return ok;
  } catch (e) {
    return line(false, `DB audit failed: ${e.message}`);
  }
}

function printPhasePlan(findingsSummary) {
  console.log('\n=== PHASE 0 — RECOMMENDED FIX ORDER ===\n');
  info('Phase 1: Re-apply for new cycle must increment enrolled_count (server/tests.js)');
  info('Phase 2: Cycle rollover — keep count + applications in sync (server/index.js)');
  info('Phase 3: Wire testApplicationCycle.js into apply route (single source of truth)');
  info('Phase 4: Android cache invalidation after apply / ON_RESUME');
  info('Phase 5: Add enrollment to resolve or my-applications fallback');
  info('Phase 6: Deploy + e2eEnrollStartTestCheck on production');
  if (findingsSummary) {
    console.log(`\nBaseline captured: ${findingsSummary}`);
  }
}

async function main() {
  const apiBase = argValue('--api') || DEFAULT_API;
  const skipDb = hasFlag('--skip-db');

  console.log('=== PHASE 0 ENROLLMENT BASELINE (read-only) ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  let ok = staticCodeAudit();
  ok = (await auditLiveApi(apiBase)) && ok;
  if (!skipDb) {
    ok = (await auditDatabase()) && ok;
  }

  printPhasePlan(ok ? 'no critical live/db failures in this run' : 'issues found — see FAIL lines above');

  console.log('');
  if (ok) {
    console.log('PASS  Phase 0 enrollment baseline');
    process.exit(0);
  }
  console.error('FAIL  Phase 0 enrollment baseline — issues documented above (expected before fix)');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
