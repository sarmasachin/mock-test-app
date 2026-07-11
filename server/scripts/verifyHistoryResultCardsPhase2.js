#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — History result-style cards UI (overview rows).
 *
 * Usage:
 *   node scripts/verifyHistoryResultCardsPhase2.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 2: History result cards UI ===\n');
  let ok = true;

  const historyKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt');
  const cardKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryResultCard.kt');
  const uiKt = read('app/src/main/java/com/freemocktest/app/util/HistoryAttemptUi.kt');
  const utilsKt = read('app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt');

  ok = line(uiKt.includes('object HistoryAttemptUi'), 'HistoryAttemptUi mapper exists') && ok;
  ok = line(uiKt.includes('ResultCardModel'), 'Result card model defined') && ok;
  ok = line(uiKt.includes('HomeAttemptStatsUtils.formatHomeAttemptScore'), 'Card score uses Result-aligned formatter') && ok;
  ok = line(uiKt.includes('attemptScorePercent'), 'Card percent uses marks-aware helper') && ok;
  ok = line(cardKt.includes('fun HistoryResultCard'), 'HistoryResultCard composable exists') && ok;
  ok = line(cardKt.includes('Answered'), 'Card shows answered stat') && ok;
  ok = line(cardKt.includes('Correct'), 'Card shows correct stat') && ok;
  ok = line(cardKt.includes('Wrong'), 'Card shows wrong stat') && ok;
  ok = line(cardKt.includes('0xFF1D4ED8'), 'Card score banner matches Result gradient') && ok;
  ok = line(historyKt.includes('HistoryResultCard'), 'History screen renders result cards') && ok;
  ok = line(historyKt.includes('key = { it.id }'), 'List keys rows by attempt id (same test safe)') && ok;
  ok = line(historyKt.includes('MAX_STORED_ATTEMPTS_PER_USER'), 'Header mentions 50-result device cap') && ok;
  ok = line(!historyKt.includes('private fun HistoryCard'), 'Legacy simple HistoryCard removed') && ok;
  ok = line(utilsKt.includes('formatHomeAttemptScore'), 'Shared score formatter still available') && ok;

  console.log(`\n${ok ? 'VERIFY_HISTORY_RESULT_CARDS_PHASE2_OK' : 'VERIFY_HISTORY_RESULT_CARDS_PHASE2_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
