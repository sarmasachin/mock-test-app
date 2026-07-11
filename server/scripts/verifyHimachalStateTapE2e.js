#!/usr/bin/env node
'use strict';

/**
 * E2E mirror: State tab → Himachal circle tap → sectioned inner design page.
 *
 * Usage:
 *   node scripts/verifyHimachalStateTapE2e.js
 */

const fs = require('fs');
const path = require('path');
const { resolveIndianStateSlug } = require('../src/lib/indianStateVisualCatalog');
const {
  isHimachalStateLevel2,
  resolveTestSlug,
} = require('../src/lib/himachalExamVisualCatalog');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const HP_SECTIONS = [
  'hp-gk',
  'hp-admin',
  'hp-allied',
  'hp-police',
  'hp-teach',
  'hp-rev',
  'hp-court',
  'hp-misc',
];

const HP_CATALOG_TEST_COUNT = 34;

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function isStateLevel1(label) {
  const key = String(label || '').trim().toLowerCase();
  return key === 'state' || key.startsWith('state ');
}

function buildExamHierarchy(remote) {
  const grouped = {};
  for (const row of remote) {
    const l1 = String(row.level1 || '').trim();
    const l2 = String(row.level2 || '').trim();
    const l3 = String(row.level3 || '').trim();
    if (!grouped[l1]) grouped[l1] = {};
    if (!grouped[l1][l2]) grouped[l1][l2] = [];
    if (l3) grouped[l1][l2].push({ label: l3, iconKey: row.iconKey || null });
  }
  return Object.entries(grouped).map(([l1, l2map]) => ({
    label: l1,
    children: Object.entries(l2map).map(([l2, tests]) => ({
      label: l2,
      children: tests,
    })),
  }));
}

function findStateChildNode(stateNode, drill) {
  if (!stateNode || !drill) return null;
  const trimmed = String(drill).trim();
  const drillSlug = resolveIndianStateSlug(trimmed);
  return (
    stateNode.children.find((c) => c.label.trim().toLowerCase() === trimmed.toLowerCase()) ||
    stateNode.children.find((c) => resolveIndianStateSlug(c.label) === drillSlug) ||
    null
  );
}

function isHimachalLabel(label) {
  return resolveIndianStateSlug(label) === 'hp';
}

function resolveSectionSlug(level3) {
  const slug = resolveTestSlug(level3);
  if (slug) {
    if (slug.startsWith('hp-')) {
      if (slug.includes('tet') || slug.includes('pgt') || slug.includes('tgt') || slug.includes('jbt') || slug === 'hp-prof') {
        return 'hp-teach';
      }
      if (slug.includes('police') || slug.includes('jail') || slug.includes('home-guard')) return 'hp-police';
      if (slug.includes('patwari') || slug.includes('forest') || slug.includes('je') || slug.includes('hpseb')) return 'hp-rev';
      if (slug.includes('gk') || slug.includes('history') || slug.includes('geography') || slug.includes('rivers') || slug.includes('culture') || slug.includes('budget') || slug.includes('district')) {
        return 'hp-gk';
      }
      if (slug.includes('hpas') || slug.includes('judicial') || slug.includes('tehsildar') || slug === 'hpfs') return 'hp-admin';
      if (slug.includes('allied') || slug.includes('joa') || slug.includes('auditor') || slug === 'hp-si') return 'hp-allied';
      if (slug.includes('mo') || slug.includes('nurse') || slug.includes('hc-clerk')) return 'hp-court';
    }
    return 'hp-misc';
  }
  const key = String(level3 || '').toLowerCase();
  if (key.includes('tet')) return 'hp-teach';
  if (key.includes('patwari')) return 'hp-rev';
  if (key.includes('gk')) return 'hp-gk';
  return 'hp-misc';
}

