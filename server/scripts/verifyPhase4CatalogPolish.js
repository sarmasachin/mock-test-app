#!/usr/bin/env node
'use strict';

/**
 * Phase 4 verify — catalog metadata on Home applied cards + loading polish.
 *
 * Usage:
 *   node scripts/verifyPhase4CatalogPolish.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const uiKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt');
const loaderKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestCatalogLoader.kt');
const sectionKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeAppliedTestsSection.kt');
const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 4: Catalog metadata + polish ===\n');
  let ok = true;

  ok = line(loaderKt.includes('loadSnapshotsForAppliedTests'), 'Central catalog snapshot loader exists') && ok;
  ok = line(loaderKt.includes('loadTestForApplyScreen'), 'Loader uses server resolve + cache') && ok;
  ok = line(uiKt.includes('catalogLoaded'), 'Card UI state tracks catalog load') && ok;
  ok = line(uiKt.includes('examStartLabel'), 'Exam date/slot shown on cards when locked') && ok;
  ok = line(uiKt.includes('enrolledLabel'), 'Enrollment label on cards from catalog') && ok;
  ok = line(sectionKt.includes('catalogLoading'), 'Cards show loading spinner while catalog fetches') && ok;
  ok = line(sectionKt.includes('CircularProgressIndicator'), 'Loading indicator on cards') && ok;
  ok = line(homeKt.includes('AppliedTestCatalogLoader'), 'Home uses catalog loader') && ok;
  ok = line(homeKt.includes('appliedSnapshotsLoading'), 'Home tracks catalog loading state') && ok;
  ok = line(homeKt.includes('catalogLoading = appliedSnapshotsLoading'), 'Loading state passed to section') && ok;

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
