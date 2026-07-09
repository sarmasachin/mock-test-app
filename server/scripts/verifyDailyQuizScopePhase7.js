#!/usr/bin/env node
'use strict';

/**
 * Phase 7 — state-scoped leaderboard + admin analytics filters.
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopePhase7.js
 */

const fs = require('fs');
const path = require('path');
const {
  DAILY_QUIZ_SCOPE_ALL_INDIA,
  DAILY_QUIZ_SCOPE_STATE,
  parseOptionalDailyQuizDeliveryScope,
  parseDailyQuizScopeQueryInput,
  filterEligibleDailyQuizItems,
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
  console.log('=== Phase 7: scoped leaderboard + analytics filters ===\n');
  let ok = true;

  const utils = read('server/src/lib/dailyQuizUtils.js');
  const admin = read('server/src/routes/admin.js');
  const dailyQuiz = read('server/src/routes/dailyQuiz.js');
  const scopeUi = read('admin-web/src/components/dailyQuiz/dailyQuizScopeUi.ts');
  const filterUi = read('admin-web/src/components/dailyQuiz/DailyQuizDeliveryScopeFilter.tsx');
  const dashboard = read('admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx');
  const leaderboardPanel = read('admin-web/src/components/dailyQuiz/DailyQuizLeaderboardPanel.tsx');
  const qaPanel = read('admin-web/src/components/dailyQuiz/DailyQuizQuestionAnalysisPanel.tsx');
  const arPanel = read('admin-web/src/components/dailyQuiz/DailyQuizAnswerReviewPanel.tsx');
  const appApi = read('app/src/main/java/com/freemocktest/app/data/remote/AppApiService.kt');
  const repo = read('app/src/main/java/com/freemocktest/app/data/DailyQuizRepository.kt');
  const digestUi = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const pkg = read('server/package.json');

  ok =
    line(
      utils.includes('parseOptionalDailyQuizDeliveryScope') &&
        utils.includes('resolveDailyQuizScopedItemIds') &&
        utils.includes('loadDailyQuizRankForUserOnDay') &&
        utils.includes('dqa.item_id = ANY'),
      'dailyQuizUtils: scoped item filter + rank helper',
    ) && ok;

  ok =
    line(
      parseOptionalDailyQuizDeliveryScope({}).userScope === null &&
        parseOptionalDailyQuizDeliveryScope({ quizScope: 'all_india' }).userScope?.scope ===
          DAILY_QUIZ_SCOPE_ALL_INDIA &&
        parseOptionalDailyQuizDeliveryScope({ quizScope: 'state' }).error !== undefined &&
        parseOptionalDailyQuizDeliveryScope({ quizScope: 'state', state: 'Himachal Pradesh' }).userScope
          ?.scope === DAILY_QUIZ_SCOPE_STATE,
      'parseOptionalDailyQuizDeliveryScope validates admin quizScope param',
    ) && ok;

  ok =
    line(
      admin.includes('parseOptionalDailyQuizDeliveryScope') &&
        admin.includes('deliveryScope:') &&
        admin.includes('userScope: deliveryScopeParsed.userScope') &&
        admin.includes("router.get('/daily-quiz/leaderboard'") &&
        admin.includes("router.get('/daily-quiz/question-analysis'") &&
        admin.includes("router.get('/daily-quiz/answer-review'"),
      'admin routes pass delivery scope to analytics loaders',
    ) && ok;

  ok =
    line(
      dailyQuiz.includes('loadDailyQuizRankForUserOnDay') &&
        dailyQuiz.includes('parseOptionalUserDeliveryScope') &&
        dailyQuiz.includes('userScope') &&
        dailyQuiz.includes("router.get('/leaderboard'"),
      'user /daily-quiz/leaderboard + submit rank use delivery scope',
    ) && ok;

  ok =
    line(
      scopeUi.includes('DAILY_QUIZ_ANALYTICS_SCOPE_STORAGE') &&
        scopeUi.includes('buildDailyQuizAnalyticsScopeParams') &&
        filterUi.includes('DailyQuizDeliveryScopeFilter') &&
        dashboard.includes('DailyQuizDeliveryScopeFilter') &&
        dashboard.includes('analyticsScopeParams'),
      'admin dashboard shared delivery scope filter UI',
    ) && ok;

  ok =
    line(
      leaderboardPanel.includes('scopeParams') &&
        qaPanel.includes('scopeParams') &&
        arPanel.includes('scopeParams') &&
        arPanel.includes('answer-review/session'),
      'leaderboard / question analysis / answer review panels send quizScope params',
    ) && ok;

  ok =
    line(
      appApi.includes('getDailyQuizLeaderboard') &&
        appApi.includes('@Query("scope")') &&
        repo.includes('loadLeaderboard') &&
        repo.includes('scope = scope?.mode') &&
        repo.includes('submitBatchToServer') &&
        digestUi.includes('loadLeaderboard(quizShareDay, scope = quizScope)'),
      'Android scoped leaderboard + batch submit scope for rank',
    ) && ok;

  const bank = [
    makeItem('all-1', 'all_india'),
    makeItem('hp-1', 'state', ['Himachal Pradesh']),
    makeItem('pb-1', 'state', ['Punjab']),
  ];
  const hpIds = filterEligibleDailyQuizItems(bank, {
    scope: DAILY_QUIZ_SCOPE_STATE,
    stateName: 'Himachal Pradesh',
  }).map((x) => x.id);
  ok =
    line(
      hpIds.length === 2 &&
        hpIds.includes('all-1') &&
        hpIds.includes('hp-1') &&
        !hpIds.includes('pb-1'),
      'HP delivery scope item pool = all_india + HP only',
    ) && ok;

  ok =
    line(
      buildDailyQuizScopeKey({ scope: 'state', state: 'Himachal Pradesh' }) === 'state-himachal-pradesh' &&
        parseDailyQuizScopeQueryInput({ scope: 'all_india' }).userScope?.scope === DAILY_QUIZ_SCOPE_ALL_INDIA,
      'scope keys align with user API',
    ) && ok;

  ok =
    line(
      pkg.includes('verifyDailyQuizScopePhase7') &&
        pkg.includes('verifyDailyQuizScopePhase7.js'),
      'package.json includes verify:daily-quiz-scope-phase7',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_PHASE7_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_PHASE7_FAILED');
  process.exit(1);
}

main();
