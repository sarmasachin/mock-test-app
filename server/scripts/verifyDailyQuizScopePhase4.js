#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — scoped daily quiz delivery (auth GET /today + digest all_india fallback).
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopePhase4.js
 */

const fs = require('fs');
const path = require('path');
const {
  DAILY_QUIZ_SCOPE_ALL_INDIA,
  DAILY_QUIZ_SCOPE_STATE,
  selectDailyQuizItemsForDay,
  selectScopedDailyQuizItemsForDay,
  parseDailyQuizScopeQueryInput,
  filterEligibleDailyQuizItems,
  normalizeDailyQuizSettingsFields,
  buildDailyQuizScopeKey,
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

function makeItem(id, scope, states = []) {
  return {
    id,
    questionPrompt: `Q ${id}`,
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
    explanation: '',
    isPublished: true,
    createdAt: '2026-01-01T10:00:00.000Z',
    scope,
    targetStates: states,
  };
}

function main() {
  console.log('=== Phase 4: scoped daily quiz delivery ===\n');
  let ok = true;

  const dailyQuiz = read('server/src/routes/dailyQuiz.js');
  const digest = read('server/src/routes/digest.js');
  const index = read('server/src/index.js');

  ok =
    line(
      dailyQuiz.includes("router.get('/today'") &&
        dailyQuiz.includes('selectScopedDailyQuizItemsForDay') &&
        dailyQuiz.includes('parseDailyQuizScopeQueryInput'),
      'GET /v1/daily-quiz/today uses scoped picker',
    ) && ok;

  ok =
    line(
      index.includes("app.use('/v1/daily-quiz', requireAuth") &&
        dailyQuiz.includes('scopeKey: buildDailyQuizScopeKey'),
      'Auth route mounted under /v1/daily-quiz with scope metadata',
    ) && ok;

  ok =
    line(
      digest.includes('res.status(410)') &&
        digest.includes('loginRequired: true') &&
        digest.includes('/v1/daily-quiz/today') &&
        !digest.includes('selectDailyQuizItemsForDay(allIndiaPool'),
      'digest /quiz-today deprecated — auth /v1/daily-quiz/today only',
    ) && ok;

  ok =
    line(
      parseDailyQuizScopeQueryInput({ scope: 'state' }).error !== undefined &&
        parseDailyQuizScopeQueryInput({ scope: 'state', state: 'Himachal Pradesh' }).userScope?.scope ===
          DAILY_QUIZ_SCOPE_STATE,
      'parseDailyQuizScopeQueryInput validates state scope',
    ) && ok;

  ok =
    line(
      parseDailyQuizScopeQueryInput({}).userScope?.scope === DAILY_QUIZ_SCOPE_ALL_INDIA,
      'missing scope defaults to all_india',
    ) && ok;

  const bank = [
    makeItem('all-1', 'all_india'),
    makeItem('hp-1', 'state', ['Himachal Pradesh']),
    makeItem('pb-1', 'state', ['Punjab']),
  ];
  const schedule = normalizeDailyQuizSettingsFields({});
  const dayKey = 20260710;
  const quizDay = '2026-07-10';

  const digestPick = selectDailyQuizItemsForDay(
    filterEligibleDailyQuizItems(bank, { scope: DAILY_QUIZ_SCOPE_ALL_INDIA }),
    dayKey,
    quizDay,
    schedule,
  );
  ok =
    line(
      digestPick.length === 1 && digestPick[0].id === 'all-1',
      'digest-style all_india pick excludes state-only items',
    ) && ok;

  const hpPick = selectScopedDailyQuizItemsForDay(
    bank,
    dayKey,
    quizDay,
    schedule,
    { scope: 'state', state: 'Himachal Pradesh' },
  );
  ok =
    line(
      hpPick.length === 2 &&
        hpPick.some((x) => x.id === 'all-1') &&
        hpPick.some((x) => x.id === 'hp-1'),
      'scoped HP pick includes all_india + HP items',
    ) && ok;

  const hpPick2 = selectScopedDailyQuizItemsForDay(
    bank,
    dayKey,
    quizDay,
    schedule,
    { scope: 'state', state: 'Himachal Pradesh' },
  );
  ok =
    line(
      hpPick.map((x) => x.id).join(',') === hpPick2.map((x) => x.id).join(','),
      'scoped pick deterministic for same day + scope',
    ) && ok;

  const pbPick = selectScopedDailyQuizItemsForDay(
    bank,
    dayKey,
    quizDay,
    schedule,
    { scope: 'state', state: 'Punjab' },
  );
  ok =
    line(
      pbPick.some((x) => x.id === 'pb-1') &&
        buildDailyQuizScopeKey({ scope: 'state', state: 'Punjab' }) === 'state-punjab' &&
        buildDailyQuizScopeKey({ scope: 'state', state: 'Himachal Pradesh' }) !== 'state-punjab',
      'different states use different scope keys / picks',
    ) && ok;

  const legacyBank = Array.from({ length: 25 }, (_, i) => makeItem(`legacy-${i}`, 'all_india'));
  const legacyDigest = selectDailyQuizItemsForDay(
    filterEligibleDailyQuizItems(legacyBank, { scope: DAILY_QUIZ_SCOPE_ALL_INDIA }),
    dayKey,
    quizDay,
    schedule,
  );
  const legacyScoped = selectScopedDailyQuizItemsForDay(
    legacyBank,
    dayKey,
    quizDay,
    schedule,
    { scope: 'all_india' },
  );
  ok =
    line(
      legacyDigest.length === 20 &&
        legacyDigest.map((x) => x.id).join(',') === legacyScoped.map((x) => x.id).join(','),
      'all_india scoped pick matches legacy digest pick on all-legacy bank',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_PHASE4_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_PHASE4_FAILED');
  process.exit(1);
}

main();
