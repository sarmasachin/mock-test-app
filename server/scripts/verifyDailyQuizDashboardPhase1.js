#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — Daily Quiz admin dashboard tab shell + Overview panel.
 *
 * Usage:
 *   node scripts/verifyDailyQuizDashboardPhase1.js
 */

const fs = require('fs');
const path = require('path');

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

function extractDailyQuizTab(source) {
  const start = source.indexOf('function DailyQuizTab(');
  if (start < 0) return '';
  const next = source.indexOf('\nfunction ', start + 1);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

function main() {
  console.log('=== Phase 1: daily quiz dashboard tab shell ===\n');
  let ok = true;

  const app = read('admin-web/src/App.tsx');
  const quizTab = extractDailyQuizTab(app);
  const dashboard = read('admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx');
  const overview = read('admin-web/src/components/dailyQuiz/DailyQuizOverviewPanel.tsx');
  const types = read('admin-web/src/components/dailyQuiz/dailyQuizTypes.ts');
  const css = read('admin-web/src/components/dailyQuiz/dailyQuizDashboard.css');
  const reexport = read('admin-web/src/components/DailyQuizAdminStats.tsx');

  ok = line(fs.existsSync(path.join(ROOT, 'admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx')), 'DailyQuizDashboard component exists') && ok;
  ok = line(fs.existsSync(path.join(ROOT, 'admin-web/src/components/dailyQuiz/DailyQuizOverviewPanel.tsx')), 'DailyQuizOverviewPanel exists') && ok;
  ok = line(fs.existsSync(path.join(ROOT, 'admin-web/src/components/dailyQuiz/DailyQuizLeaderboardPanel.tsx')), 'DailyQuizLeaderboardPanel placeholder exists') && ok;
  ok = line(fs.existsSync(path.join(ROOT, 'admin-web/src/components/dailyQuiz/DailyQuizQuestionAnalysisPanel.tsx')), 'DailyQuizQuestionAnalysisPanel placeholder exists') && ok;
  ok = line(fs.existsSync(path.join(ROOT, 'admin-web/src/components/dailyQuiz/DailyQuizAnswerReviewPanel.tsx')), 'DailyQuizAnswerReviewPanel placeholder exists') && ok;

  ok =
    line(
      app.includes("import { DailyQuizDashboard } from './components/dailyQuiz/DailyQuizDashboard'") &&
        quizTab.includes('<DailyQuizDashboard apiClient={apiClient} />'),
      'App.tsx: DailyQuizTab uses DailyQuizDashboard',
    ) && ok;

  ok =
    line(
      dashboard.includes('DAILY_QUIZ_DASHBOARD_TABS') &&
        dashboard.includes("activeTab === 'overview'") &&
        dashboard.includes("activeTab === 'leaderboard'") &&
        dashboard.includes("activeTab === 'questionAnalysis'") &&
        dashboard.includes("activeTab === 'answerReview'"),
      'DailyQuizDashboard: 4 tab panels wired',
    ) && ok;

  ok =
    line(
      dashboard.includes('dash-metrics-grid') &&
        dashboard.includes('/admin/daily-quiz/stats') &&
        dashboard.includes('dq-tab-bar'),
      'DailyQuizDashboard: KPI strip + stats API + tab bar',
    ) && ok;

  ok =
    line(
      overview.includes('Daily Quiz attempts') &&
        overview.includes('Recent Daily Quiz activity') &&
        overview.includes('onOpenAnswerReview'),
      'Overview panel: charts + recent activity navigation',
    ) && ok;

  ok =
    line(
      types.includes("'overview'") &&
        types.includes("'leaderboard'") &&
        types.includes("'questionAnalysis'") &&
        types.includes("'answerReview'"),
      'dailyQuizTypes: all dashboard tab ids defined',
    ) && ok;

  ok =
    line(
      css.includes('.dq-tab-btn-active') && css.includes('.dq-tab-bar'),
      'dailyQuizDashboard.css: tab shell styles',
    ) && ok;

  ok =
    line(
      reexport.includes('DailyQuizDashboard as DailyQuizAdminStats') &&
        reexport.includes('normalizeDailyQuizAdminStats'),
      'DailyQuizAdminStats: backward-compatible re-export',
    ) && ok;

  ok =
    line(
      quizTab.includes('Daily Quiz delivery') &&
        quizTab.match(/DailyQuizDashboard[\s\S]{0,400}Daily Quiz delivery/),
      'DailyQuizTab: dashboard above question bank (separate sections)',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE1_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DASHBOARD_PHASE1_FAILED');
  process.exit(1);
}

main();
