#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — Daily Quiz admin leaderboard API + dashboard tab.
 *
 * Usage:
 *   node scripts/verifyDailyQuizDashboardPhase2.js
 */

const fs = require('fs');
const path = require('path');
const {
  loadDailyQuizLeaderboardForDay,
  parseQuizDayInput,
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
  console.log('=== Phase 2: daily quiz admin leaderboard ===\n');
  let ok = true;

  const admin = read('server/src/routes/admin.js');
  const utils = read('server/src/lib/dailyQuizUtils.js');
  const dailyQuiz = read('server/src/routes/dailyQuiz.js');
  const perms = read('server/src/lib/adminRoutePermissions.js');
  const panel = read('admin-web/src/components/dailyQuiz/DailyQuizLeaderboardPanel.tsx');
  const types = read('admin-web/src/components/dailyQuiz/dailyQuizTypes.ts');
  const dashboard = read('admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx');

  ok =
    line(
      utils.includes('loadDailyQuizLeaderboardForDay') &&
        utils.includes('ORDER BY correct_count DESC, total_time ASC, last_submitted_at ASC'),
      'dailyQuizUtils: shared leaderboard query (same rank order as app)',
    ) && ok;

  ok =
    line(
      dailyQuiz.includes('loadDailyQuizLeaderboardForDay(pool, quizDay, {') &&
        dailyQuiz.includes('loadDailyQuizRankForUserOnDay'),
      'user /daily-quiz/leaderboard uses shared query + scoped rank helper',
    ) && ok;

  ok =
    line(
      admin.includes("router.get('/daily-quiz/leaderboard'") &&
        admin.includes('loadDailyQuizLeaderboardForDay(pool, quizDay') &&
        admin.includes('quizDay required (yyyy-MM-dd)'),
      'admin GET /daily-quiz/leaderboard route',
    ) && ok;

  ok =
    line(
      perms.includes('daily-quiz\\/leaderboard'),
      'RBAC: tab_daily_quiz covers admin leaderboard',
    ) && ok;

  ok =
    line(
      panel.includes('/admin/daily-quiz/leaderboard') &&
        panel.includes('onOpenAnswerReview') &&
        panel.includes('formatQuizDuration'),
      'LeaderboardPanel: API load + answer review navigation',
    ) && ok;

  ok =
    line(
      types.includes('normalizeDailyQuizLeaderboard') &&
        types.includes('DailyQuizLeaderboardEntry'),
      'dailyQuizTypes: leaderboard models',
    ) && ok;

  ok =
    line(
      dashboard.includes('<DailyQuizLeaderboardPanel') &&
        dashboard.includes('onOpenAnswerReview={openAnswerReview}'),
      'DailyQuizDashboard: leaderboard tab wired',
    ) && ok;

  ok = line(parseQuizDayInput('2026-07-09') === '2026-07-09', 'parseQuizDayInput accepts yyyy-MM-dd') && ok;
  ok = line(parseQuizDayInput('bad') === null, 'parseQuizDayInput rejects invalid day') && ok;
  ok =
    line(
      typeof loadDailyQuizLeaderboardForDay === 'function',
      'loadDailyQuizLeaderboardForDay exported',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE2_FAILED');
  process.exit(1);
}

main();
