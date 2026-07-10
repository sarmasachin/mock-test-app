#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — daily quiz bank limit + weighted daily pick (server only).
 *
 * Usage:
 *   node scripts/verifyDailyQuizDailyPickPhase1.js
 */

const fs = require('fs');
const path = require('path');
const {
  selectDailyQuizItemsForDay,
  normalizeDailyQuizSettingsFields,
  ageWeightForItem,
  DEFAULT_DAILY_QUIZ_SETTINGS,
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

function makeItem(id, createdAt, published = true) {
  return {
    id,
    questionPrompt: `Q ${id}`,
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
    explanation: '',
    isPublished: published,
    createdAt,
  };
}

function main() {
  console.log('=== Phase 1: daily quiz daily pick + unlimited bank ===\n');
  let ok = true;

  const utils = read('server/src/lib/dailyQuizUtils.js');
  const digest = read('server/src/routes/digest.js');
  const admin = read('server/src/routes/admin.js');

  ok =
    line(
      utils.includes('selectDailyQuizItemsForDay') &&
        utils.includes('questionsPerDay') &&
        !utils.includes('maxBankSize'),
      'dailyQuizUtils: daily pick settings (no fixed bank cap)',
    ) && ok;

  ok =
    line(
      digest.includes('res.status(410)') &&
        digest.includes('/v1/daily-quiz/today'),
      'digest GET /quiz-today deprecated — use auth /v1/daily-quiz/today',
    ) && ok;

  ok =
    line(
      admin.includes("router.post('/daily-quiz'") &&
        admin.includes('items: [normalized, ...items]') &&
        !admin.includes('.slice(0, bankCap)'),
      'admin POST /daily-quiz: unlimited bank append (no slice cap)',
    ) && ok;

  ok =
    line(
      admin.includes('questionsPerDay must be an integer between 1 and 50') &&
        !admin.includes('maxBankSize must be an integer'),
      'admin settings: questionsPerDay only (no maxBankSize validation)',
    ) && ok;

  const schedule = normalizeDailyQuizSettingsFields({});
  ok =
    line(
      schedule.questionsPerDay === 20 && !('maxBankSize' in schedule),
      'defaults: questionsPerDay=20, no maxBankSize field',
    ) && ok;

  const quizDay = '2026-07-09';
  const dayKey = 20260709;
  const bank100 = Array.from({ length: 100 }, (_, i) =>
    makeItem(`old-${i}`, '2026-01-01T10:00:00.000Z'),
  );
  const picked20 = selectDailyQuizItemsForDay(bank100, dayKey, quizDay, schedule);
  ok = line(picked20.length === 20, 'mirror: bank 100 published → exactly 20 served') && ok;

  const bank1500 = Array.from({ length: 1500 }, (_, i) =>
    makeItem(`big-${i}`, '2026-01-01T08:00:00.000Z'),
  );
  const picked1500 = selectDailyQuizItemsForDay(bank1500, dayKey, quizDay, schedule);
  ok = line(bank1500.length === 1500, 'mirror: bank can hold 1500+ items') && ok;
  ok = line(picked1500.length === 20, 'mirror: 1500 bank still delivers only 20/day') && ok;

  const bank15 = bank100.slice(0, 15);
  const picked15 = selectDailyQuizItemsForDay(bank15, dayKey, quizDay, schedule);
  ok = line(picked15.length === 15, 'mirror: bank 15 published → all 15 served') && ok;

  const runA = selectDailyQuizItemsForDay(bank100, dayKey, quizDay, schedule).map((x) => x.id).sort();
  const runB = selectDailyQuizItemsForDay(bank100, dayKey, quizDay, schedule).map((x) => x.id).sort();
  ok = line(JSON.stringify(runA) === JSON.stringify(runB), 'mirror: same dayKey → deterministic pick') && ok;

  const otherDay = selectDailyQuizItemsForDay(bank100, dayKey + 1, '2026-07-10', schedule)
    .map((x) => x.id)
    .sort();
  ok = line(JSON.stringify(runA) !== JSON.stringify(otherDay), 'mirror: different dayKey → different pick') && ok;

  const todayItems = Array.from({ length: 20 }, (_, i) =>
    makeItem(`today-${i}`, `${quizDay}T08:00:00.000Z`),
  );
  const oldItems = Array.from({ length: 80 }, (_, i) =>
    makeItem(`legacy-${i}`, '2025-01-01T08:00:00.000Z'),
  );
  const mixedBank = [...todayItems, ...oldItems];
  let todayHits = 0;
  const trials = 40;
  for (let t = 0; t < trials; t += 1) {
    const day = selectDailyQuizItemsForDay(mixedBank, dayKey + t, quizDay, schedule);
    todayHits += day.filter((x) => String(x.id).startsWith('today-')).length;
  }
  const avgTodayPerDay = todayHits / trials;
  ok = line(avgTodayPerDay >= 12, `mirror: today's uploads weighted higher (avg ${avgTodayPerDay.toFixed(1)}/20)`) && ok;

  const unpublishedOnly = [makeItem('hidden', `${quizDay}T08:00:00.000Z`, false)];
  ok = line(selectDailyQuizItemsForDay(unpublishedOnly, dayKey, quizDay, schedule).length === 0, 'mirror: unpublished excluded') && ok;

  ok =
    line(
      ageWeightForItem(makeItem('x', `${quizDay}T08:00:00.000Z`), quizDay, schedule) === 10,
      'mirror: created today weight = 10',
    ) && ok;

  ok =
    line(
      ageWeightForItem(makeItem('x', '2026-07-02T08:00:00.000Z'), quizDay, schedule) === 5,
      'mirror: last-7-days weight = 5',
    ) && ok;

  ok =
    line(
      DEFAULT_DAILY_QUIZ_SETTINGS.questionsPerDay === 20,
      'exported DEFAULT_DAILY_QUIZ_SETTINGS matches plan',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DAILY_PICK_PHASE1_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DAILY_PICK_PHASE1_FAILED');
  process.exit(1);
}

main();