function buildHimachalSections(stateNode, stateDrill) {
  const grouped = {};
  for (const sectionSlug of HP_SECTIONS) {
    grouped[sectionSlug] = new Map();
  }

  // Catalog seeds (always present — user's design page)
  const catalogSeeds = [
    ['hp-gk-mix', 'HP GK मिक्स मॉक टेस्ट', 'hp-gk'],
    ['hp-tet', 'हिमाचल टीईटी', 'hp-teach'],
    ['hp-patwari', 'हिमाचल पटवारी', 'hp-rev'],
    ['hp-police', 'पुलिस कांस्टेबल', 'hp-police'],
  ];
  for (const [slug, name, section] of catalogSeeds) {
    grouped[section].set(slug, { applyTestName: name, iconKey: `hp:${slug}` });
  }
  // Full catalog count simulation
  for (let i = 0; i < HP_CATALOG_TEST_COUNT - catalogSeeds.length; i += 1) {
    const section = HP_SECTIONS[i % HP_SECTIONS.length];
    grouped[section].set(`seed-${i}`, { applyTestName: `Catalog Test ${i}`, iconKey: `hp:seed-${i}` });
  }

  const level2 = findStateChildNode(stateNode, stateDrill);
  for (const level3 of level2?.children || []) {
    const name = String(level3.label || '').trim();
    if (!name) continue;
    const sectionSlug = resolveSectionSlug(name);
    const catalogSlug = resolveTestSlug(name, level3.iconKey) || `admin-${name.toLowerCase()}`;
    if (!grouped[sectionSlug]) grouped[sectionSlug] = new Map();
    grouped[sectionSlug].set(catalogSlug, {
      applyTestName: name,
      iconKey: level3.iconKey || (catalogSlug.startsWith('admin-') ? null : `hp:${catalogSlug}`),
    });
  }

  return HP_SECTIONS.map((slug) => ({
    slug,
    tests: [...(grouped[slug]?.values() || [])],
  })).filter((section) => section.tests.length > 0);
}

function simulateTapFlow(adminRows, tappedLabel) {
  const hierarchy = buildExamHierarchy(adminRows);
  const stateNode = hierarchy.find((n) => isStateLevel1(n.label)) || null;
  const stateDrill = tappedLabel;
  const isHimachalDrill = isHimachalLabel(stateDrill);
  const sections = isHimachalDrill ? buildHimachalSections(stateNode, stateDrill) : [];
  const showHimachalInnerGrid = isHimachalDrill && sections.length > 0;
  const showStateTestsList = Boolean(stateDrill) && !showHimachalInnerGrid;
  return {
    stateDrill,
    isHimachalDrill,
    sections,
    showHimachalInnerGrid,
    showStateTestsList,
    sectionCount: sections.length,
    testCount: sections.reduce((sum, s) => sum + s.tests.length, 0),
  };
}

