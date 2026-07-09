#!/usr/bin/env node
'use strict';

/**
 * Phase 0 — Daily quiz scope/category schema + backward compatibility.
 * No admin UI, Android, or delivery route changes in this phase.
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopePhase0.js
 */

const fs = require('fs');
const path = require('path');
const {
  DAILY_QUIZ_SCOPE_ALL_INDIA,
  DAILY_QUIZ_SCOPE_STATE,
  normalizeDailyQuizScope,
  normalizeTargetStates,
  normalizeDailyQuizCategoryId,
  normalizeDailyQuizItemScopeFields,
  normalizeUserQuizScopeRequest,
  stateNameMatchesTarget,
  dailyQuizItemEligibleForUserScope,
  filterEligibleDailyQuizItems,
  buildDailyQuizScopeKey,
  mergeDailyQuizItemScopeFields,
  selectDailyQuizItemsForDay,
  normalizeDailyQuizSettingsFields,
} = require('../src/lib/dailyQuizUtils');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function makeLegacyItem(id) {
  return {
    id,
    questionPrompt: `Legacy ${id}`,
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
    explanation: '',
    isPublished: true,
    createdAt: '2026-01-01T10:00:00.000Z',
  };
}

function makeStateItem(id, state) {
  return {
    ...makeLegacyItem(id),
    scope: 'state',
    targetStates: [state],
    categoryId: 'hp-gk',
  };
}

function main() {
  console.log('=== Phase 0: daily quiz scope schema ===\n');
  let ok = true;

  const utils = read('server/src/lib/dailyQuizUtils.js');
  const digest = read('server/src/routes/digest.js');

  ok =
    line(
      utils.includes('DAILY_QUIZ_SCOPE_ALL_INDIA') &&
        utils.includes('normalizeDailyQuizItemScopeFields') &&
        utils.includes('filterEligibleDailyQuizItems') &&
        utils.includes('buildDailyQuizScopeKey'),
      'dailyQuizUtils: scope schema helpers exported',
    ) && ok;

  ok =
    line(
      filterEligibleDailyQuizItems([], { scope: 'all_india' }).length === 0,
      'filterEligibleDailyQuizItems safe on empty bank',
    ) && ok;

  ok =
    line(
      normalizeDailyQuizScope('state') === DAILY_QUIZ_SCOPE_STATE &&
        normalizeDailyQuizScope('all_india') === DAILY_QUIZ_SCOPE_ALL_INDIA &&
        normalizeDailyQuizScope('invalid') === DAILY_QUIZ_SCOPE_ALL_INDIA,
      'normalizeDailyQuizScope defaults safely',
    ) && ok;

  const legacy = normalizeDailyQuizItemScopeFields(makeLegacyItem('legacy-1'));
  ok =
    line(
      legacy.scope === DAILY_QUIZ_SCOPE_ALL_INDIA &&
        legacy.targetStates.length === 0 &&
        legacy.categoryId === null,
      'legacy item without scope fields ⇒ all_india',
    ) && ok;

  const hp = normalizeDailyQuizItemScopeFields(makeStateItem('hp-1', 'Himachal Pradesh'));
  ok =
    line(
      hp.scope === DAILY_QUIZ_SCOPE_STATE &&
        hp.targetStates.length === 1 &&
        hp.targetStates[0] === 'Himachal Pradesh' &&
        hp.categoryId === 'hp-gk',
      'state item normalizes scope + categoryId',
    ) && ok;

  ok =
    line(
      normalizeTargetStates(['HP', ' HP ', 'Punjab', 'HP']).length === 2,
      'normalizeTargetStates dedupes case-insensitively',
    ) && ok;

  ok =
    line(
      stateNameMatchesTarget('himachal pradesh', 'Himachal Pradesh') &&
        !stateNameMatchesTarget('Punjab', 'Himachal Pradesh'),
      'stateNameMatchesTarget case-insensitive',
    ) && ok;

  ok =
    line(
      normalizeDailyQuizCategoryId(' HP GK ') === 'hp-gk' &&
        normalizeDailyQuizCategoryId('!!!') === null,
      'normalizeDailyQuizCategoryId slug rules',
    ) && ok;

  const bank = [
    makeLegacyItem('all-1'),
    makeStateItem('hp-1', 'Himachal Pradesh'),
    makeStateItem('pb-1', 'Punjab'),
  ];

  const allIndiaPool = filterEligibleDailyQuizItems(bank, { scope: 'all_india' });
  ok = line(allIndiaPool.length === 1 && allIndiaPool[0].id === 'all-1', 'All India user pool: legacy/all_india only') && ok;

  const hpPool = filterEligibleDailyQuizItems(bank, { scope: 'state', state: 'Himachal Pradesh' });
  ok =
    line(
      hpPool.length === 2 &&
        hpPool.some((x) => x.id === 'all-1') &&
        hpPool.some((x) => x.id === 'hp-1') &&
        !hpPool.some((x) => x.id === 'pb-1'),
      'HP user pool: all_india + matching state items',
    ) && ok;

  ok =
    line(
      buildDailyQuizScopeKey({ scope: 'all_india' }) === 'all-india' &&
        buildDailyQuizScopeKey({ scope: 'state', state: 'Himachal Pradesh' }) === 'state-himachal-pradesh',
      'buildDailyQuizScopeKey deterministic slugs',
    ) && ok;

  ok =
    line(
      normalizeUserQuizScopeRequest({ scope: 'state' }).scope === DAILY_QUIZ_SCOPE_ALL_INDIA,
      'state scope without state name falls back to all_india',
    ) && ok;

  const merged = mergeDailyQuizItemScopeFields(makeLegacyItem('m-1'));
  ok =
    line(
      merged.scope === DAILY_QUIZ_SCOPE_ALL_INDIA && merged.questionPrompt === 'Legacy m-1',
      'mergeDailyQuizItemScopeFields preserves question fields',
    ) && ok;

  const schedule = normalizeDailyQuizSettingsFields({});
  const legacyBank = Array.from({ length: 30 }, (_, i) => makeLegacyItem(`legacy-${i}`));
  const picked = selectDailyQuizItemsForDay(legacyBank, 20260709, '2026-07-09', schedule);
  ok =
    line(
      picked.length === 20 && picked.every((x) => x && x.id),
      'regression: selectDailyQuizItemsForDay unchanged for legacy bank (20/day)',
    ) && ok;

  ok =
    line(
      dailyQuizItemEligibleForUserScope(makeStateItem('x', 'HP'), { scope: 'all_india' }) === false,
      'state-only item excluded from All India user selection',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_PHASE0_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_PHASE0_FAILED');
  process.exit(1);
}

main();
