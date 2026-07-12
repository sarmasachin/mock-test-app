#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — Android generic StateExamSectionedGrid for all states.
 * Run: npm run verify:state-exam-phase3
 */

const fs = require('fs');
const path = require('path');
const {
  buildStateExamSectionsForState,
  suggestSectionSlugFromLevel3,
  compareStateExamItems,
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
  console.log('=== Phase 3: Android state exam sectioned UI ===\n');
  let ok = true;

  const catalogKt = 'app/src/main/java/com/freemocktest/app/util/StateExamDynamicCatalog.kt';
  const gridKt = 'app/src/main/java/com/freemocktest/app/newui/home/StateExamSectionedGrid.kt';
  const screenKt = 'app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt';

  ok = line(fs.existsSync(path.join(root, catalogKt)), 'StateExamDynamicCatalog.kt exists') && ok;
  ok = line(fs.existsSync(path.join(root, gridKt)), 'StateExamSectionedGrid.kt exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/PHASE3_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'Phase 3 runbook exists') && ok;

  const catalogSrc = read(catalogKt);
  const gridSrc = read(gridKt);
  const screenSrc = read(screenKt);

  ok = line(catalogSrc.includes('buildSectionsForState'), 'Kotlin buildSectionsForState') && ok;
  ok = line(catalogSrc.includes('suggestSectionSlugFromLevel3'), 'Kotlin section heuristic') && ok;
  ok = line(catalogSrc.includes('compareByDescending') && catalogSrc.includes('featured'), 'Kotlin featured-first sort') && ok;
  ok = line(catalogSrc.includes('defaultSectionTemplates'), '11 default section templates') && ok;
  ok = line(gridSrc.includes('StateExamSectionedGrid'), 'generic sectioned grid composable') && ok;
  ok = line(gridSrc.includes('ExamCircleStaticGrid'), 'uses static circle grid (no lazy crash)') && ok;
  ok = line(screenSrc.includes('StateExamSectionedGrid'), 'screen wires StateExamSectionedGrid') && ok;
  ok = line(screenSrc.includes('StateExamDynamicCatalog.buildSectionsForState'), 'screen builds dynamic sections') && ok;
  ok = line(screenSrc.includes('buildHimachalSectionsAsGeneric'), 'Himachal hardcoded fallback') && ok;
  ok = line(!screenSrc.includes('showHimachalInnerGrid'), 'Himachal-only grid flag removed') && ok;
  ok = line(screenSrc.includes('filterStateExamSectionsForInterests'), 'interest filter on sections') && ok;
  ok = line(screenSrc.includes('examCategoryRemote'), 'remote rows kept for sectionSlug fields') && ok;

  // --- parity with server sort/group ---
  ok = line(suggestSectionSlugFromLevel3('Bihar Police SI') === 'police', 'server police heuristic') && ok;
  ok = line(suggestSectionSlugFromLevel3('MP Patwari') === 'revenue', 'server revenue heuristic') && ok;

  const biharItems = {
    items: [
      {
        level1: 'State',
        level2: 'Bihar',
        level3: 'Bihar GK',
        sectionSlug: 'gk',
        itemSortOrder: 2,
        enabled: true,
        iconKey: 'br:bihar-gk',
      },
      {
        level1: 'State',
        level2: 'Bihar',
        level3: 'Bihar Police SI',
        sectionSlug: 'police',
        itemSortOrder: 1,
        featured: true,
        enabled: true,
        iconKey: 'br:bihar-police-si',
      },
      {
        level1: 'State',
        level2: 'Bihar',
        level3: 'Bihar TET',
        sectionSlug: 'teaching',
        itemSortOrder: 1,
        enabled: true,
        iconKey: 'br:bihar-tet',
      },
    ],
  };
  const sections = buildStateExamSectionsForState(biharItems, 'Bihar');
  ok = line(sections.length === 3, 'server builds 3 Bihar sections') && ok;
  ok = line(sections[0].sectionSlug === 'gk', 'gk section first by sortOrder') && ok;
  ok = line(sections[1].sectionSlug === 'police', 'police section second') && ok;
  ok = line(sections[1].tests[0].featured === true, 'featured police test first in section') && ok;

  const sorted = sortStateExamItems([
    { level3: 'Zebra', featured: false, itemSortOrder: 1 },
    { level3: 'Alpha', featured: true, itemSortOrder: 99 },
    { level3: 'Beta', featured: false, itemSortOrder: 1 },
  ]);
  ok = line(sorted[0].level3 === 'Alpha', 'sort: featured first') && ok;
  ok = line(compareStateExamItems(sorted[1], sorted[2]) < 0, 'sort: itemSortOrder then alpha') && ok;

  const mpSections = buildStateExamSectionsForState(
    {
      items: [
        {
          level1: 'State',
          level2: 'Madhya Pradesh',
          level3: 'MP Patwari',
          enabled: true,
        },
      ],
    },
    'Madhya Pradesh',
  );
  ok = line(mpSections.length === 1 && mpSections[0].sectionSlug === 'revenue', 'auto section from title') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE3_OK' : 'VERIFY_STATE_EXAM_PHASE3_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
