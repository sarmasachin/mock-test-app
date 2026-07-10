#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — integrated daily quiz daily-pick E2E mirror + full offline suite.
 *
 * Usage:
 *   node scripts/verifyDailyQuizDailyPickIntegratedPhase4.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  selectDailyQuizItemsForDay,
  normalizeDailyQuizSettingsFields,
  DEFAULT_DAILY_QUIZ_SETTINGS,
} = require('../src/lib/dailyQuizUtils');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS_DIR = __dirname;

const OFFLINE_SUITES = [
  'verifyDailyQuizDailyPickPhase1.js',
  'verifyDailyQuizAdminUiPhase2.js',
  'verifyDailyQuizAndroidDailyPickPhase3.js',
  'verifyDailyQuizBatchSubmitFix.js',
  'verifyDailyQuizShufflePhase2.js',
];

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

/** Mirror digest GET /quiz-today response assembly. */
function buildQuizTodayPayload(bank, dayKey, quizDay, schedule) {
  const quizItems = selectDailyQuizItemsForDay(bank, dayKey, quizDay, schedule);
  return {
    quizDay,
    questionCount: quizItems.length,
    items: quizItems,
  };
}

/** Mirror batch route published-id guard for delivered answers. */
function batchPublishedGuard(bank, answers) {
  const publishedIds = new Set(
    bank.filter((x) => x && x.isPublished !== false).map((x) => String(x.id || '')),
  );
  for (const ans of answers) {
    if (!publishedIds.has(String(ans.itemId || ''))) return false;
  }
  return true;
}

/** Mirror Android submitBatchToServer size guard. */
function androidBatchSizeGuard(deliveredCount, answeredCount) {
  if (answeredCount <= 0) return false;
  return answeredCount >= deliveredCount;
}

function runSuite(script) {
  console.log(`\n>>> ${script}\n`);
  execSync(`node "${path.join(SCRIPTS_DIR, script)}"`, { stdio: 'inherit' });
}

function integratedMirrorTests() {
  console.log('=== Phase 4: integrated daily-pick E2E mirror ===\n');
  let ok = true;

  const digest = read('server/src/routes/digest.js');
  const dailyQuiz = read('server/src/routes/dailyQuiz.js');
  ok =
    line(
      digest.includes('res.status(410)') &&
        dailyQuiz.includes('selectScopedDailyQuizItemsForDay'),
      'daily pick delivery on auth /v1/daily-quiz/today (public digest deprecated)',
    ) && ok;

  const schedule = normalizeDailyQuizSettingsFields({
    questionsPerDay: 20,
  });
  const quizDay = '2026-07-09';
  const dayKey = 20260709;
  const bank100 = Array.from({ length: 100 }, (_, i) =>
    makeItem(`bank-${i}`, '2026-01-01T08:00:00.000Z'),
  );
  const todayTwenty = Array.from({ length: 20 }, (_, i) =>
    makeItem(`today-${i}`, `${quizDay}T09:00:00.000Z`),
  );
  const mixedBank = [...todayTwenty, ...bank100];

  const payload = buildQuizTodayPayload(mixedBank, dayKey, quizDay, schedule);
  ok = line(payload.questionCount === 20 && payload.items.length === 20, 'E2E: bank 120 → API delivers 20') && ok;

  const publishedOk = payload.items.every((item) =>
    mixedBank.some((raw) => String(raw.id) === String(item.id) && raw.isPublished !== false),
  );
  ok = line(publishedOk, 'E2E: every delivered item belongs to published bank') && ok;

  const batchAnswers = payload.items.map((item) => ({
    itemId: item.id,
    selectedOptionIndex: 0,
    correctIndex: 0,
    timeTakenSeconds: 5,
    questionPrompt: item.questionPrompt,
    options: item.options,
    explanation: '',
  }));
  ok = line(batchPublishedGuard(mixedBank, batchAnswers), 'E2E: 20-answer batch passes published-id guard') && ok;
  ok =
    line(
      androidBatchSizeGuard(payload.items.length, batchAnswers.length),
      'E2E: Android batch submit size guard accepts full daily set',
    ) && ok;

  const clientSubmissionId = 'batch-phase4-test';
  const batchRows = batchAnswers.map((ans) => ({
    user_id: 'u1',
    quiz_day: quizDay,
    item_id: ans.itemId,
    client_submission_id: clientSubmissionId,
  }));
  const uniqueItemIds = new Set(batchRows.map((r) => r.item_id));
  ok =
    line(
      uniqueItemIds.size === 20 && batchRows.length === 20,
      'E2E: 20 batch rows share clientSubmissionId but distinct item_id',
    ) && ok;

  const smallBank = bank100.slice(0, 12);
  const payload12 = buildQuizTodayPayload(smallBank, dayKey, quizDay, schedule);
  ok =
    line(payload12.questionCount === 12 && payload12.items.length === 12, 'E2E: bank 12 → delivers all 12') && ok;

  ok =
    line(
      DEFAULT_DAILY_QUIZ_SETTINGS.questionsPerDay === 20 &&
        schedule.questionsPerDay === 20,
      'E2E: schedule defaults wired to 20/day',
    ) && ok;

  console.log('');
  if (!ok) {
    console.error('VERIFY_DAILY_QUIZ_DAILY_PICK_INTEGRATED_PHASE4_MIRROR_FAILED');
    process.exit(1);
  }
  console.log('VERIFY_DAILY_QUIZ_DAILY_PICK_INTEGRATED_PHASE4_MIRROR_OK\n');
}

function main() {
  integratedMirrorTests();

  console.log('=== Phase 4: running offline suites ===');
  for (const script of OFFLINE_SUITES) {
    runSuite(script);
  }

  console.log('\nVERIFY_DAILY_QUIZ_DAILY_PICK_ALL_PHASE4_OK');
}

main();
