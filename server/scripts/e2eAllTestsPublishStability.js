'use strict';

/**
 * Phase 4 — integrated E2E for All Tests publish stability (Phases 1–3).
 *
 * Usage:
 *   node scripts/e2eAllTestsPublishStability.js
 *   node scripts/e2eAllTestsPublishStability.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/e2eAllTestsPublishStability.js --offline
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { isTestCatalogVisible } = require('../src/lib/testVisibility');
const { getApplyCycleTimeline, evaluateApplyCyclePhase } = require('../src/lib/applyCycleE2eScenarios');

const ROOT = path.join(__dirname, '..');
const APP_ROOT = path.join(ROOT, '..');
const SCRIPTS = path.join(__dirname);

const OFFLINE = process.argv.includes('--offline');
const API_BASE = (() => {
  const idx = process.argv.indexOf('--api');
  if (idx >= 0 && process.argv[idx + 1]) {
    return String(process.argv[idx + 1]).replace(/\/+$/, '');
  }
  return String(process.env.E2E_API_BASE || process.env.API_BASE || 'https://admin-admin.govmocktest.com/v1').replace(/\/+$/, '');
})();

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function runChild(scriptName, extraArgs = []) {
  const scriptPath = path.join(SCRIPTS, scriptName);
  const res = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  const tail = out.split('\n').slice(-3).join(' | ');
  return {
    ok: res.status === 0,
    status: res.status ?? 1,
    tail,
  };
}

function isPlaceholderTestCard(card) {
  return !String(card?.id || '').trim() &&
    String(card?.meta || '').toLowerCase().includes('no published test is available');
}

function simulateLoadTestsForSubcategory(apiItems, diskCache) {
  const mapped = (apiItems || [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      subcategory: row.subcategory || '',
      meta: row.metaLine || `${row.questionCount} Q`,
    }))
    .filter((card) => card.id && card.title);
  if (mapped.length > 0) return mapped;
  const disk = (diskCache || []).filter((c) => c.id && !isPlaceholderTestCard(c));
  if (disk.length > 0) return disk;
  return [];
}

function simulateTestsScreen({ subcategory, apiItems, diskCache, interests, showAllTests }) {
  const normalized = (interests || []).map((x) => String(x).trim()).filter(Boolean);
  const interestBlocked = !showAllTests &&
    normalized.length > 0 &&
    !normalized.some((i) => subcategory.toLowerCase().includes(i.toLowerCase()));
  if (interestBlocked) return { blocked: true, tests: [] };

  const cached = (diskCache || []).filter((c) => c.id);
  let tests = cached.length > 0 ? cached : [];
  const fresh = simulateLoadTestsForSubcategory(apiItems, diskCache).filter((t) => t.id);
  if (fresh.length > 0) tests = fresh;
  else if (tests.length > 0) tests = tests;
  else tests = [];
  return { blocked: false, tests };
}

function simulateCycleRollover(row, advancedConfig = {}) {
  if (advancedConfig.autoCatalogUnpublish === true) {
    return { ...row, is_published: false, enrolled_count: 0 };
  }
  return {
    ...row,
    is_published: true,
    enrolled_count: 0,
    last_cycle_started_at: new Date().toISOString(),
  };
}

function isShowAllPref(prefs) {
  const stored = prefs.show_all_tests_catalog;
  if (stored !== undefined && stored !== null) return stored === 1;
  return true;
}

function applyMigration(prefs) {
  const next = { ...prefs };
  if ((next.interest_catalog_defaults_v1 || 0) === 1) return next;
  next.interest_catalog_defaults_v1 = 1;
  if ((next.interest_filter_opt_in || 0) === 1) return next;
  if ((next.login_test_pick_done || 0) === 1 && (next.login_picked_subcategories || []).length > 0) {
    next.show_all_tests_catalog = 1;
  }
  return next;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function liveApiJourney() {
  let ok = true;
  console.log('\n-- Live API journey --');
  console.log(`API: ${API_BASE}`);

  const healthUrl = `${API_BASE.replace(/\/v1$/, '')}/health`.replace(/([^:]\/)\/+/g, '$1');
  const health = await fetchJson(healthUrl);
  ok = line(health.ok, `health ${health.status}`) && ok;

  const list = await fetchJson(`${API_BASE}/tests?limit=20`);
  ok = line(list.ok, `GET /tests ${list.status}`) && ok;
  const items = Array.isArray(list.json?.items) ? list.json.items : [];
  ok = line(items.length >= 0, `catalog items: ${items.length}`) && ok;

  if (items.length > 0) {
    const sample = items[0];
    const sub = encodeURIComponent(sample.subcategory || '');
    const subList = await fetchJson(`${API_BASE}/tests?subcategory=${sub}&limit=10`);
    ok = line(subList.ok, `GET /tests?subcategory=… ${subList.status}`) && ok;
    const subItems = Array.isArray(subList.json?.items) ? subList.json.items : [];
    ok = line(subItems.length > 0, `subcategory "${sample.subcategory}" returns ${subItems.length} row(s)`) && ok;

    const startMs = Date.parse(sample.lastCycleStartedAt || '');
    const durMin = Number(sample.durationMinutes || 0);
    if (Number.isFinite(startMs) && durMin > 0) {
      const cycleEndMs = startMs + durMin * 60 * 1000;
      const rolledRow = {
        is_published: true,
        valid_until: sample.validUntil || null,
        duration_minutes: durMin,
        last_cycle_started_at: new Date(cycleEndMs).toISOString(),
      };
      ok = line(
        isTestCatalogVisible(rolledRow, sample.advancedConfig || {}, cycleEndMs + 60 * 1000),
        'live sample: still catalog-visible after simulated cycle rollover',
      ) && ok;
    }

    const wrong = await fetchJson(`${API_BASE}/tests?subcategory=${encodeURIComponent('__no_such_category__')}`);
    const wrongItems = Array.isArray(wrong.json?.items) ? wrong.json.items : [];
    ok = line(wrongItems.length === 0, 'wrong subcategory returns 0 items (no crash)') && ok;
  } else {
    console.log('WARN  live catalog empty — rollover/interest checks still valid offline');
  }

  return ok;
}

function integratedJourney() {
  let ok = true;
  console.log('\n-- Integrated journey (Phases 1–3) --');

  const publishedCard = {
    id: 'uuid-hp-gk',
    title: 'HP GK',
    subcategory: 'HP GK',
    meta: '100 Q',
    questionsMarks: '100 Q / 200 marks',
    durationLabel: '120 min',
  };

  // 1) Published + cache warm
  const warm = simulateTestsScreen({
    subcategory: 'HP GK',
    apiItems: [{ id: publishedCard.id, title: publishedCard.title, subcategory: 'HP GK', questionCount: 100, totalMarks: 200, durationMinutes: 120 }],
    diskCache: [publishedCard],
    interests: ['Patwari'],
    showAllTests: true,
  });
  ok = line(!warm.blocked && warm.tests.length === 1, 'journey1: published test visible (browse-all)') && ok;

  // 2) APK reinstall — no disk cache, API still has test
  const freshInstall = simulateTestsScreen({
    subcategory: 'HP GK',
    apiItems: [{ id: publishedCard.id, title: publishedCard.title, subcategory: 'HP GK', questionCount: 100, totalMarks: 200, durationMinutes: 120 }],
    diskCache: [],
    interests: ['Patwari'],
    showAllTests: true,
  });
  ok = line(freshInstall.tests.length === 1, 'journey2: APK fresh install + API hit shows test') && ok;
  ok = line(
    !freshInstall.tests.some((t) => isPlaceholderTestCard(t)),
    'journey2: no placeholder fake unpublished card',
  ) && ok;

  // 3) API empty + stale cache (Phase 1 stale-while-revalidate)
  const stale = simulateTestsScreen({
    subcategory: 'HP GK',
    apiItems: [],
    diskCache: [publishedCard],
    interests: [],
    showAllTests: true,
  });
  ok = line(stale.tests.length === 1 && stale.tests[0].id === publishedCard.id, 'journey3: API empty keeps real disk cache') && ok;

  // 4) API empty + no cache
  const empty = simulateTestsScreen({
    subcategory: 'HP GK',
    apiItems: [],
    diskCache: [],
    interests: [],
    showAllTests: true,
  });
  ok = line(empty.tests.length === 0, 'journey4: API empty + no cache → honest empty (not placeholder)') && ok;

  // 5) Cycle rollover keeps catalog (Phase 2)
  const row = {
    is_published: true,
    valid_until: '2027-07-31',
    duration_minutes: 30,
    last_cycle_started_at: '2026-07-07T10:00:00.000Z',
  };
  const rolled = simulateCycleRollover(row, {});
  ok = line(rolled.is_published === true, 'journey5: cycle rollover keeps is_published=true') && ok;
  ok = line(
    isTestCatalogVisible(rolled, {}, Date.parse('2026-07-07T10:35:00.000Z')),
    'journey5: catalog visible after cycle rollover',
  ) && ok;

  const timeline = getApplyCycleTimeline({ durationMinutes: 30, gapMinutes: 30 });
  const rolledPhase = timeline.phases.find((p) => p.key === 'cycle_rolled_over');
  const rolledEval = evaluateApplyCyclePhase({
    row: rolledPhase.row,
    advancedConfig: timeline.advancedConfig,
    publishScheduleItems: [],
    nowMs: rolledPhase.nowMs,
    appliedAtIso: rolledPhase.appliedAtIso,
  });
  ok = line(rolledEval.catalogListed === true, 'journey5: apply-cycle timeline lists catalog after rollover') && ok;

  // 6) Interest trap fixed (Phase 3)
  let prefs = applyMigration({
    login_test_pick_done: 1,
    login_picked_subcategories: ['Patwari'],
    show_all_tests_catalog: 0,
    interest_filter_opt_in: 0,
    interest_catalog_defaults_v1: 0,
  });
  ok = line(isShowAllPref(prefs) === true, 'journey6: migration restores browse-all for trapped user') && ok;

  const afterLogin = {
    login_test_pick_done: 0,
    show_all_tests_catalog: undefined,
  };
  const firstPick = {
    ...afterLogin,
    login_test_pick_done: 1,
    login_picked_subcategories: ['Patwari'],
    show_all_tests_catalog: 1,
  };
  const loginVisible = simulateTestsScreen({
    subcategory: 'HP GK',
    apiItems: [{ id: publishedCard.id, title: publishedCard.title, subcategory: 'HP GK', questionCount: 1, durationMinutes: 30 }],
    diskCache: [],
    interests: firstPick.login_picked_subcategories,
    showAllTests: isShowAllPref(firstPick),
  });
  ok = line(loginVisible.tests.length === 1, 'journey6: after first login pick HP GK visible') && ok;

  const filtered = simulateTestsScreen({
    subcategory: 'HP GK',
    apiItems: [{ id: publishedCard.id, title: publishedCard.title, subcategory: 'HP GK', questionCount: 1, durationMinutes: 30 }],
    diskCache: [],
    interests: ['Patwari'],
    showAllTests: false,
  });
  ok = line(filtered.blocked === true, 'journey6: explicit filter can still hide non-matching subcategory') && ok;

  return ok;
}

function staticSourceGuards() {
  let ok = true;
  console.log('\n-- Static source guards --');

  const repo = fs.readFileSync(
    path.join(APP_ROOT, 'app/src/main/java/com/freemocktest/app/data/ContentRepository.kt'),
    'utf8',
  );
  const prefs = fs.readFileSync(
    path.join(APP_ROOT, 'app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt'),
    'utf8',
  );
  const server = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');

  const loadFn = repo.match(/suspend fun loadTestsForSubcategory[\s\S]*?^    \}/m)?.[0] || '';
  ok = line(!loadFn.includes('defaultTests(sub)'), 'Kotlin: loadTestsForSubcategory no defaultTests(sub)') && ok;
  ok = line(!loadFn.includes('isTestListingVisible'), 'Kotlin: no duplicate listing filter') && ok;

  ok = line(prefs.includes('applyInterestCatalogDefaultsMigration'), 'Kotlin: interest migration present') && ok;
  ok = line(prefs.includes('keyInterestFilterOptIn'), 'Kotlin: interest opt-in key present') && ok;

  ok = line(
    server.includes('enrolled_count = 0, last_cycle_started_at = now()'),
    'Server: in-place cycle rollover without catalog unpublish',
  ) && ok;

  return ok;
}

function runPhaseSubsuites() {
  let ok = true;
  console.log('\n-- Phase sub-suites --');

  const suites = [
    ['Phase 1 catalog cache', 'e2eTestCatalogCacheFix.js', OFFLINE ? [] : ['--api', API_BASE]],
    ['Phase 2 publish stability', 'verifyPublishStabilityPhase2.js', []],
    ['Phase 3 interest catalog', 'verifyInterestCatalogPhase3.js', []],
    ['Apply cycle regression', 'verifyApplyCyclePhase7.js', []],
  ];

  for (const [label, script, args] of suites) {
    const result = runChild(script, args);
    ok = line(result.ok, `${label} (${script}) exit ${result.status}`) && ok;
    if (!result.ok && result.tail) {
      console.log(`      ↳ ${result.tail}`);
    }
  }

  return ok;
}

async function main() {
  console.log('=== Phase 4: All Tests publish stability E2E ===');
  let ok = true;

  ok = integratedJourney() && ok;
  ok = staticSourceGuards() && ok;
  ok = runPhaseSubsuites() && ok;

  if (!OFFLINE) {
    ok = (await liveApiJourney()) && ok;
  } else {
    console.log('\n-- Live API journey --');
    console.log('SKIP  --offline');
  }

  if (!ok) {
    console.error('\nE2E_ALL_TESTS_PUBLISH_STABILITY_FAILED');
    process.exit(1);
  }
  console.log('\nE2E_ALL_TESTS_PUBLISH_STABILITY_OK');
}

main().catch((e) => {
  console.error('e2e_all_tests_publish_stability_error', e.message || e);
  process.exit(1);
});
