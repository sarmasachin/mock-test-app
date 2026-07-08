'use strict';

/**
 * Phase 3 verify — interest filter must not hide catalog until user opts in.
 * Mirrors UserInterestUtils + AppPreferencesRepository rules (offline).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function normalizeInterests(list) {
  const seen = new Map();
  for (const item of list || []) {
    const trimmed = String(item || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function subcategoryMatchesAnyInterest(testSubcategory, interests) {
  const list = normalizeInterests(interests);
  if (!list.length) return true;
  const sub = String(testSubcategory || '').trim().toLowerCase();
  return list.some((filter) => sub.includes(String(filter).trim().toLowerCase()));
}

function isInterestBlocked({ subcategory, interests, showAllTests }) {
  const normalized = normalizeInterests(interests);
  if (showAllTests || normalized.length === 0) return false;
  return !subcategoryMatchesAnyInterest(subcategory, normalized);
}

function isShowAllTestsCatalogPref(prefs) {
  const stored = prefs.show_all_tests_catalog;
  if (stored !== undefined && stored !== null) return stored === 1;
  return true;
}

function applyInterestCatalogDefaultsMigration(prefs) {
  const next = { ...prefs };
  if ((next.interest_catalog_defaults_v1 || 0) === 1) return next;
  next.interest_catalog_defaults_v1 = 1;
  if ((next.interest_filter_opt_in || 0) === 1) return next;
  const pickDone = (next.login_test_pick_done || 0) === 1;
  const subs = normalizeInterests(next.login_picked_subcategories || []);
  if (pickDone && subs.length > 0) {
    next.show_all_tests_catalog = 1;
  }
  return next;
}

function saveLoginInterestPick(prefs, subs) {
  const normalized = normalizeInterests(subs);
  const wasPickDone = (prefs.login_test_pick_done || 0) === 1;
  const next = {
    ...prefs,
    login_picked_subcategories: normalized,
    login_test_pick_done: 1,
  };
  if (!wasPickDone && normalized.length > 0) {
    next.show_all_tests_catalog = 1;
  }
  return next;
}

function readKotlinSources() {
  const repo = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt'),
    'utf8',
  );
  const app = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/freemocktest/app/MockTestApp.kt'),
    'utf8',
  );
  return { repo, app };
}

function main() {
  let ok = true;
  console.log('=== Phase 3: Interest catalog defaults ===\n');

  ok = line(
    !isInterestBlocked({
      subcategory: 'HP GK',
      interests: ['Patwari'],
      showAllTests: true,
    }),
    'browse-all: HP GK visible even when not in interests',
  ) && ok;

  ok = line(
    isInterestBlocked({
      subcategory: 'HP GK',
      interests: ['Patwari'],
      showAllTests: false,
    }),
    'opt-in filter: HP GK hidden when not in interests',
  ) && ok;

  ok = line(
    !isInterestBlocked({
      subcategory: 'HP GK',
      interests: [],
      showAllTests: false,
    }),
    'empty interests never block catalog',
  ) && ok;

  const afterLoginPick = saveLoginInterestPick({}, ['Patwari']);
  ok = line(afterLoginPick.show_all_tests_catalog === 1, 'login pick sets browse-all=true') && ok;
  ok = line(
    !isInterestBlocked({
      subcategory: 'HP GK',
      interests: afterLoginPick.login_picked_subcategories,
      showAllTests: isShowAllTestsCatalogPref(afterLoginPick),
    }),
    'after login pick: all subcategories visible by default',
  ) && ok;

  const trappedUser = {
    login_test_pick_done: 1,
    login_picked_subcategories: ['Patwari'],
    show_all_tests_catalog: 0,
    interest_filter_opt_in: 0,
    interest_catalog_defaults_v1: 0,
  };
  const migrated = applyInterestCatalogDefaultsMigration(trappedUser);
  ok = line(migrated.show_all_tests_catalog === 1, 'migration fixes implicit filter trap') && ok;

  const explicitFilterUser = {
    ...trappedUser,
    interest_filter_opt_in: 1,
  };
  const explicitAfter = applyInterestCatalogDefaultsMigration(explicitFilterUser);
  ok = line(explicitAfter.show_all_tests_catalog === 0, 'migration respects explicit Sirf mere tests') && ok;

  ok = line(isShowAllTestsCatalogPref({}) === true, 'unset pref defaults to browse-all') && ok;
  ok = line(isShowAllTestsCatalogPref({ show_all_tests_catalog: 0 }) === false, 'stored 0 = filter mode') && ok;

  ok = line(
    saveLoginInterestPick(
      { login_test_pick_done: 1, show_all_tests_catalog: 0, interest_filter_opt_in: 1 },
      ['SSC'],
    ).show_all_tests_catalog === 0,
    'profile interest save keeps explicit filter mode',
  ) && ok;

  const src = readKotlinSources();
  ok = line(src.repo.includes('applyInterestCatalogDefaultsMigration'), 'Kotlin: migration function exists') && ok;
  ok = line(src.repo.includes('keyInterestFilterOptIn'), 'Kotlin: explicit opt-in key') && ok;
  ok = line(
    !src.repo.includes('saveProfileUserInterests') ||
      !/saveProfileUserInterests[\s\S]*setShowAllTestsCatalog\(false\)/.test(src.repo),
    'Kotlin: saveProfileUserInterests does not force filter off',
  ) && ok;
  ok = line(
    /saveLoginInterestPick[\s\S]*!wasPickDone && subs\.isNotEmpty\(\)/.test(src.repo),
    'Kotlin: login pick enables browse-all only on first pick',
  ) && ok;
  ok = line(
    src.app.includes('applyInterestCatalogDefaultsMigration'),
    'Kotlin: migration runs on app start',
  ) && ok;

  if (!ok) {
    console.error('\nINTEREST_CATALOG_PHASE3_FAILED');
    process.exit(1);
  }
  console.log('\nINTEREST_CATALOG_PHASE3_OK');
}

main();
