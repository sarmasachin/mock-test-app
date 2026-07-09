#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — Daily Quiz admin question analysis API + dashboard tab.
 *
 * Usage:
 *   node scripts/verifyDailyQuizDashboardPhase3.js
 */

const fs = require('fs');
const path = require('path');
const {
  loadDailyQuizQuestionAnalysis,
  mapDailyQuizQuestionAnalysisRow,
  parseQuestionAnalysisScope,
  parseQuestionAnalysisRangeDays,
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

function main() {
  console.log('=== Phase 3: daily quiz question analysis ===\n');
  let ok = true;

  const admin = read('server/src/routes/admin.js');
  const utils = read('server/src/lib/dailyQuizUtils.js');
  const perms = read('server/src/lib/adminRoutePermissions.js');
  const panel = read('admin-web/src/components/dailyQuiz/DailyQuizQuestionAnalysisPanel.tsx');
  const types = read('admin-web/src/components/dailyQuiz/dailyQuizTypes.ts');
  const dashboard = read('admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx');

  ok =
    line(
      utils.includes('loadDailyQuizQuestionAnalysis') &&
        utils.includes('mapDailyQuizQuestionAnalysisRow') &&
        utils.includes('GROUP BY item_id'),
      'dailyQuizUtils: question analysis aggregation',
    ) && ok;

  ok =
    line(
      admin.includes("router.get('/daily-quiz/question-analysis'") &&
        admin.includes('loadDailyQuizQuestionAnalysis(pool') &&
        admin.includes('mapDailyQuizQuestionAnalysisRow'),
      'admin GET /daily-quiz/question-analysis route',
    ) && ok;

  ok =
    line(
      perms.includes('daily-quiz\\/question-analysis'),
      'RBAC: tab_daily_quiz covers question analysis',
    ) && ok;

  ok =
    line(
      panel.includes('/admin/daily-quiz/question-analysis') &&
        panel.includes('dq-option-bar-fill') &&
        panel.includes('onOpenAnswerReview'),
      'QuestionAnalysisPanel: API + expand rows + answer review link',
    ) && ok;

  ok =
    line(
      types.includes('normalizeDailyQuizQuestionAnalysis') &&
        types.includes('DailyQuizQuestionAnalysisItem'),
      'dailyQuizTypes: question analysis models',
    ) && ok;

  ok =
    line(
      dashboard.includes('<DailyQuizQuestionAnalysisPanel') &&
        dashboard.includes('onOpenAnswerReview={openAnswerReview}'),
      'DailyQuizDashboard: question analysis tab wired',
    ) && ok;

  ok = line(parseQuestionAnalysisScope('day') === 'day', 'scope=day') && ok;
  ok = line(parseQuestionAnalysisScope('range') === 'range', 'scope=range') && ok;
  ok = line(parseQuestionAnalysisRangeDays('30') === 30, 'rangeDays=30') && ok;

  const mapped = mapDailyQuizQuestionAnalysisRow({
    item_id: 'q-1',
    question_prompt: 'Test?',
    correct_index: 1,
    attempt_count: 10,
    correct_count: 3,
    avg_time_seconds: 12,
    pick_0: 2,
    pick_1: 3,
    pick_2: 4,
    pick_3: 1,
    skipped_count: 0,
  });
  ok = line(mapped.correctRatePct === 30 && mapped.difficulty === 'hard', 'mapper: 30% → hard') && ok;
  ok =
    line(
      mapped.optionPickPct.length === 4 && mapped.optionPickPct.reduce((a, b) => a + b, 0) === 100,
      'mapper: option pick percentages sum to 100',
    ) && ok;

  ok =
    line(
      typeof loadDailyQuizQuestionAnalysis === 'function',
      'loadDailyQuizQuestionAnalysis exported',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE3_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE3_FAILED');
  process.exit(1);
}

main();
