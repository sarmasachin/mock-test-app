'use strict';

/**
 * Phase 2 — strict applied-entry lookup (offline mirror of AppPreferencesRepository.kt).
 * Stale catalog cards must not mark a different test as applied.
 */

const fs = require('fs');
const path = require('path');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function catalogLookupKeyMatchesCard(key, card) {
  const k = String(key || '').trim();
  if (!k) return false;
  const title = String(card?.title || '').trim();
  const sub = String(card?.subcategory || '').trim();
  if (title && k.toLowerCase() === title.toLowerCase()) return true;
  if (sub && k.toLowerCase() === sub.toLowerCase()) return true;
  return false;
}

function findAppliedEntryForTestLookup(lookupKey, catalogCard, entries) {
  const key = String(lookupKey || '').trim();
  if (!key) return null;
  const active = (entries || []).filter(Boolean);
  const direct = active.find((e) => e.testName.toLowerCase() === key.toLowerCase());
  if (direct) return direct;
  if (!catalogCard) return null;
  if (!catalogLookupKeyMatchesCard(key, catalogCard)) return null;
  const cardId = String(catalogCard.id || '').trim();
  if (cardId) {
    const byId = active.find(
      (e) => String(e.testId || '').trim() && String(e.testId).toLowerCase() === cardId.toLowerCase(),
    );
    if (byId) return byId;
  }
  const cardTitle = String(catalogCard.title || '').trim();
  if (cardTitle) {
    const byTitle = active.find((e) => e.testName.toLowerCase() === cardTitle.toLowerCase());
    if (byTitle) return byTitle;
  }
  return null;
}

let ok = true;

const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
ok = line(prefs.includes('catalogLookupKeyMatchesCard'), 'Kotlin: catalogLookupKeyMatchesCard helper') && ok;
ok = line(
  prefs.includes('if (!catalogLookupKeyMatchesCard(key, card)) return null'),
  'Kotlin: card match gated on lookup key',
) && ok;
ok = line(
  !/if \(card\.title\.isNotBlank\(\)\) \{\s*\n\s*entries\.firstOrNull/.test(prefs),
  'Kotlin: removed blind card.title applied match',
) && ok;

const applied = [
  { testName: 'HP GK', testId: '2c7f05c8-7048-43f7-aec3-3013bc02acf2' },
];

const ffCardCorrect = { id: 'bf26f870-8d31-4feb-ae8d-1c16f10b1dff', title: 'ff', subcategory: 'ff' };
const ffCardStale = { id: '2c7f05c8-7048-43f7-aec3-3013bc02acf2', title: 'HP GK', subcategory: 'HP GK' };
const hpGkCard = { id: '2c7f05c8-7048-43f7-aec3-3013bc02acf2', title: 'HP GK', subcategory: 'HP GK' };
const subCard = { id: 'uuid-a', title: 'SSC CGL Mock 1', subcategory: 'SSC CGL' };
const appliedSub = [{ testName: 'SSC CGL Mock 1', testId: 'uuid-a' }];

ok = line(
  findAppliedEntryForTestLookup('ff', ffCardCorrect, applied) == null,
  'ff + correct card + only HP GK applied → null',
) && ok;
ok = line(
  findAppliedEntryForTestLookup('ff', ffCardStale, applied) == null,
  'ff + stale HP GK card → null (no false positive)',
) && ok;
ok = line(
  findAppliedEntryForTestLookup('HP GK', hpGkCard, applied)?.testName === 'HP GK',
  'HP GK + correct card → HP GK entry',
) && ok;
ok = line(
  findAppliedEntryForTestLookup('HP GK', null, applied)?.testName === 'HP GK',
  'HP GK title-only lookup (no card) → direct match',
) && ok;
ok = line(
  findAppliedEntryForTestLookup('SSC CGL', subCard, appliedSub)?.testId === 'uuid-a',
  'subcategory navigation → applied catalog title',
) && ok;

const applyScreen = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');
ok = line(applyScreen.includes('testId = idToSave'), 'Apply screen persists testId on apply') && ok;

if (ok) {
  console.log('\nAPPLY_LOOKUP_PHASE2_OK');
  process.exit(0);
}
console.log('\nAPPLY_LOOKUP_PHASE2_FAILED');
process.exit(1);
