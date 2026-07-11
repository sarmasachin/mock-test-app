#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — quiz submit resolves catalog id via fallback chain; always saves
 * local attempt + pending result even when catalog id is missing.
 *
 * Usage:
 *   node scripts/verifyQuizSubmitCatalogIdFallback.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const hostKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
const contentKt = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
const historyKt = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');
const applyKt = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');
const applyStateKt = read('app/src/main/java/com/freemocktest/app/util/TestApplyState.kt');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 2: Quiz submit catalog id fallback ===\n');
  let ok = true;

  ok = line(contentKt.includes('resolveCatalogIdForQuizSubmit'), 'ContentRepository has shared catalog id resolver') && ok;
  ok = line(contentKt.includes('resolveTestCardForNavigation'), 'Resolver uses navigation card lookup') && ok;
  ok = line(contentKt.includes('findAppliedEntryForTestLookup'), 'Resolver falls back to applied entry testId') && ok;
  ok = line(contentKt.includes('loadTestForApplyScreen'), 'Resolver falls back to apply-screen load') && ok;
  ok = line(
    contentKt.includes('allowDefaultFallback = false'),
    'Resolver uses strict catalog title lookup last',
  ) && ok;
  ok = line(contentKt.includes('TestApplyState.preferStableTestId'), 'Resolver uses preferStableTestId from apply load') && ok;

  ok = line(
    hostKt.includes('resolveCatalogIdForQuizSubmit(testTitle)') &&
      hostKt.includes('markPendingResultSubmittedNow'),
    'Submit handler calls resolver then saves pending result',
  ) && ok;
  ok = line(
    !hostKt.includes('Test details missing. Please retry.'),
    'Submit no longer aborts entire result when catalog id missing',
  ) && ok;
  ok = line(
    /recordAttempt[\s\S]*markPendingResultSubmittedNow/.test(hostKt),
    'History recordAttempt always runs before pending result save',
  ) && ok;
  ok = line(
    /markPendingResultSubmittedNow[\s\S]*removeAppliedTestSeriesNow/.test(hostKt),
    'Pending result + applied cleanup always run after submit',
  ) && ok;
  ok = line(
    /if \(catalogId\.isNotBlank\(\)\)[\s\S]*postAttemptRemote/.test(historyKt),
    'Server sync only when catalog id resolved',
  ) && ok;

  ok = line(applyKt.includes('TestApplyState.preferStableTestId'), 'Apply screen uses preferStableTestId') && ok;
  ok = line(applyStateKt.includes('fun preferStableTestId'), 'TestApplyState preferStableTestId helper exists') && ok;

  console.log(`\n${ok ? 'VERIFY_QUIZ_SUBMIT_CATALOG_ID_OK' : 'VERIFY_QUIZ_SUBMIT_CATALOG_ID_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
