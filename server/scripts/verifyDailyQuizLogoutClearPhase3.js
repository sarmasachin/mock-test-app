#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — daily quiz cache cleared on logout.
 *
 * Usage:
 *   node scripts/verifyDailyQuizLogoutClearPhase3.js
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

function main() {
  console.log('=== Phase 3: daily quiz logout cache clear ===\n');
  let ok = true;

  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const auth = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');

  ok =
    line(
      prefs.includes('clearDailyQuizResultsCache') &&
        prefs.includes('keyDailyQuizResultsByDayJson') &&
        prefs.includes('keyDailyQuizResultsOwner'),
      'AppPreferencesRepository: clearDailyQuizResultsCache helper',
    ) && ok;

  ok =
    line(
      prefs.includes('clearAuthSessionPrefs') &&
        prefs.includes('prefs[keyDailyQuizResultsByDayJson] = ""') &&
        prefs.includes('prefs[keyDailyQuizResultsOwner] = ""'),
      'clearAuthSessionPrefs clears daily quiz keys on logout',
    ) && ok;

  ok =
    line(
      auth.includes('suspend fun logout()') && auth.includes('clearAuthSessionPrefs()'),
      'AuthRepository.logout invokes clearAuthSessionPrefs',
    ) && ok;

  ok =
    line(
      prefs.includes('Phase 3') &&
        prefs.includes('daily quiz completion must not survive logout'),
      'logout path documents daily quiz wipe',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_LOGOUT_CLEAR_PHASE3_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_LOGOUT_CLEAR_PHASE3_FAILED');
  process.exit(1);
}

main();
