'use strict';

/**
 * Phase 0 — interest filter spec (pure functions, no DB).
 * Used by verifyInterestPhase0.js; wired into routes in Phase 1+.
 *
 * Interest unit: test.subcategory aligned with examCategories.level3.
 */

const MAX_USER_INTERESTS = 20;
const MAX_SUBCATEGORY_LEN = 120;

function normalizeSubcategoryKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {unknown} input
 * @param {{ maxItems?: number }} [options]
 * @returns {string[]}
 */
function normalizeInterestSubcategories(input, options = {}) {
  const max = Math.max(1, Math.min(Number(options.maxItems) || MAX_USER_INTERESTS, MAX_USER_INTERESTS));
  const raw = Array.isArray(input) ? input : [];
  const seen = new Map();
  for (const item of raw) {
    const trimmed = String(item || '').trim().slice(0, MAX_SUBCATEGORY_LEN);
    if (!trimmed) continue;
    const key = normalizeSubcategoryKey(trimmed);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
    if (seen.size >= max) break;
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Mirrors GET /tests?subcategory=X → `subcategory ILIKE '%X%'`.
 * @param {string} testSubcategory
 * @param {string} filterSubcategory
 */
function subcategoryMatchesSqlFilter(testSubcategory, filterSubcategory) {
  const sub = normalizeSubcategoryKey(testSubcategory);
  const filter = normalizeSubcategoryKey(filterSubcategory);
  if (!filter) return true;
  if (!sub) return false;
  return sub.includes(filter);
}

/**
 * @param {string} testSubcategory
 * @param {string[]} interests normalized or raw
 */
function subcategoryMatchesAnyInterest(testSubcategory, interests) {
  const list = normalizeInterestSubcategories(interests);
  if (list.length === 0) return true;
  return list.some((interest) => subcategoryMatchesSqlFilter(testSubcategory, interest));
}

/**
 * Phase 1b: catalog list visibility (not apply/start).
 * @param {{ show_to_users?: boolean, showToUsers?: boolean } | null | undefined} row
 */
function isShowToUsersForCatalog(row) {
  if (!row || typeof row !== 'object') return true;
  if (row.show_to_users === false) return false;
  if (row.showToUsers === false) return false;
  return true;
}

/**
 * Whether a test row belongs in user-facing catalog / interest picker lists.
 * Applied tests always pass (caller sets isApplied).
 *
 * @param {{ subcategory?: string, show_to_users?: boolean, showToUsers?: boolean }} test
 * @param {{ userInterests?: string[], showAllTests?: boolean, isApplied?: boolean }} [options]
 */
function shouldIncludeInUserCatalog(test, options = {}) {
  const {
    userInterests = [],
    showAllTests = false,
    isApplied = false,
  } = options;
  if (isApplied) return true;
  if (!isShowToUsersForCatalog(test)) return false;
  if (showAllTests) return true;
  const interests = normalizeInterestSubcategories(userInterests);
  if (interests.length === 0) return true;
  return subcategoryMatchesAnyInterest(test?.subcategory, interests);
}

/**
 * @param {{ items?: Array<{ level3?: string, enabled?: boolean }> }} examCategories
 * @returns {string[]}
 */
function extractEnabledLevel3FromExamCategories(examCategories) {
  const items = Array.isArray(examCategories?.items) ? examCategories.items : [];
  const seen = new Map();
  for (const item of items) {
    if (!item || item.enabled === false) continue;
    const level3 = String(item.level3 || '').trim().slice(0, MAX_SUBCATEGORY_LEN);
    if (!level3) continue;
    const key = normalizeSubcategoryKey(level3);
    if (!seen.has(key)) seen.set(key, level3);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Filter exam category level3 labels to user interests (browse-all bypass).
 * @param {string[]} level3Labels
 * @param {string[]} userInterests
 * @param {boolean} showAllTests
 */
function filterLevel3LabelsForInterests(level3Labels, userInterests, showAllTests = false) {
  const labels = Array.isArray(level3Labels) ? level3Labels : [];
  if (showAllTests) return labels.slice();
  const interests = normalizeInterestSubcategories(userInterests);
  if (interests.length === 0) return labels.slice();
  const interestKeys = new Set(interests.map(normalizeSubcategoryKey));
  return labels.filter((label) => {
    const key = normalizeSubcategoryKey(label);
    if (interestKeys.has(key)) return true;
    return interests.some((interest) => subcategoryMatchesSqlFilter(label, interest));
  });
}

/**
 * Admin alignment report: examCategories.level3 vs tests.subcategory.
 * @param {{ items?: Array<{ level3?: string, enabled?: boolean }> }} examCategories
 * @param {Array<{ title?: string, subcategory?: string }>} tests
 */
function auditSubcategoryAlignment(examCategories, tests) {
  const enabledLevel3 = extractEnabledLevel3FromExamCategories(examCategories);
  const level3Keys = new Set(enabledLevel3.map(normalizeSubcategoryKey));
  const rows = Array.isArray(tests) ? tests : [];

  const testsWithoutSubcategory = rows.filter(
    (t) => !normalizeSubcategoryKey(t?.subcategory),
  );

  const testsNotInExamCategories = rows.filter((t) => {
    const subKey = normalizeSubcategoryKey(t?.subcategory);
    if (!subKey) return false;
    if (level3Keys.has(subKey)) return false;
    return !enabledLevel3.some((l3) => subcategoryMatchesSqlFilter(t.subcategory, l3));
  });

  const categoriesWithoutPublishedTests = enabledLevel3.filter(
    (l3) => !rows.some((t) => subcategoryMatchesSqlFilter(t?.subcategory, l3)),
  );

  return {
    enabledLevel3Count: enabledLevel3.length,
    testCount: rows.length,
    testsWithoutSubcategory,
    testsNotInExamCategories,
    categoriesWithoutPublishedTests,
    ok: testsWithoutSubcategory.length === 0 && testsNotInExamCategories.length === 0,
  };
}

/**
 * Parse ?subcategories=HP GK,SSC or repeated query keys.
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseSubcategoriesQueryParam(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return normalizeInterestSubcategories(raw);
  }
  return normalizeInterestSubcategories(String(raw).split(','));
}

/**
 * SQL OR clause for multiple subcategory ILIKE filters.
 * @param {string[]} subcategories
 * @param {number} [paramStartIndex]
 * @returns {{ sql: string, params: string[], nextIndex: number }}
 */
function buildSubcategoryOrSqlClause(subcategories, paramStartIndex = 1) {
  const list = normalizeInterestSubcategories(subcategories);
  if (!list.length) {
    return { sql: '', params: [], nextIndex: paramStartIndex };
  }
  const params = list.map((s) => `%${s}%`);
  const parts = params.map((_, i) => `subcategory ILIKE $${paramStartIndex + i}`);
  return {
    sql: `(${parts.join(' OR ')})`,
    params,
    nextIndex: paramStartIndex + params.length,
  };
}

/**
 * Validate PUT /me/interests body.
 * @param {unknown} body
 * @returns {{ subcategories: string[] } | { error: string }}
 */
function validatePutInterestsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (body.subcategories === undefined) {
    return { error: 'subcategories is required' };
  }
  if (!Array.isArray(body.subcategories)) {
    return { error: 'subcategories must be an array' };
  }
  return { subcategories: normalizeInterestSubcategories(body.subcategories) };
}

module.exports = {
  MAX_USER_INTERESTS,
  MAX_SUBCATEGORY_LEN,
  normalizeSubcategoryKey,
  normalizeInterestSubcategories,
  subcategoryMatchesSqlFilter,
  subcategoryMatchesAnyInterest,
  isShowToUsersForCatalog,
  shouldIncludeInUserCatalog,
  extractEnabledLevel3FromExamCategories,
  filterLevel3LabelsForInterests,
  auditSubcategoryAlignment,
  parseSubcategoriesQueryParam,
  buildSubcategoryOrSqlClause,
  validatePutInterestsBody,
};
