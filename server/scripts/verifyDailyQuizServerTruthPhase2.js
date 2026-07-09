#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — daily quiz server truth priority (logged-in users).
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
function resolveDayResult({ loggedIn, localResult, serverResult, serverChecked404 }) {
  if (loggedIn) {
    if (serverResult != null) return serverResult;
    if (serverChecked404) return null;
    return null;
  }
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
        repo.includes('if (isLoggedIn())') &&
        repo.includes('loadDayFromServer(day)'),
      'DailyQuizRepository: logged-in server-first loader',
    ) && ok;

  ok =
    line(
      repo.includes('clearDailyQuizDayResult(day)') && repo.includes('e.code() == 404'),
      'loadDayFromServer: 404 clears stale local day',
    ) && ok;

  ok =
    line(
      repo.includes('replaceDailyQuizResultsForCurrentUser(attemptsByDay)') &&
        !repo.match(/saveDailyQuizDayResult\(session\)/),
      'syncHistoryFromServer: replace cache (no per-row local merge)',
    ) && ok;

  ok =
    line(
      ui.includes('loadDayResultForCurrentUser(selectedDate)') &&
        !ui.includes('AppPreferencesRepository.loadDailyQuizDayResult(selectedDate)'),
      'DailyDigestScreenNew: day load uses server-first helper',
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
    serverChecked404: true,
  });
  ok = line(loggedInNewUser == null, 'mirror: logged-in + server 404 ⇒ not attempted') && ok;

  const loggedInHasAttempt = resolveDayResult({
    loggedIn: true,
    localResult: null,
    serverResult: { day: '2026-07-09' },
    serverChecked404: false,
  });
  ok = line(loggedInHasAttempt != null, 'mirror: logged-in + server hit ⇒ dashboard data') && ok;

  const guestLocal = resolveDayResult({
    loggedIn: false,
    localResult: { day: '2026-07-09' },
    serverResult: null,
    serverChecked404: false,
  });
  ok = line(guestLocal != null, 'mirror: guest still uses local cache') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SERVER_TRUTH_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SERVER_TRUTH_PHASE2_FAILED');
  process.exit(1);
}

main();
