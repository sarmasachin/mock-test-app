'use strict';

/**
 * Phase 0 verify — interest filter spec (offline, no DB).
 * Run: npm run verify:interest-phase0
 */

const assert = require('assert');
const {
  MAX_USER_INTERESTS,
  normalizeInterestSubcategories,
  subcategoryMatchesSqlFilter,
  subcategoryMatchesAnyInterest,
  isShowToUsersForCatalog,
  shouldIncludeInUserCatalog,
  extractEnabledLevel3FromExamCategories,
  filterLevel3LabelsForInterests,
  auditSubcategoryAlignment,
} = require('../src/lib/userInterests');

function line(ok, label) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`  [${mark}] ${label}`);
  return ok;
}

let ok = true;

// --- normalizeInterestSubcategories ---
const norm = normalizeInterestSubcategories(['  HP GK ', 'hp gk', 'SSC', '', null, 'SSC']);
ok = line(norm.length === 2, 'dedupe case-insensitive interests') && ok;
ok = line(norm.includes('HP GK') && norm.includes('SSC'), 'keeps canonical trimmed labels') && ok;

const capped = normalizeInterestSubcategories(
  Array.from({ length: 30 }, (_, i) => `Cat ${i}`),
);
ok = line(capped.length === MAX_USER_INTERESTS, `caps at MAX_USER_INTERESTS (${MAX_USER_INTERESTS})`) && ok;

ok = line(normalizeInterestSubcategories([]).length === 0, 'empty input → empty') && ok;
ok = line(normalizeInterestSubcategories(null).length === 0, 'null input → empty') && ok;

// --- subcategoryMatchesSqlFilter (ILIKE '%filter%') ---
ok = line(subcategoryMatchesSqlFilter('HP GK', 'HP GK'), 'exact subcategory match') && ok;
ok = line(subcategoryMatchesSqlFilter('HP GK Mock Series', 'HP GK'), 'subcategory contains filter') && ok;
ok = line(!subcategoryMatchesSqlFilter('SSC CGL', 'HP GK'), 'different subcategory no match') && ok;
ok = line(!subcategoryMatchesSqlFilter('', 'HP GK'), 'blank subcategory no match') && ok;
ok = line(subcategoryMatchesSqlFilter('HP GK', ''), 'empty filter matches all') && ok;

// --- subcategoryMatchesAnyInterest ---
ok = line(
  subcategoryMatchesAnyInterest('HP GK Test', ['SSC', 'HP GK']),
  'matches any of multiple interests',
) && ok;
ok = line(
  subcategoryMatchesAnyInterest('Railway', []),
  'no interests → match all (legacy fallback)',
) && ok;

// --- show_to_users catalog flag ---
ok = line(isShowToUsersForCatalog({}), 'missing show_to_users → visible') && ok;
ok = line(isShowToUsersForCatalog({ show_to_users: true }), 'show_to_users true') && ok;
ok = line(!isShowToUsersForCatalog({ show_to_users: false }), 'show_to_users false hidden') && ok;
ok = line(!isShowToUsersForCatalog({ showToUsers: false }), 'showToUsers camelCase false') && ok;

// --- shouldIncludeInUserCatalog ---
const testRow = { subcategory: 'HP GK', show_to_users: true };
ok = line(
  shouldIncludeInUserCatalog(testRow, { userInterests: ['HP GK'], showAllTests: false }),
  'interest match included',
) && ok;
ok = line(
  !shouldIncludeInUserCatalog(testRow, { userInterests: ['SSC'], showAllTests: false }),
  'non-matching interest excluded',
) && ok;
ok = line(
  shouldIncludeInUserCatalog(testRow, { userInterests: ['SSC'], showAllTests: true }),
  'browse-all bypasses interest',
) && ok;
ok = line(
  !shouldIncludeInUserCatalog({ subcategory: 'HP GK', show_to_users: false }, { userInterests: ['HP GK'] }),
  'show_to_users false hidden from catalog',
) && ok;
ok = line(
  shouldIncludeInUserCatalog(
    { subcategory: 'HP GK', show_to_users: false },
    { userInterests: ['SSC'], isApplied: true },
  ),
  'applied test always shown even if show_to_users false',
) && ok;
ok = line(
  shouldIncludeInUserCatalog(testRow, { userInterests: [] }),
  'no interests → show all (legacy)',
) && ok;

// --- examCategories level3 ---
const examCats = {
  items: [
    { level1: 'State', level2: 'HP', level3: 'HP GK', enabled: true },
    { level1: 'Central', level2: 'SSC', level3: 'SSC CGL', enabled: true },
    { level1: 'Hidden', level2: 'X', level3: 'Off', enabled: false },
  ],
};
const level3 = extractEnabledLevel3FromExamCategories(examCats);
ok = line(level3.length === 2, 'extract enabled level3 only') && ok;
ok = line(level3.includes('HP GK') && level3.includes('SSC CGL'), 'level3 labels correct') && ok;

const filtered = filterLevel3LabelsForInterests(level3, ['HP GK'], false);
ok = line(filtered.length === 1 && filtered[0] === 'HP GK', 'filter level3 by interest') && ok;
ok = line(filterLevel3LabelsForInterests(level3, ['HP GK'], true).length === 2, 'browse-all keeps all level3') && ok;

// --- auditSubcategoryAlignment ---
const auditGood = auditSubcategoryAlignment(examCats, [
  { title: 'T1', subcategory: 'HP GK' },
  { title: 'T2', subcategory: 'SSC CGL' },
]);
ok = line(auditGood.ok, 'alignment OK when subs match categories') && ok;

const auditBad = auditSubcategoryAlignment(examCats, [
  { title: 'Orphan', subcategory: 'Unknown Exam' },
  { title: 'NoSub', subcategory: '' },
]);
ok = line(!auditBad.ok, 'alignment fails on mismatches') && ok;
ok = line(auditBad.testsWithoutSubcategory.length === 1, 'flags missing subcategory') && ok;
ok = line(auditBad.testsNotInExamCategories.length === 1, 'flags orphan subcategory') && ok;

try {
  assert.strictEqual(
    normalizeInterestSubcategories(['A', 'B']).join(','),
    'A,B',
  );
} catch (e) {
  ok = line(false, `assert sort order: ${e.message}`) && ok;
}

console.log(ok ? '\nPhase 0 interest filter verify: PASS' : '\nPhase 0 interest filter verify: FAIL');
process.exit(ok ? 0 : 1);
