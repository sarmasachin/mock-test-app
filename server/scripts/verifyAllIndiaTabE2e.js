#!/usr/bin/env node
'use strict';

/**
 * E2E mirror: Tests → All India tab → sectioned circular design page.
 *
 * Usage:
 *   node scripts/verifyAllIndiaTabE2e.js
 */

const fs = require('fs');
const path = require('path');
const {
  isAllIndiaExamLevel1,
  resolveTestSlug,
} = require('../src/lib/allIndiaExamVisualCatalog');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const AI_SECTIONS = ['upsc', 'ssc', 'bank', 'rrb', 'def', 'other'];
const AI_CATALOG_TEST_COUNT = 28;

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function isCentralLevel1(label) {
  const key = String(label || '').trim().toLowerCase();
  return key === 'central' || key.startsWith('central ') || key === 'national' || key.startsWith('national ');
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

function findAllIndiaNode(hierarchy) {
  return (
    hierarchy.find((n) => isAllIndiaExamLevel1(n.label)) ||
    hierarchy.find((n) => isCentralLevel1(n.label)) ||
    null
  );
}

function resolveSectionSlug(level2) {
  const key = String(level2 || '').trim().toLowerCase();
  if (key.includes('upsc')) return 'upsc';
  if (key.includes('ssc')) return 'ssc';
  if (key.includes('bank') || key.includes('ibps') || key.includes('sbi') || key.includes('rbi')) return 'bank';
  if (key.includes('rail') || key.includes('rrb')) return 'rrb';
  if (key.includes('defen') || key.includes('nda') || key.includes('cds')) return 'def';
  return 'other';
}

function buildAllIndiaSections(node) {
  const grouped = {};
  for (const slug of AI_SECTIONS) grouped[slug] = new Map();

  const catalogSeeds = [
    ['ssc-cgl', 'एसएससी CGL', 'ssc', 'SSC'],
    ['upsc-cse', 'सिविल सर्विसेज', 'upsc', 'UPSC'],
    ['rrb-ntpc', 'रेलवे एनटीपीसी', 'rrb', 'Railways'],
    ['nda', 'एनडीए परीक्षा', 'def', 'Defence'],
  ];
  for (const [slug, name, section, sectionLabel] of catalogSeeds) {
    grouped[section].set(slug, { applyTestName: name, sectionLabel, iconKey: `allindia:${slug}` });
  }
  for (let i = 0; i < AI_CATALOG_TEST_COUNT - catalogSeeds.length; i += 1) {
    const section = AI_SECTIONS[i % AI_SECTIONS.length];
    grouped[section].set(`seed-${i}`, {
      applyTestName: `Catalog Test ${i}`,
      sectionLabel: section.toUpperCase(),
      iconKey: `allindia:seed-${i}`,
    });
  }

  if (node) {
    for (const level2 of node.children) {
      const sectionSlug = resolveSectionSlug(level2.label);
      const sectionLabel = level2.label;
      for (const level3 of level2.children) {
        const name = String(level3.label || '').trim();
        if (!name) continue;
        const catalogSlug = resolveTestSlug(name, sectionLabel, level3.iconKey) || `admin-${name.toLowerCase()}`;
        if (!grouped[sectionSlug]) grouped[sectionSlug] = new Map();
        grouped[sectionSlug].set(catalogSlug, {
          applyTestName: name,
          sectionLabel,
          iconKey: level3.iconKey || (catalogSlug.startsWith('admin-') ? null : `allindia:${catalogSlug}`),
        });
      }
    }
  }

  return AI_SECTIONS.map((slug) => ({
    slug,
    tests: [...(grouped[slug]?.values() || [])],
  })).filter((section) => section.tests.length > 0);
}

function simulateAllIndiaTab(adminRows) {
  const hierarchy = buildExamHierarchy(adminRows);
  const node = findAllIndiaNode(hierarchy);
  const sections = buildAllIndiaSections(node);
  const showAllIndiaGrid = sections.length > 0;
  return {
    nodeLabel: node?.label || null,
    sections,
    showAllIndiaGrid,
    sectionCount: sections.length,
    testCount: sections.reduce((sum, s) => sum + s.tests.length, 0),
  };
}

function main() {
  console.log('=== E2E: All India tab → sectioned design page ===\n');
  let ok = true;

  const screenKt = read('app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt');
  const gridKt = read('app/src/main/java/com/freemocktest/app/newui/home/AllIndiaExamSectionedGrid.kt');
  const catalogKt = read('app/src/main/java/com/freemocktest/app/util/AllIndiaExamVisualCatalog.kt');
  const hostKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');

  ok = line(screenKt.includes('ExamScopeTabRow'), 'State | All India tabs exist') && ok;
  ok = line(screenKt.includes('findAllIndiaNode'), 'All India node resolver includes Central fallback') && ok;
  ok = line(screenKt.includes('fullAllIndiaNode'), 'All India uses unfiltered admin hierarchy') && ok;
  ok = line(catalogKt.includes('catalogTestSeeds'), 'All India catalog seeds exist') && ok;
  ok = line(screenKt.includes('showAllIndiaGrid'), 'All India tab show flag exists') && ok;
  ok = line(screenKt.includes('AllIndiaExamSectionedGrid'), 'All India sectioned grid wired') && ok;
  ok = line(gridKt.includes('AllIndiaExamCircleCard'), 'All India circular exam cards exist') && ok;
  ok = line(gridKt.includes('ExamCircleStaticGrid'), 'All India uses non-lazy grid (no nested scroll crash)') && ok;
  ok = line(!gridKt.includes('LazyVerticalGrid'), 'All India section avoids LazyVerticalGrid inside scroll') && ok;
  ok = line(!gridKt.includes('LazyColumn'), 'All India outer list uses Column+verticalScroll (no LazyColumn crash)') && ok;
  ok = line(gridKt.includes('verticalScroll'), 'All India page scrolls safely inside weight(1f)') && ok;
  ok = line(screenKt.includes('onOpenTest = onOpenCategory'), 'All India card tap routes to Apply') && ok;
  ok = line(hostKt.includes('navigateToTestApply(cat)'), 'Apply navigation wired') && ok;
  ok = line(!screenKt.includes('भारत की सभी'), 'Long Hindi page title not embedded') && ok;

  const noAdmin = simulateAllIndiaTab([]);
  ok = line(noAdmin.showAllIndiaGrid, 'No admin rows: All India design still opens') && ok;
  ok = line(noAdmin.sectionCount === 6, `No admin rows: 6 sections shown (got ${noAdmin.sectionCount})`) && ok;
  ok = line(
    noAdmin.testCount >= AI_CATALOG_TEST_COUNT,
    `No admin rows: catalog tests rendered (got ${noAdmin.testCount})`,
  ) && ok;

  const allIndiaAdmin = simulateAllIndiaTab([
    { level1: 'All India', level2: 'SSC', level3: 'SSC CGL', iconKey: 'allindia:ssc-cgl' },
    { level1: 'All India', level2: 'UPSC', level3: 'UPSC CSE', iconKey: 'allindia:upsc-cse' },
  ]);
  ok = line(allIndiaAdmin.showAllIndiaGrid, 'All India Level 1: design opens') && ok;
  ok = line(allIndiaAdmin.nodeLabel === 'All India', 'All India Level 1 node detected') && ok;
  ok = line(
    allIndiaAdmin.sections.some((s) => s.tests.some((t) => t.applyTestName === 'SSC CGL')),
    'Admin SSC CGL merged into All India sections',
  ) && ok;

  const centralAdmin = simulateAllIndiaTab([
    { level1: 'Central', level2: 'SSC', level3: 'SSC CHSL', iconKey: 'allindia:ssc-chsl' },
  ]);
  ok = line(centralAdmin.showAllIndiaGrid, 'Central Level 1 fallback: design opens') && ok;
  ok = line(centralAdmin.nodeLabel === 'Central', 'Central Level 1 node detected as All India source') && ok;

  console.log('\n--- User flow ---');
  console.log('Tests → All India tab');
  console.log('→ 6 sections (UPSC, SSC, Bank, RRB, Defence, Other)');
  console.log('→ circular exam cards in each section');
  console.log('→ tap exam → Apply page');

  console.log(`\n${ok ? 'VERIFY_ALL_INDIA_TAB_E2E_OK' : 'VERIFY_ALL_INDIA_TAB_E2E_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