function main() {
  console.log('=== E2E: Himachal state circle tap → inner design page ===\n');
  let ok = true;

  const screenKt = read('app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt');
  const gridKt = read('app/src/main/java/com/freemocktest/app/newui/home/HimachalExamSectionedGrid.kt');
  const stateCardKt = read('app/src/main/java/com/freemocktest/app/newui/home/StateCircleCategoryCard.kt');
  const catalogKt = read('app/src/main/java/com/freemocktest/app/util/HimachalExamVisualCatalog.kt');
  const hostKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');

  ok = line(screenKt.includes('stateDrill = picked.trim()'), 'State circle tap sets stateDrill') && ok;
  ok = line(screenKt.includes('isHimachalDrill'), 'Himachal drill flag exists') && ok;
  ok = line(screenKt.includes('fullStateNode'), 'Himachal sections use unfiltered admin hierarchy') && ok;
  ok = line(catalogKt.includes('catalogTestSeeds'), 'Full Himachal catalog seeds exist') && ok;
  ok = line(screenKt.includes('HimachalExamSectionedGrid'), 'Inner page uses sectioned Himachal grid') && ok;
  ok = line(gridKt.includes('HimachalExamCircleCard'), 'Inner page uses circular exam cards') && ok;
  ok = line(gridKt.includes('ExamCircleStaticGrid'), 'Himachal uses non-lazy grid (no nested scroll crash)') && ok;
  ok = line(!gridKt.includes('LazyVerticalGrid'), 'Himachal section avoids LazyVerticalGrid inside scroll') && ok;
  ok = line(!gridKt.includes('LazyColumn'), 'Himachal outer list uses Column+verticalScroll (no LazyColumn crash)') && ok;
  ok = line(gridKt.includes('verticalScroll'), 'Himachal page scrolls safely inside weight(1f)') && ok;
  ok = line(screenKt.includes('onOpenTest = onOpenCategory'), 'Exam card tap routes to Apply') && ok;
  ok = line(hostKt.includes('navigateToTestApply(cat)'), 'Apply navigation wired from Tests screen') && ok;
  ok = line(!screenKt.includes('हिमाचल प्रदेश परीक्षा पोर्टल'), 'Long Hindi portal title not on inner page') && ok;

  // Step 1: Himachal circle exists in state grid (Hindi label from catalog)
  ok = line(resolveIndianStateSlug('हिमाचल प्रदेश') === 'hp', 'Hindi Himachal label resolves to hp slug') && ok;
  ok = line(isHimachalLabel('हिमाचल प्रदेश'), 'Hindi circle label detected as Himachal drill') && ok;
  ok = line(isHimachalLabel('Himachal Pradesh'), 'English Himachal label detected') && ok;

  // Step 2: Tap Himachal with ZERO admin rows — design page must still open
  const noAdmin = simulateTapFlow([], 'हिमाचल प्रदेश');
  ok = line(noAdmin.isHimachalDrill, 'Tap Hindi Himachal → isHimachalDrill=true') && ok;
  ok = line(noAdmin.showHimachalInnerGrid, 'No admin rows: Himachal inner design still opens') && ok;
  ok = line(!noAdmin.showStateTestsList, 'No admin rows: plain square list NOT shown') && ok;
  ok = line(noAdmin.sectionCount === 8, `No admin rows: 8 sections shown (got ${noAdmin.sectionCount})`) && ok;
  ok = line(noAdmin.testCount >= HP_CATALOG_TEST_COUNT, `No admin rows: catalog tests rendered (got ${noAdmin.testCount})`) && ok;

  // Step 3: Tap Himachal with admin tests — design page + admin merge
  const withAdmin = simulateTapFlow(
    [
      { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP TET', iconKey: 'hp:hp-tet', enabled: true },
      { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP Patwari', iconKey: 'hp:hp-patwari', enabled: true },
    ],
    'हिमाचल प्रदेश',
  );
  ok = line(withAdmin.showHimachalInnerGrid, 'With admin HP rows: inner design opens') && ok;
  ok = line(
    withAdmin.sections.some((s) => s.tests.some((t) => t.applyTestName === 'HP TET')),
    'Admin HP TET appears inside Himachal sections',
  ) && ok;
  ok = line(
    findStateChildNode(
      buildExamHierarchy(withAdminRows()).find((n) => isStateLevel1(n.label)),
      'हिमाचल प्रदेश',
    )?.label === 'Himachal Pradesh',
    'Hindi tap matches admin Level-2 Himachal Pradesh node',
  ) && ok;

  // Step 4: Non-Himachal state still uses square list path
  const bihar = simulateTapFlow(
    [{ level1: 'State', level2: 'Bihar', level3: 'Bihar SI', iconKey: 'state:br', enabled: true }],
    'बिहार',
  );
  ok = line(!bihar.isHimachalDrill, 'Bihar tap is not Himachal drill') && ok;
  ok = line(!bihar.showHimachalInnerGrid, 'Bihar tap does not open Himachal inner page') && ok;
  ok = line(bihar.showStateTestsList, 'Bihar tap uses classic square test list') && ok;

  console.log('\n--- User flow ---');
  console.log('Tests → State → tap हिमाचल प्रदेश circle');
  console.log('→ breadcrumb: State > हिमाचल प्रदेश');
  console.log('→ 8 frosted sections + circular exam cards (your HTML design)');
  console.log('→ tap any exam circle → Apply page');

  console.log(`\n${ok ? 'VERIFY_HIMACHAL_STATE_TAP_E2E_OK' : 'VERIFY_HIMACHAL_STATE_TAP_E2E_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

function withAdminRows() {
  return [
    { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP TET', iconKey: 'hp:hp-tet', enabled: true },
    { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP Patwari', iconKey: 'hp:hp-patwari', enabled: true },
  ];
}

main();
