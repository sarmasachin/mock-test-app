#!/usr/bin/env node
'use strict';

/**
 * Phase 4 verify — featured UI, admin drag reorder, home carousel boost.
 * Run: npm run verify:state-exam-phase4
 */

const fs = require('fs');
const path = require('path');
const {
  buildFeaturedStateExamsForHome,
  sortStateExamItems,
} = require('../src/lib/stateExamDynamicSpec');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  console.log('=== Phase 4: Featured UI + reorder + home boost ===\n');
  let ok = true;

  const wizardTs = read('admin-web/src/lib/stateExamWizard.ts');
  const tabTsx = read('admin-web/src/tabs/StateExamManagerTab.tsx');
  const boostKt = read('app/src/main/java/com/freemocktest/app/util/StateExamFeaturedHomeBoost.kt');
  const homeUiKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt');
  const gridKt = read('app/src/main/java/com/freemocktest/app/newui/home/StateExamSectionedGrid.kt');
  const cardKt = read('app/src/main/java/com/freemocktest/app/newui/home/AppliedTestCatalogCard.kt');
  const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');

  ok = line(fs.existsSync(path.join(root, 'server/PHASE4_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'Phase 4 runbook exists') && ok;

  ok = line(wizardTs.includes('applySectionRowOrder'), 'admin reorder helper') && ok;
  ok = line(wizardTs.includes('groupStateRowsBySection'), 'admin section grouping') && ok;
  ok = line(wizardTs.includes('toggleRowFeatured'), 'admin featured toggle helper') && ok;
  ok = line(tabTsx.includes('draggable'), 'admin drag reorder UI') && ok;
  ok = line(tabTsx.includes('onReorderSection'), 'admin saves reorder') && ok;
  ok = line(tabTsx.includes('onToggleFeaturedRow'), 'admin featured quick toggle') && ok;
  ok = line(read('admin-web/src/App.css').includes('state-exam-reorder-list'), 'reorder CSS') && ok;

  ok = line(boostKt.includes('resolveCarouselSuggestTests'), 'Android home boost resolver') && ok;
  ok = line(boostKt.includes('featuredTestsForState'), 'Android featured by signup state') && ok;
  ok = line(homeUiKt.includes('StateExamFeaturedHomeBoost'), 'home UI uses boost') && ok;
  ok = line(homeUiKt.includes('isFeaturedStateExamBoost'), 'carousel featured flag') && ok;
  ok = line(homeKt.includes('signupStateForHome'), 'home loads signup state') && ok;
  ok = line(homeKt.includes('examCategoriesForHome'), 'home uses exam categories') && ok;
  ok = line(gridKt.includes('Important'), 'section featured highlight') && ok;
  ok = line(gridKt.includes('0xFFEAB308'), 'featured circle gold border') && ok;
  ok = line(cardKt.includes('isFeaturedStateExamBoost'), 'home card featured styling') && ok;

  const featured = buildFeaturedStateExamsForHome(
    {
      items: [
        {
          level1: 'State',
          level2: 'Bihar',
          level3: 'Bihar Police SI',
          sectionSlug: 'police',
          featured: true,
          itemSortOrder: 2,
          enabled: true,
        },
        {
          level1: 'State',
          level2: 'Bihar',
          level3: 'Bihar GK',
          sectionSlug: 'gk',
          featured: true,
          itemSortOrder: 1,
          enabled: true,
        },
        {
          level1: 'State',
          level2: 'Bihar',
          level3: 'Bihar TET',
          sectionSlug: 'teaching',
          featured: false,
          enabled: true,
        },
      ],
    },
    'Bihar',
    { maxItems: 4 },
  );
  ok = line(featured.length === 2, 'server featured home boost returns 2') && ok;
  ok = line(featured[0].level3 === 'Bihar GK', 'featured sorted by itemSortOrder') && ok;

  const excluded = buildFeaturedStateExamsForHome(
    { items: [{ level1: 'State', level2: 'Bihar', level3: 'Applied Test', featured: true, enabled: true }] },
    'Bihar',
    { excludeApplied: ['Applied Test'] },
  );
  ok = line(excluded.length === 0, 'excludes already applied tests') && ok;

  const sorted = sortStateExamItems([
    { level3: 'B', featured: false, itemSortOrder: 1 },
    { level3: 'A', featured: true, itemSortOrder: 99 },
  ]);
  ok = line(sorted[0].level3 === 'A', 'featured still sorts first') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE4_OK' : 'VERIFY_STATE_EXAM_PHASE4_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
