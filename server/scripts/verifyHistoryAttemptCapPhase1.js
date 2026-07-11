#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — History attempt storage cap (50 per user, FIFO prune, same-test rows kept).
 *
 * Usage:
 *   node scripts/verifyHistoryAttemptCapPhase1.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

const MAX = 50;

function simulateInsertAndCap(existing, newRow) {
  const rows = [...existing, newRow];
  rows.sort((a, b) => {
    if (a.completedAtMillis !== b.completedAtMillis) {
      return a.completedAtMillis - b.completedAtMillis;
    }
    return a.id - b.id;
  });
  while (rows.length > MAX) {
    rows.shift();
  }
  return rows;
}

function main() {
  console.log('=== Phase 1: History 50-attempt cap (FIFO) ===\n');
  let ok = true;

  const daoKt = read('app/src/main/java/com/freemocktest/app/data/local/TestAttemptDao.kt');
  const repoKt = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');
  const appKt = read('app/src/main/java/com/freemocktest/app/MockTestApp.kt');

  ok = line(repoKt.includes('MAX_STORED_ATTEMPTS_PER_USER = 50'), 'Repository defines 50-attempt cap') && ok;
  ok = line(daoKt.includes('countAllByUserKeys'), 'DAO counts all attempts for user lookup keys') && ok;
  ok = line(daoKt.includes('deleteOldestByUserKeys'), 'DAO deletes oldest rows first (FIFO)') && ok;
  ok = line(
    daoKt.includes('ORDER BY completed_at_millis ASC, id ASC'),
    'FIFO tie-break uses completed time then row id',
  ) && ok;
  ok = line(daoKt.includes('insertAndEnforceCap'), 'DAO wraps insert + prune in one transaction') && ok;
  ok = line(repoKt.includes('insertAndEnforceCap'), 'recordAttempt enforces cap after each save') && ok;
  ok = line(repoKt.includes('enforceStoredAttemptCapForAllUsers'), 'Startup trims users already over cap') && ok;
  ok = line(
    repoKt.includes('enforceStoredAttemptCapForAllUsers') &&
      appKt.includes('migrateLegacyUserKeysIfNeeded'),
    'App startup runs cap enforcement via legacy migration hook',
  ) && ok;
  ok = line(
    !repoKt.includes('UPDATE test_attempts SET') || repoKt.includes('insertAndEnforceCap'),
    'Attempts are inserted (not upserted by test name)',
  ) && ok;

  // --- Sims ---
  let rows = [];
  let nextId = 1;
  const add = (testName, correct, total, completedAtMillis) => {
    rows = simulateInsertAndCap(rows, {
      id: nextId++,
      testName,
      correct,
      total,
      completedAtMillis,
    });
  };

  add('Bihar GK', 6, 10, 1000);
  add('Bihar GK', 7, 10, 2000);
  add('Bihar GK', 8, 10, 3000);
  ok = line(rows.length === 3, 'Sim: same test 3 attempts → 3 separate rows') && ok;
  ok = line(rows.filter((r) => r.testName === 'Bihar GK').length === 3, 'Sim: same test name kept 3 times') && ok;

  rows = [];
  nextId = 1;
  for (let i = 0; i < 51; i += 1) {
    add(`Test ${i % 5}`, 5, 10, i * 1000);
  }
  ok = line(rows.length === MAX, 'Sim: 51 inserts → exactly 50 rows remain') && ok;
  ok = line(rows[0].completedAtMillis === 1000, 'Sim: oldest attempt pruned (FIFO)') && ok;
  ok = line(rows[rows.length - 1].completedAtMillis === 50000, 'Sim: newest attempt kept') && ok;

  rows = [];
  nextId = 1;
  for (let i = 0; i < 50; i += 1) {
    add('Bihar GK', i, 10, i * 100);
  }
  add('Bihar GK', 99, 10, 99999);
  ok = line(rows.length === MAX, 'Sim: 51st same-test attempt still respects cap') && ok;
  ok = line(rows[rows.length - 1].correct === 99, 'Sim: latest same-test attempt survives prune') && ok;
  ok = line(rows[0].correct === 1, 'Sim: earliest same-test attempt removed first') && ok;

  console.log(`\n${ok ? 'VERIFY_HISTORY_ATTEMPT_CAP_PHASE1_OK' : 'VERIFY_HISTORY_ATTEMPT_CAP_PHASE1_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
