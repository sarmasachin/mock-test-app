#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — Home carousel production ship gate (carousel + apply + enrollment offline).
 *
 * Usage:
 *   node scripts/verifyPhase5FullShip.js
 *   node scripts/verifyPhase5FullShip.js --require-apk
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const root = path.join(scriptsDir, '..');
const appRoot = path.join(root, '..');

const phaseScripts = [
  'verifyHomeCarouselPhase4Ship.js',
  'verifyHomeAttemptStatsPhase4Ship.js',
  'verifyApplyUxPhases.js',
  'verifyApplyBackToStartTestNavigation.js',
  'verifyQuizSubmitCatalogIdFallback.js',
  'verifyPhase2AndroidHpGk.js',
  'verifyApplyOncePhase5.js',
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
  'app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt',
  'app/src/main/java/com/freemocktest/app/util/UserScopeKeys.kt',
];

const requiredServerPatterns = [
  { file: 'server/src/routes/tests.js', patterns: ['my-applications', '/apply'] },
  { file: 'server/src/routes/admin.js', patterns: ['validateExamCategoriesPatch'] },
];

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(appRoot, rel), 'utf8');
}

function main() {
  const requireApk = process.argv.includes('--require-apk');
  console.log('=== Phase 5: Home carousel production ship ===\n');
  let ok = true;

  for (const rel of requiredAppFiles) {
    const full = path.join(appRoot, rel);
    ok = line(fs.existsSync(full), `App file present: ${rel}`) && ok;
  }

  for (const { file, patterns } of requiredServerPatterns) {
    const full = path.join(appRoot, file);
    if (!fs.existsSync(full)) {
      ok = line(false, `Server file missing: ${file}`) && ok;
      continue;
    }
    const src = fs.readFileSync(full, 'utf8');
    for (const p of patterns) {
      ok = line(src.includes(p), `Server ${file} includes ${p}`) && ok;
    }
  }

  const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
  ok = line(homeKt.includes('HomeCarouselNavigation.resolveCarouselTapAction'), 'Home uses unified carousel navigation') && ok;
  ok = line(homeKt.includes('handleHomeAppliedCarouselTap'), 'Home applied carousel tap handler wired') && ok;
  ok = line(homeKt.includes('openHomeSuggestApply'), 'Home suggest-apply carousel handler wired') && ok;
  ok = line(homeKt.includes('loadSnapshotsForHomeCarousel'), 'Home carousel catalog reload on pull/resume') && ok;

  const statsUtilsKt = read('app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt');
  ok = line(statsUtilsKt.includes('formatHomeAttemptScore'), 'Home stats shared formatter present') && ok;
  ok = line(statsUtilsKt.includes('attemptScorePercent'), 'Progress/home stats share marks-aware percent') && ok;

  const apkCandidates = [
    path.join(appRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-LATEST.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-HOME-CAROUSEL-PHASE4.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-HOME-STATS-PHASE4.apk'),
  ];
  const apkFound = apkCandidates.find((p) => fs.existsSync(p));
  ok = line(!requireApk || !!apkFound, requireApk ? 'Debug APK present on disk' : 'Debug APK check optional') && ok;
  if (apkFound) {
    ok = line(true, `APK: ${apkFound}`) && ok;
  }

  console.log('\n--- Running production ship scripts ---\n');
  for (const script of phaseScripts) {
    const scriptPath = path.join(scriptsDir, script);
    if (!fs.existsSync(scriptPath)) {
      ok = line(false, `Missing script: ${script}`) && ok;
      continue;
    }
    try {
      const extraArgs = script === 'verifyHomeCarouselPhase4Ship.js' && requireApk ? ' --require-apk' : '';
      execSync(`node "${scriptPath}"${extraArgs}`, { stdio: 'inherit', cwd: root });
      ok = line(true, `${script} passed`) && ok;
    } catch {
      ok = line(false, `${script} FAILED`) && ok;
    }
  }

  console.log(`\n${ok ? 'PHASE5_SHIP_VERIFY_OK' : 'PHASE5_SHIP_VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
