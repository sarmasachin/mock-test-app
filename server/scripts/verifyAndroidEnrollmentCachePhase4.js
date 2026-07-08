'use strict';

/**
 * Phase 4 — Android enrollment cache merge (mirrors ContentRepository.kt + TestsScreenNew.kt).
 *
 * Usage:
 *   node scripts/verifyAndroidEnrollmentCachePhase4.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

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

function simulateCacheTestCardForLookupKey({ existing, incoming }) {
  const merged = mergeCatalogCardPreferExisting(incoming, existing);
  const shouldPersist = hasCatalogDisplayFields(merged) && !isPlaceholderTestCard(merged);
  return { merged, shouldPersist };
}

function readSources() {
  const repo = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/data/ContentRepository.kt'),
    'utf8',
  );
  const testsScreen = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/newui/tests/TestsScreenNew.kt'),
    'utf8',
  );
  return { repo, testsScreen };
}

function main() {
  console.log('=== Phase 4: Android enrollment cache ===\n');
  let ok = true;

  const realCard = {
    id: 'test-uuid-1',
    title: 'HP GK',
    subcategory: 'HP GK',
    meta: '100 Questions · 120 min',
    questionsMarks: '100 Q / 200 marks',
    durationLabel: '2 hrs',
    enrolledLabel: '12/500',
    enrolledCount: 12,
    capacityTotal: 500,
    remainingSeats: 488,
    remainingSeatsLabel: '488 seats left',
  };
  const stubCard = {
    id: 'test-uuid-1',
    title: 'HP GK',
    meta: 'Between cycles — opens again when republished',
  };
  const placeholder = {
    id: '',
    title: 'HP GK',
    meta: 'No published test is available for this category.',
    enrolledLabel: '0',
    remainingSeatsLabel: '0 seats left',
    subcategory: '',
  };
  const freshApiZero = {
    ...realCard,
    enrolledLabel: '0/500',
    enrolledCount: 0,
    remainingSeats: 500,
    remainingSeatsLabel: '500 seats left',
  };
  const partialCatalog = {
    id: realCard.id,
    title: realCard.title,
    meta: realCard.meta,
    questionsMarks: realCard.questionsMarks,
    durationLabel: realCard.durationLabel,
  };

  ok = line(hasEnrollmentFields(realCard), 'real card has enrollment fields') && ok;
  ok = line(!hasEnrollmentFields(stubCard), 'resolve stub lacks enrollment fields') && ok;

  const mergedStub = mergeCatalogCardPreferExisting(stubCard, realCard);
  ok = line(mergedStub.enrolledLabel === '12/500', 'stub merge keeps enrollment from real card') && ok;
  ok = line(mergedStub.meta.includes('Between cycles'), 'stub merge keeps resolve meta') && ok;
  ok = line(mergedStub.questionsMarks === '100 Q / 200 marks', 'stub merge keeps catalog display fields') && ok;

  const mergedFresh = mergeCatalogCardPreferExisting(freshApiZero, realCard);
  ok = line(mergedFresh.enrolledLabel === '0/500', 'fresh API enrollment wins over stale cache') && ok;

  const mergedPartial = mergeCatalogCardPreferExisting(partialCatalog, realCard);
  ok = line(mergedPartial.enrolledLabel === '12/500', 'partial catalog merge keeps enrollment from cache') && ok;

  const cacheStub = simulateCacheTestCardForLookupKey({ existing: realCard, incoming: stubCard });
  ok = line(cacheStub.merged.enrolledLabel === '12/500', 'cache merge preserves enrollment on stub write') && ok;
  ok = line(cacheStub.shouldPersist, 'merged cache row is persistable') && ok;

  const cachePlaceholder = simulateCacheTestCardForLookupKey({ existing: realCard, incoming: placeholder });
  ok = line(cachePlaceholder.merged.enrolledLabel === '12/500', 'placeholder cannot replace real cache') && ok;

  console.log('\n-- Static Kotlin checks --');
  const { repo, testsScreen } = readSources();
  ok = line(repo.includes('fun hasEnrollmentFields'), 'ContentRepository has hasEnrollmentFields') && ok;
  ok = line(repo.includes('mergeTestCardIntoMemory'), 'ContentRepository has mergeTestCardIntoMemory') && ok;
  ok = line(
    /cacheTestCardForLookupKey[\s\S]*?mergeCatalogCardPreferExisting/.test(repo),
    'cacheTestCardForLookupKey uses mergeCatalogCardPreferExisting',
  ) && ok;
  ok = line(
    /cacheTestCardForLookupKey[\s\S]*?!isPlaceholderTestCard/.test(repo),
    'cacheTestCardForLookupKey guards placeholder persistence',
  ) && ok;
  ok = line(
    /loadTestsForSubcategory[\s\S]*?mergeTestCardIntoMemory/.test(repo),
    'loadTestsForSubcategory merges into memory',
  ) && ok;
  ok = line(
    testsScreen.includes('Lifecycle.Event.ON_RESUME') && testsScreen.includes('testsReloadKey'),
    'TestsScreen ON_RESUME bumps testsReloadKey',
  ) && ok;

  if (!ok) {
    console.error('\nVERIFY_ANDROID_ENROLLMENT_CACHE_PHASE4_FAILED');
    process.exit(1);
  }
  console.log('\nVERIFY_ANDROID_ENROLLMENT_CACHE_PHASE4_OK');
}

main();
