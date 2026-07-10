#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — daily quiz server truth priority (logged-in users only).
 *
 * Usage:
 *   node scripts/verifyDailyQuizServerTruthPhase2.js
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

/** Mirror loadDayResultForCurrentUser decision tree. */
function resolveDayResult({ loggedIn, localResult, serverResult, server404 }) {
  if (!loggedIn) return null;
  if (serverResult != null) return serverResult;
  if (server404) return null;
  return localResult;
}

function main() {
  console.log('=== Phase 2: daily quiz server truth priority ===\n');
  let ok = true;

  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const repo = read('app/src/main/java/com/freemocktest/app/data/DailyQuizRepository.kt');
  const ui = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');

  ok =
    line(
      prefs.includes('clearDailyQuizDayResult') &&
        prefs.includes('replaceDailyQuizResultsForCurrentUser'),
      'AppPreferencesRepository: clear day + replace from server',
    ) && ok;

  ok =
    line(
      repo.includes('loadDayResultForCurrentUser') &&
        repo.includes('if (!isLoggedIn())') &&
        repo.includes('loadDayFromServer(day, scope)') &&
        repo.includes('server ?: local'),
      'DailyQuizRepository: logged-in server-first with offline local fallback',
    ) && ok;

  ok =
    line(
      repo.includes('clearDailyQuizDayResult(day)') && repo.includes('e.code() == 404'),
      'loadDayFromServer: 404 clears stale local day',
    ) && ok;

  ok =
    line(
      repo.includes('replaceDailyQuizResultsForCurrentUser(attemptsByDay)') &&
        repo.includes('prior.rank') &&
        repo.includes('prior.scopeKey'),
      'syncHistoryFromServer: replace cache + preserve rank/scopeKey',
    ) && ok;

  ok =
    line(
      ui.includes('loadDayResultForCurrentUser(selectedDate, selectedQuizScope)') &&
        ui.includes('dayResultLoading') &&
        ui.includes('loadDailyQuizDayResult(selectedDate)'),
      'DailyDigestScreenNew: local hydrate then scoped server load',
    ) && ok;

  ok =
    line(
      ui.includes('DailyQuizRepository.syncHistoryFromServer()') &&
        ui.includes('synced?.attemptedDates') &&
        !ui.includes('localDates + synced.attemptedDates'),
      'DailyDigestScreenNew: attempted dates from server sync when logged in',
    ) && ok;

  // Logic mirror
  const loggedInNewUser = resolveDayResult({
    loggedIn: true,
    localResult: { day: '2026-07-09' },
    serverResult: null,
    server404: true,
  });
  ok = line(loggedInNewUser == null, 'mirror: logged-in + server 404 ⇒ not attempted') && ok;

  const loggedInHasAttempt = resolveDayResult({
    loggedIn: true,
    localResult: null,
    serverResult: { day: '2026-07-09' },
    server404: false,
  });
  ok = line(loggedInHasAttempt != null, 'mirror: logged-in + server hit ⇒ dashboard data') && ok;

  const offlineFallback = resolveDayResult({
    loggedIn: true,
    localResult: { day: '2026-07-09' },
    serverResult: null,
    server404: false,
  });
  ok = line(offlineFallback != null, 'mirror: logged-in + network error ⇒ local fallback') && ok;

  const loggedOut = resolveDayResult({
    loggedIn: false,
    localResult: { day: '2026-07-09' },
    serverResult: null,
    server404: false,
  });
  ok = line(loggedOut == null, 'mirror: logged-out ⇒ no day result (login-only)') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SERVER_TRUTH_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SERVER_TRUTH_PHASE2_FAILED');
  process.exit(1);
}

main();
