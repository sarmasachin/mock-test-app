'use strict';

/**
 * E2E verify — test catalog cache must not be replaced by placeholder / resolve stub.
 * Mirrors Kotlin logic in ContentRepository + TestsScreenNew (offline simulation).
 *
 * Usage:
 *   node scripts/e2eTestCatalogCacheFix.js
 *   node scripts/e2eTestCatalogCacheFix.js --api https://admin-admin.govmocktest.com/v1
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
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

function hasCatalogDisplayFields(card) {
  return Boolean(
    String(card.id || '').trim() &&
      String(card.questionsMarks || '').trim() &&
      String(card.durationLabel || '').trim(),
  );
}

function hasEnrollmentFields(card) {
  return (
    card.enrolledLabel != null ||
    card.enrolledCount != null ||
    card.remainingSeatsLabel != null ||
    card.remainingSeats != null ||
    (card.capacityTotal != null && Number(card.capacityTotal) > 0)
  );
}

function isPlaceholderTestCard(card) {
  return !String(card.id || '').trim() &&
    String(card.meta || '').toLowerCase().includes('no published test is available');
}

function defaultTests(subcategory) {
  return [{
    id: '',
    title: String(subcategory || 'Test').trim() || 'Test',
    meta: 'No published test is available for this category.',
    enrolledLabel: '0',
    remainingSeatsLabel: '0 seats left',
    subcategory: '',
  }];
}

function mergeCatalogCardPreferExisting(incoming, existing) {
  if (!existing) return incoming;
  if (isPlaceholderTestCard(incoming) && hasCatalogDisplayFields(existing)) return existing;
  if (!hasCatalogDisplayFields(incoming)) {
    if (!hasCatalogDisplayFields(existing)) return incoming;
    return {
      ...existing,
      id: String(incoming.id || existing.id || '').trim(),
      title: String(incoming.title || existing.title || '').trim(),
      meta: String(incoming.meta || existing.meta || '').trim(),
      subcategory: String(incoming.subcategory || existing.subcategory || '').trim(),
    };
  }
  if (!hasEnrollmentFields(incoming) && hasEnrollmentFields(existing)) {
    return {
      ...incoming,
      enrolledLabel: existing.enrolledLabel,
      enrolledCount: existing.enrolledCount,
      remainingSeats: existing.remainingSeats,
      remainingSeatsLabel: existing.remainingSeatsLabel,
      capacityTotal: incoming.capacityTotal ?? existing.capacityTotal,
    };
  }
  return incoming;
}

function simulateLoadTestsForSubcategory({ apiItems, diskCache }) {
  const mapped = (apiItems || [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      subcategory: row.subcategory || '',
      meta: row.metaLine || `${row.questionCount} Q`,
      questionsMarks: `${row.questionCount} Q / ${row.totalMarks || 0} marks`,
      durationLabel: row.durationMinutes >= 60 ? `${Math.floor(row.durationMinutes / 60)} hrs` : `${row.durationMinutes} min`,
      enrolledCount: row.enrolledCount ?? 0,
      enrolledLabel: String(row.enrolledCount ?? 0),
    }))
    .filter((card) => card.id && card.title);

  if (mapped.length > 0) return mapped;
  const disk = (diskCache || []).filter((c) => c.id && !isPlaceholderTestCard(c));
  if (disk.length > 0) return disk;
  return [];
}

function simulateTestsScreenRefresh({ currentTests, freshTests }) {
  const fresh = (freshTests || []).filter((t) => t.id);
  if (fresh.length > 0) return fresh;
  if ((currentTests || []).length > 0) return currentTests;
  return fresh;
}

function simulateAppliedSnapshotUpdate({ previous, effectiveCard }) {
  if (effectiveCard && hasCatalogDisplayFields(effectiveCard)) return effectiveCard;
  return previous ?? null;
}

function simulateCacheTestCardForLookupKey({ existing, incoming }) {
  const merged = mergeCatalogCardPreferExisting(incoming, existing);
  const shouldPersist = hasCatalogDisplayFields(merged) && !isPlaceholderTestCard(merged);
  return { merged, shouldPersist };
}

function readKotlinSources() {
  const repo = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/data/ContentRepository.kt'),
    'utf8',
  );
  const testsScreen = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/newui/tests/TestsScreenNew.kt'),
    'utf8',
  );
  const preview = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt'),
    'utf8',
  );
  const apply = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt'),
    'utf8',
  );
  return { repo, testsScreen, preview, apply };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function liveApiChecks() {
  let ok = true;
  console.log('\n-- Live API catalog --');
  console.log(`API: ${API_BASE}`);

  const health = await fetchJson(`${API_BASE.replace(/\/v1$/, '')}/health`.replace(/([^:]\/)\/+/g, '$1'));
  ok = line(health.ok, `health ${health.status}`) && ok;

  const list = await fetchJson(`${API_BASE}/tests?limit=20`);
  ok = line(list.ok, `GET /tests ${list.status}`) && ok;
  const items = Array.isArray(list.json?.items) ? list.json.items : [];
  if (items.length > 0) {
    ok = line(true, `published catalog rows: ${items.length}`) && ok;
    const withEnrollment = items.filter((it) => Number(it.enrolledCount ?? 0) >= 0 && it.subcategory);
    ok = line(withEnrollment.length > 0, `rows with subcategory: ${withEnrollment.length}`) && ok;
  } else {
    console.log('WARN  live catalog returned 0 items (between cycles / unpublish / prod state) — cache fix still valid');
  }

  const hp = items.filter((it) => /hp|gk/i.test(`${it.title} ${it.subcategory}`));
  if (hp.length) {
    const row = hp[0];
    console.log('INFO  sample HP/GK row:', JSON.stringify({
      title: row.title,
      subcategory: row.subcategory,
      enrolledCount: row.enrolledCount,
      capacityTotal: row.capacityTotal,
      questionCount: row.questionCount,
    }));
    ok = line(Boolean(row.subcategory), 'HP/GK sample has subcategory') && ok;
    ok = line(Number(row.questionCount) > 0, 'HP/GK sample has questionCount') && ok;
  } else {
    console.log('WARN  no HP/GK row in first 20 catalog items — skipping named sample');
  }

  if (items[0]?.subcategory) {
    const sub = encodeURIComponent(items[0].subcategory);
    const subList = await fetchJson(`${API_BASE}/tests?subcategory=${sub}&limit=10`);
    ok = line(subList.ok, `GET /tests?subcategory=… ${subList.status}`) && ok;
    const subItems = Array.isArray(subList.json?.items) ? subList.json.items : [];
    ok = line(subItems.length > 0, `subcategory filter returned ${subItems.length} row(s)`) && ok;
  }

  return ok;
}

async function main() {
  console.log('=== E2E: Test catalog cache fix ===\n');
  let ok = true;

  console.log('-- Offline simulation (Kotlin mirror) --');
  const realCard = {
    id: 'test-uuid-1',
    title: 'HP GK',
    subcategory: 'HP GK',
    meta: '100 Questions · 120 min',
    questionsMarks: '100 Q / 200 marks',
    durationLabel: '2 hrs',
    enrolledLabel: '12/500',
    enrolledCount: 12,
  };
  const stubCard = {
    id: 'test-uuid-1',
    title: 'HP GK',
    meta: 'Between cycles — opens again when republished',
  };
  const placeholder = defaultTests('HP GK')[0];

  ok = line(hasCatalogDisplayFields(realCard), 'real catalog card passes hasCatalogDisplayFields') && ok;
  ok = line(!hasCatalogDisplayFields(stubCard), 'resolve stub fails hasCatalogDisplayFields') && ok;
  ok = line(isPlaceholderTestCard(placeholder), 'defaultTests detected as placeholder') && ok;

  const merged = mergeCatalogCardPreferExisting(stubCard, realCard);
  ok = line(merged.enrolledLabel === '12/500', 'merge keeps enrollment from real card') && ok;
  ok = line(merged.questionsMarks === '100 Q / 200 marks', 'merge keeps questions/marks from real card') && ok;
  ok = line(merged.meta.includes('Between cycles'), 'merge keeps resolve meta when incoming stub') && ok;

  const afterEmptyApi = simulateLoadTestsForSubcategory({ apiItems: [], diskCache: [realCard] });
  ok = line(afterEmptyApi.length === 1 && afterEmptyApi[0].id === realCard.id, 'empty API keeps disk cache (no placeholder)') && ok;
  ok = line(!isPlaceholderTestCard(afterEmptyApi[0]), 'empty API result is not placeholder') && ok;

  const afterEmptyNoCache = simulateLoadTestsForSubcategory({ apiItems: [], diskCache: [] });
  ok = line(afterEmptyNoCache.length === 0, 'empty API + no cache returns empty (not fake card)') && ok;

  const uiAfterRefresh = simulateTestsScreenRefresh({
    currentTests: [realCard],
    freshTests: [],
  });
  ok = line(uiAfterRefresh[0].enrolledLabel === '12/500', 'TestsScreen keeps stale cache when refresh empty') && ok;

  const snapshot = simulateAppliedSnapshotUpdate({
    previous: realCard,
    effectiveCard: stubCard,
  });
  ok = line(snapshot.enrolledLabel === '12/500', 'applied snapshot rejects resolve stub overwrite') && ok;

  const cacheWrite = simulateCacheTestCardForLookupKey({ existing: realCard, incoming: stubCard });
  ok = line(cacheWrite.shouldPersist, 'merged cache still persistable') && ok;
  ok = line(cacheWrite.merged.enrolledLabel === '12/500', 'cache merge preserves enrollment') && ok;

  const placeholderWrite = simulateCacheTestCardForLookupKey({ existing: realCard, incoming: placeholder });
  ok = line(placeholderWrite.merged.enrolledLabel === '12/500', 'placeholder cannot replace real cache') && ok;

  console.log('\n-- Static source checks --');
  const src = readKotlinSources();
  const loadSubFn = src.repo.match(/suspend fun loadTestsForSubcategory[\s\S]*?^    \}/m);
  const loadSubBody = loadSubFn ? loadSubFn[0] : '';
  ok = line(src.repo.includes('isPlaceholderTestCard'), 'ContentRepository has placeholder guard') && ok;
  ok = line(src.repo.includes('hasEnrollmentFields'), 'ContentRepository has enrollment field guard') && ok;
  ok = line(
    /cacheTestCardForLookupKey[\s\S]*?mergeCatalogCardPreferExisting/.test(src.repo),
    'cacheTestCardForLookupKey uses mergeCatalogCardPreferExisting',
  ) && ok;
  ok = line(
    loadSubBody.includes('Server already applies isTestCatalogVisible') &&
      !loadSubBody.includes('isTestListingVisible'),
    'loadTestsForSubcategory: no duplicate isTestListingVisible filter',
  ) && ok;
  ok = line(
    !loadSubBody.includes('defaultTests(sub)'),
    'loadTestsForSubcategory does not return defaultTests(sub) on miss',
  ) && ok;
  ok = line(
    /else\s*\{\s*\n\s*emptyList\(\)/.test(loadSubBody),
    'loadTestsForSubcategory returns emptyList() when API has no rows',
  ) && ok;
  ok = line(src.testsScreen.includes('fresh.isNotEmpty() -> fresh'), 'TestsScreen stale-while-revalidate guard') && ok;
  ok = line(
    src.testsScreen.includes('Lifecycle.Event.ON_RESUME') && src.testsScreen.includes('testsReloadKey'),
    'TestsScreen ON_RESUME enrollment refresh',
  ) && ok;
  ok = line(src.preview.includes('hasCatalogDisplayFields(it)'), 'StartTestPreview guards appliedSnapshots') && ok;
  ok = line(src.apply.includes('hasCatalogDisplayFields(it)'), 'Apply screen guards publishedTest') && ok;

  ok = (await liveApiChecks()) && ok;

  if (!ok) {
    console.error('\nE2E_TEST_CATALOG_CACHE_FIX_FAILED');
    process.exit(1);
  }
  console.log('\nE2E_TEST_CATALOG_CACHE_FIX_OK');
}

main().catch((e) => {
  console.error('e2e_test_catalog_cache_fix_error', e.message || e);
  process.exit(1);
});
