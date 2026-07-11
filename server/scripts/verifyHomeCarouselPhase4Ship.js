#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — Home carousel full ship: Phases 1–3 suites + integrated E2E mirror + APK.
 *
 * Usage:
 *   node scripts/verifyHomeCarouselPhase4Ship.js
 *   node scripts/verifyHomeCarouselPhase4Ship.js --require-apk
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const appRoot = path.join(scriptsDir, '..', '..');

const phaseScripts = [
  'verifyHomeAppliedTestsSection.js',
  'verifyHomeCarouselPhase3.js',
  'verifyPhase3HomeNavigation.js',
  'verifyPhase4CatalogPolish.js',
];

const requiredAppFiles = [
  'app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt',
  'app/src/main/java/com/freemocktest/app/util/AppliedTestCatalogLoader.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeAppliedTestNavigation.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeCarouselNavigation.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeCategoryNavigation.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeAppliedTestsSection.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/AppliedTestCatalogCard.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt',
];

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(appRoot, rel), 'utf8');
}

function simulateInterestOnlyCarousel(interests, activeEntries) {
  const normalized = interests.map((i) => i.trim()).filter(Boolean);
  const pending = normalized.filter((interest) =>
    !activeEntries.some(
      (entry) =>
        entry.toLowerCase() === interest.toLowerCase() ||
        entry.toLowerCase().includes(interest.toLowerCase()),
    ),
  );
  const suggests = pending.map((name) => ({ kind: 'SUGGEST_APPLY', name }));
  const applied = activeEntries.map((name) => ({ kind: 'APPLIED', name }));
  return suggests.concat(applied);
}

function simulateAfterApply(interests, appliedBefore, newlyApplied) {
  const active = [...appliedBefore, newlyApplied];
  return simulateInterestOnlyCarousel(interests, active);
}

function main() {
  const requireApk = process.argv.includes('--require-apk');
  console.log('=== Phase 4: Home carousel full ship ===\n');
  let ok = true;

  for (const rel of requiredAppFiles) {
    ok = line(fs.existsSync(path.join(appRoot, rel)), `App file: ${rel}`) && ok;
  }

  const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
  const uiKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt');
  const loaderKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestCatalogLoader.kt');
  const navKt = read('app/src/main/java/com/freemocktest/app/util/HomeCarouselNavigation.kt');

  ok = line(!homeKt.includes('HomeInterestApplySection'), 'Legacy Quick Apply section removed') && ok;
  ok = line(homeKt.includes('HomeCarouselNavigation.resolveCarouselTapAction'), 'Home wires unified carousel navigation') && ok;
  ok = line(homeKt.includes('handleHomeAppliedCarouselTap'), 'Home applied carousel tap handler exists') && ok;
  ok = line(homeKt.includes('loadSnapshotsForHomeCarousel'), 'Home reloads carousel catalog snapshots') && ok;
  ok = line(uiKt.includes('Tap a card below to apply'), 'Start card subtitle when only suggest cards') && ok;
  ok = line(uiKt.includes('firstSuggestName'), 'Start card routes to first suggest when none applied') && ok;
  ok = line(loaderKt.includes('resolveCachedSnapshot'), 'Carousel loader uses scoped snapshot cache') && ok;
  ok = line(navKt.includes('resolveCarouselTapAction'), 'Unified carousel tap resolver exists') && ok;

  const interestOnly = simulateInterestOnlyCarousel(['Bihar GK'], []);
  ok = line(
    interestOnly.length === 1 && interestOnly[0].kind === 'SUGGEST_APPLY',
    'Sim: interest-only user gets suggest carousel card',
  ) && ok;

  const afterApply = simulateAfterApply(['Bihar GK'], [], 'Bihar GK');
  ok = line(
    afterApply.some((i) => i.kind === 'APPLIED' && i.name === 'Bihar GK'),
    'Sim: after apply, test moves to applied carousel bucket',
  ) && ok;
  ok = line(
    !afterApply.some((i) => i.kind === 'SUGGEST_APPLY'),
    'Sim: applied test removed from suggest bucket',
  ) && ok;

  const apkCandidates = [
    path.join(appRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-LATEST.apk'),
  ];
  const apkFound = apkCandidates.find((p) => fs.existsSync(p));
  ok = line(!requireApk || !!apkFound, requireApk ? 'Debug APK present' : 'Debug APK check optional') && ok;
  if (apkFound) {
    ok = line(true, `APK: ${apkFound}`) && ok;
  }

  console.log('\n--- Running phase scripts ---\n');
  for (const script of phaseScripts) {
    const scriptPath = path.join(scriptsDir, script);
    try {
      execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: path.join(scriptsDir, '..') });
      ok = line(true, `${script} passed`) && ok;
    } catch {
      ok = line(false, `${script} FAILED`) && ok;
    }
  }

  console.log(`\n${ok ? 'VERIFY_HOME_CAROUSEL_PHASE4_SHIP_OK' : 'VERIFY_HOME_CAROUSEL_PHASE4_SHIP_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
