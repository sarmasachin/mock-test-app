'use strict';

/**
 * Phase 1 verify — user interests API helpers (offline, no DB).
 * Run: npm run verify:interest-phase1
 */

const assert = require('assert');
const {
  parseSubcategoriesQueryParam,
  buildSubcategoryOrSqlClause,
  validatePutInterestsBody,
  normalizeInterestSubcategories,
  subcategoryMatchesAnyInterest,
} = require('../src/lib/userInterests');

function line(ok, label) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`  [${mark}] ${label}`);
  return ok;
}

let ok = true;

// --- parseSubcategoriesQueryParam ---
ok = line(
  parseSubcategoriesQueryParam('HP GK, SSC').join(',') === 'HP GK,SSC',
  'comma-separated subcategories query',
) && ok;
ok = line(
  parseSubcategoriesQueryParam(['HP GK', 'SSC']).length === 2,
  'array subcategories query',
) && ok;
ok = line(parseSubcategoriesQueryParam('').length === 0, 'empty query → []') && ok;
ok = line(parseSubcategoriesQueryParam(null).length === 0, 'null query → []') && ok;

// --- buildSubcategoryOrSqlClause ---
const clause = buildSubcategoryOrSqlClause(['HP GK', 'SSC'], 1);
ok = line(clause.sql.includes('subcategory ILIKE $1'), 'SQL uses param $1') && ok;
ok = line(clause.sql.includes('OR'), 'SQL OR between interests') && ok;
ok = line(clause.params.length === 2 && clause.params[0] === '%HP GK%', 'ILIKE patterns') && ok;
ok = line(clause.nextIndex === 3, 'nextIndex after two params') && ok;

const clauseKind = buildSubcategoryOrSqlClause(['SSC'], 2);
ok = line(clauseKind.sql.includes('$2'), 'param start index respected') && ok;
ok = line(clauseKind.nextIndex === 3, 'single subcategory nextIndex') && ok;

// --- validatePutInterestsBody ---
const good = validatePutInterestsBody({ subcategories: ['HP GK', 'hp gk'] });
ok = line(!good.error && good.subcategories.length === 1, 'PUT body normalizes interests') && ok;

const missing = validatePutInterestsBody({});
ok = line(missing.error === 'subcategories is required', 'PUT requires subcategories') && ok;

const badType = validatePutInterestsBody({ subcategories: 'HP GK' });
ok = line(badType.error === 'subcategories must be an array', 'PUT rejects non-array') && ok;

const emptyOk = validatePutInterestsBody({ subcategories: [] });
ok = line(!emptyOk.error && emptyOk.subcategories.length === 0, 'PUT allows empty array (legacy show-all)') && ok;

// --- multi filter semantics mirror SQL OR ---
const tests = [
  { subcategory: 'HP GK Mock' },
  { subcategory: 'SSC CGL' },
  { subcategory: 'Railway' },
];
const filtered = tests.filter((t) => subcategoryMatchesAnyInterest(t.subcategory, ['HP GK', 'SSC']));
ok = line(filtered.length === 2, 'multi interest OR matches two subs') && ok;

try {
  assert.strictEqual(
    normalizeInterestSubcategories(['Z', 'A']).join(','),
    'A,Z',
  );
} catch (e) {
  ok = line(false, `sort: ${e.message}`) && ok;
}

console.log(ok ? '\nPhase 1 interest filter verify: PASS' : '\nPhase 1 interest filter verify: FAIL');
process.exit(ok ? 0 : 1);
