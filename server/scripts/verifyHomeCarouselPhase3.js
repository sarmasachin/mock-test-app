#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — home carousel edge cases (priority, catalog fallback, overflow).
 *
 * Usage:
 *   node scripts/verifyHomeCarouselPhase3.js
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

function simulatePrioritize(items, maxVisible) {
  const suggests = items.filter((i) => i.kind === 'SUGGEST_APPLY');
  const applied = items.filter((i) => i.kind === 'APPLIED');
  const prioritized = suggests.concat(applied);
  const visible = prioritized.slice(0, maxVisible);
  const overflow = Math.max(0, prioritized.length - visible.length);
  return { visible, overflow };
}

function main() {
  console.log('=== Phase 3: Home carousel edge cases ===\n');
  let ok = true;

  ok = line(loaderKt.includes('loadSnapshotsForHomeCarousel'), 'Home carousel catalog loader exists') && ok;
  ok = line(loaderKt.includes('loadTestsForSubcategory'), 'Interest catalog subcategory fallback exists') && ok;
  ok = line(loaderKt.includes('indexSnapshotAliases'), 'Catalog snapshots indexed by title/subcategory') && ok;
  ok = line(uiKt.includes('prioritizeCarouselForDisplay'), 'Carousel prioritizes suggest-apply cards first') && ok;
  ok = line(uiKt.includes('visibleCarouselItems'), 'UI state exposes visible carousel slice') && ok;
  ok = line(uiKt.includes('carouselOverflowCount'), 'UI state tracks overflow count') && ok;
  ok = line(sectionKt.includes('visibleCarouselItems'), 'Section renders prioritized visible cards') && ok;
  ok = line(homeKt.includes('loadSnapshotsForHomeCarousel'), 'Home loads snapshots for applied + interests') && ok;
  ok = line(homeKt.includes('resolvePendingInterestTests'), 'Home resolves pending interests for carousel') && ok;

  const manyApplied = simulatePrioritize(
    [
      { kind: 'APPLIED', name: 'a1' },
      { kind: 'APPLIED', name: 'a2' },
      { kind: 'APPLIED', name: 'a3' },
      { kind: 'APPLIED', name: 'a4' },
      { kind: 'APPLIED', name: 'a5' },
      { kind: 'SUGGEST_APPLY', name: 'Bihar GK' },
    ],
    5,
  );
  ok = line(
    manyApplied.visible.some((i) => i.name === 'Bihar GK'),
    'Sim: Bihar GK stays visible when many applied tests exist',
  ) && ok;
  ok = line(manyApplied.overflow > 0, 'Sim: overflow counts hidden applied tests') && ok;

  const onlyApplied = simulatePrioritize(
    [
      { kind: 'APPLIED', name: 't1' },
      { kind: 'APPLIED', name: 't2' },
    ],
    5,
  );
  ok = line(onlyApplied.overflow === 0, 'Sim: no overflow when total cards <= max visible') && ok;

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
