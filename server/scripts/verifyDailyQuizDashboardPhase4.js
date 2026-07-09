#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — Daily Quiz admin answer review API + dashboard tab.
 *
 * Usage:
 *   node scripts/verifyDailyQuizDashboardPhase4.js
 */

const fs = require('fs');
const path = require('path');
const {
  mapDailyQuizAttemptAdminRow,
  parseAnswerReviewResultFilter,
  loadDailyQuizAnswerReview,
  loadDailyQuizAnswerReviewSession,
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
  console.log('=== Phase 4: daily quiz answer review ===\n');
  let ok = true;

  const admin = read('server/src/routes/admin.js');
  const utils = read('server/src/lib/dailyQuizUtils.js');
  const perms = read('server/src/lib/adminRoutePermissions.js');
  const panel = read('admin-web/src/components/dailyQuiz/DailyQuizAnswerReviewPanel.tsx');
  const types = read('admin-web/src/components/dailyQuiz/dailyQuizTypes.ts');
  const dashboard = read('admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx');

  ok =
    line(
      utils.includes('loadDailyQuizAnswerReview') &&
        utils.includes('loadDailyQuizAnswerReviewSession') &&
        utils.includes('mapDailyQuizAttemptAdminRow'),
      'dailyQuizUtils: answer review loaders + mapper',
    ) && ok;

  ok =
    line(
      admin.includes("router.get('/daily-quiz/answer-review/session'") &&
        admin.includes("router.get('/daily-quiz/answer-review'") &&
        admin.includes('mapDailyQuizAttemptAdminRow'),
      'admin answer-review + session routes',
    ) && ok;

  ok =
    line(
      perms.includes('daily-quiz\\/answer-review') &&
        perms.includes('answer-review\\/session'),
      'RBAC: tab_daily_quiz covers answer review',
    ) && ok;

  ok =
    line(
      panel.includes('/admin/daily-quiz/answer-review') &&
        panel.includes('/admin/daily-quiz/answer-review/session') &&
        panel.includes('AnswerDetailBlock') &&
        panel.includes('dq-ar-opt-wrong'),
      'AnswerReviewPanel: list + expand + session view',
    ) && ok;

  ok =
    line(
      types.includes('normalizeDailyQuizAnswerReview') &&
        types.includes('DailyQuizAnswerReviewAttempt'),
      'dailyQuizTypes: answer review models',
    ) && ok;

  ok =
    line(
      dashboard.includes('<DailyQuizAnswerReviewPanel') &&
        dashboard.includes('apiClient={apiClient}') &&
        dashboard.includes('tableReady={data.tableReady}'),
      'DailyQuizDashboard: answer review tab wired',
    ) && ok;

  ok = line(parseAnswerReviewResultFilter('wrong') === 'wrong', 'result filter wrong') && ok;
  ok = line(parseAnswerReviewResultFilter('all') === 'all', 'result filter all') && ok;

  const mapped = mapDailyQuizAttemptAdminRow({
    id: 9,
    user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    quiz_day: '2026-07-09',
    item_id: 'dq-1',
    selected_option_index: 1,
    correct_index: 2,
    is_correct: false,
    time_taken_seconds: 14,
    question_prompt: 'Sample?',
    options_json: ['A text', 'B text', 'C text', 'D text'],
    explanation: 'Because C',
    client_submission_id: 'batch-1',
    submitted_at: '2026-07-09T10:00:00.000Z',
    display_name: 'Rahul',
    email: 'r@example.com',
    public_id: 482910,
  });
  ok =
    line(
      mapped.options.length === 4 &&
        mapped.isSkipped === false &&
        mapped.displayName === 'Rahul' &&
        mapped.clientSubmissionId === 'batch-1',
      'mapper: attempt snapshot fields',
    ) && ok;

  ok =
    line(
      typeof loadDailyQuizAnswerReview === 'function' &&
        typeof loadDailyQuizAnswerReviewSession === 'function',
      'answer review loaders exported',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE4_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE4_FAILED');
  process.exit(1);
}

main();
