#!/usr/bin/env node
'use strict';

/**
 * Verify Home Option A (applied cards section) + Option E (smart Start test card).
 *
 * Usage:
 *   node scripts/verifyHomeAppliedTestsSection.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
const sectionKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeAppliedTestsSection.kt');
const catalogCardKt = read('app/src/main/java/com/freemocktest/app/newui/home/AppliedTestCatalogCard.kt');
const uiKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt');
const hostKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
const previewKt = read('app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt');
const authKt = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Home Applied Tests (Option A + E) ===\n');
  let ok = true;

  ok = line(uiKt.includes('buildHomeAppliedTestsUiState'), 'AppliedTestHomeUi shared builder exists') && ok;
  ok = line(uiKt.includes('startTestSubtitle'), 'Option E smart Start test subtitle computed') && ok;
  ok = line(uiKt.includes('total == 1') && uiKt.includes('tests applied'), 'Multi-applied subtitle rules present') && ok;
  ok = line(uiKt.includes('resolveCardUiState'), 'Per-card countdown/status resolver exists') && ok;
  ok = line(uiKt.includes('HomeTestCarouselItem'), 'Unified carousel item model exists') && ok;
  ok = line(uiKt.includes('resolveSuggestApplyCardUiState'), 'Suggest-apply card state resolver exists') && ok;
  ok = line(catalogCardKt.includes('AppliedTestCatalogCard'), 'Shared catalog card UI extracted') && ok;

  ok = line(sectionKt.includes('HomeAppliedTestsSection'), 'HomeAppliedTestsSection composable exists') && ok;
  ok = line(sectionKt.includes('LazyRow'), 'Horizontal scroll row for applied cards') && ok;
  ok = line(sectionKt.includes('My Applied Tests'), 'Section title present') && ok;
  ok = line(sectionKt.includes('View all'), 'View all action present') && ok;

  ok = line(homeKt.includes('HomeAppliedTestsSection('), 'Home screen renders applied section') && ok;
  ok = line(homeKt.includes('AppliedTestHomeUi.buildHomeAppliedTestsUiState'), 'Home uses shared UI state') && ok;
  ok = line(homeKt.includes('syncAppliedTestSeriesFromServer'), 'Home syncs applied tests from server') && ok;
  ok = line(homeKt.includes('appliedSnapshotsReloadKey'), 'Catalog snapshots reload on resume/pull') && ok;
  ok = line(homeKt.includes('onStartTest(startSeriesState.routeName)'), 'Start test quick action uses smart route') && ok;
  ok = line(homeKt.includes('appliedHomeState.showSection'), 'Section hidden when carousel is empty') && ok;
  ok = line(sectionKt.includes('visibleCarouselItems'), 'Section scroll uses merged carousel list') && ok;
  ok = line(homeKt.includes('onSuggestApply'), 'Suggest-apply cards open apply flow from Home') && ok;
  ok = line(homeKt.includes('HomeCarouselNavigation'), 'Home uses unified carousel navigation resolver') && ok;

  ok = line(hostKt.includes('navigateToStartTestPreview(routeName)'), 'Navigation uses encoded start_test_preview route') && ok;
  ok = line(previewKt.includes('showAppliedList'), 'Full applied list screen still exists') && ok;
  ok = line(previewKt.includes('activeAppliedEntries'), 'View all uses applied test entries list') && ok;
  ok = line(previewKt.includes('AppliedTestStartCardSection'), 'View all uses classic preview cards') && ok;
  ok = line(previewKt.includes('loadSnapshotsForHomeCarousel'), 'View all loads applied test snapshots') && ok;
  ok = line(!previewKt.includes('AppliedTestCatalogCard'), 'View all does not use premium catalog cards') && ok;
  ok = line(authKt.includes('syncAppliedTestSeriesFromServer'), 'Server my-applications sync helper exists') && ok;
  ok = line(authKt.includes('getMyTestApplications'), 'GET /tests/my-applications wired') && ok;

  console.log('\n--- Expected UX ---');
  console.log('0 applied + 0 interests: section hidden; Start card = "Apply from Tests tab"');
  console.log('0 applied + interests: suggest cards visible; Start = "Tap a card below to apply"');
  console.log('1 applied: 1 card + specific preview route');
  console.log('3 applied: scroll cards + "3 tests applied · Tap to view all"');
  console.log('Applied + Bihar GK: same horizontal carousel, suggest cards prioritized in view');
  console.log('View all / Start (multi): start_test_preview/applied — classic preview cards per applied test');

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
