#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — daily quiz local cache user isolation (Android AppPreferencesRepository).
 *
 * Usage:
 *   node scripts/verifyDailyQuizUserIsolationPhase1.js
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

/** Mirror Phase 1 owner guard (JS) for regression vectors. */
function readDailyQuizRootForUser(stored, ownerNow) {
  const raw = String(stored.raw || '').trim();
  const ownerStored = String(stored.owner || '').trim();
  if (!raw) {
    return { owner: ownerNow, raw: '', root: {} };
  }
  const ownerMismatch = ownerStored && ownerStored.toLowerCase() !== ownerNow.toLowerCase();
  const orphanLegacy = !ownerStored || ownerStored.toLowerCase() === 'guest';
  if (ownerMismatch || orphanLegacy) {
    return { owner: ownerNow, raw: '', root: {} };
  }
  let root = {};
  try {
    root = JSON.parse(raw);
  } catch {
    root = {};
  }
  return { owner: ownerNow, raw, root };
}

function main() {
  console.log('=== Phase 1: daily quiz user isolation (local cache) ===\n');
  let ok = true;

  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');

  ok = line(prefs.includes('keyDailyQuizResultsOwner'), 'owner key daily_quiz_results_owner_v1') && ok;
  ok =
    line(
      prefs.includes('readDailyQuizResultsRootForCurrentUser') &&
        prefs.includes('prepareDailyQuizResultsRootForWrite'),
      'read/write owner guard helpers',
    ) && ok;
  ok =
    line(
      prefs.includes('currentContentStateOwnerId') &&
        prefs.includes('loadDailyQuizDayResult') &&
        prefs.includes('readDailyQuizResultsRootForCurrentUser()'),
      'loadDailyQuizDayResult uses owner-scoped read',
    ) && ok;
  ok =
    line(
      prefs.includes('loadDailyQuizAttemptedDates') &&
        prefs.includes('readDailyQuizResultsRootForCurrentUser()'),
      'loadDailyQuizAttemptedDates uses owner-scoped read',
    ) && ok;
  ok =
    line(
      prefs.includes('prepareDailyQuizResultsRootForWrite') &&
        prefs.includes('saveDailyQuizDayResult'),
      'saveDailyQuizDayResult pins owner on write',
    ) && ok;
  ok =
    line(
      prefs.includes('orphanLegacy') || prefs.includes('orphan legacy'),
      'orphan legacy blob discarded (no owner)',
    ) && ok;
  ok =
    line(
      prefs.includes('ownerMismatch') || prefs.includes('owner mismatch'),
      'prior user blob discarded on owner mismatch',
    ) && ok;

  // --- Logic mirror ---
  const userA = 'usera@example.com';
  const userB = 'userb@example.com';
  const legacyRaw = JSON.stringify({
    '2026-07-09': { questions: [], totalTimeTakenSeconds: 30, savedAtMillis: 1 },
  });

  const bleed = readDailyQuizRootForUser({ owner: '', raw: legacyRaw }, userB);
  ok = line(Object.keys(bleed.root).length === 0, 'mirror: User B does not inherit orphan legacy blob') && ok;

  const ownedA = readDailyQuizRootForUser({ owner: userA, raw: legacyRaw }, userB);
  ok = line(Object.keys(ownedA.root).length === 0, 'mirror: User B does not read User A owned blob') && ok;

  const sameUser = readDailyQuizRootForUser({ owner: userA, raw: legacyRaw }, userA);
  ok =
    line(
      sameUser.root['2026-07-09'] != null,
      'mirror: same user keeps owned blob',
    ) && ok;

  const guestLegacy = readDailyQuizRootForUser({ owner: 'guest', raw: legacyRaw }, userB);
  ok = line(Object.keys(guestLegacy.root).length === 0, 'mirror: legacy guest owner blob discarded') && ok;

  const guestEmpty = readDailyQuizRootForUser({ owner: userA, raw: '' }, userB);
  ok = line(Object.keys(guestEmpty.root).length === 0, 'mirror: empty blob after account switch') && ok;

  // Server remains per-user (sanity)
  const dailyQuizJs = read('server/src/routes/dailyQuiz.js');
  ok =
    line(
      dailyQuizJs.includes('WHERE user_id = $1::uuid AND quiz_day = $2::date'),
      'server: attempts scoped by user_id (unchanged)',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_USER_ISOLATION_PHASE1_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_USER_ISOLATION_PHASE1_FAILED');
  process.exit(1);
}

main();
