'use strict';

/**
 * Phase 0 — Dynamic state exam catalog spec (pure library, no DB/API side effects).
 *
 * Single source of truth for:
 * - Extended examCategories row schema (sectionSlug, sort, featured, linkedTestId)
 * - Default state section templates
 * - Icon key factory (<stateSlug>:<testSlug>)
 * - Sort + group helpers for sectioned state UI (all states, Himachal-style)
 *
 * Phases 1+ wire this into admin.js, admin-web wizard, and Android StateSectionedGrid.
 * Phase 0 does NOT change runtime behaviour.
 */

const { resolveIndianStateSlug, isStateExamLevel1 } = require('./indianStateVisualCatalog');

/** Max lengths — must match future admin.js normalize slices. */
const MAX_LEVEL_LEN = 80;
const MAX_SECTION_SLUG_LEN = 48;
const MAX_SECTION_TITLE_LEN = 120;
const MAX_ICON_KEY_LEN = 800;
const MAX_LINKED_TEST_ID_LEN = 60;
const MAX_ITEM_SORT_ORDER = 9999;
const MAX_SECTION_SORT_ORDER = 999;

/** Default section templates (admin can extend via stateExamSectionTemplates setting in Phase 1). */
const DEFAULT_STATE_EXAM_SECTION_TEMPLATES = [
  { slug: 'gk', titleHi: 'सामान्य ज्ञान', titleEn: 'General Knowledge', sortOrder: 10 },
  { slug: 'admin', titleHi: 'प्रशासनिक सेवाएँ', titleEn: 'Administrative Services', sortOrder: 20 },
  { slug: 'police', titleHi: 'पुलिस भर्ती', titleEn: 'Police Recruitment', sortOrder: 30 },
  { slug: 'teaching', titleHi: 'शिक्षक भर्ती', titleEn: 'Teaching Recruitment', sortOrder: 40 },
  { slug: 'revenue', titleHi: 'राजस्व / पटवारी', titleEn: 'Revenue / Patwari', sortOrder: 50 },
  { slug: 'medical', titleHi: 'स्वास्थ्य / मेडिकल', titleEn: 'Health / Medical', sortOrder: 60 },
  { slug: 'technical', titleHi: 'तकनीकी / इंजीनियरिंग', titleEn: 'Technical / Engineering', sortOrder: 70 },
  { slug: 'judiciary', titleHi: 'न्यायिक सेवा', titleEn: 'Judiciary', sortOrder: 80 },
  { slug: 'forest', titleHi: 'वन / पर्यावरण', titleEn: 'Forest / Environment', sortOrder: 90 },
  { slug: 'transport', titleHi: 'परिवहन', titleEn: 'Transport', sortOrder: 95 },
  { slug: 'other', titleHi: 'अन्य परीक्षाएँ', titleEn: 'Other Exams', sortOrder: 99 },
];

const DEFAULT_SECTION_BY_SLUG = Object.fromEntries(
  DEFAULT_STATE_EXAM_SECTION_TEMPLATES.map((t) => [t.slug, t]),
);

const RESERVED_ICON_PREFIXES = ['hp', 'allindia', 'state'];

function normalizeSlugPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function normalizeSectionSlug(value) {
  const slug = normalizeSlugPart(value);
  if (!slug) return 'other';
  return slug.slice(0, MAX_SECTION_SLUG_LEN);
}

function clampSortOrder(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.trunc(n)));
}

function parseBoolean(value, fallback = false) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function resolveStateSlugFromLevel2(level2, iconKey = '') {
  return resolveIndianStateSlug(String(level2 || '').trim(), String(iconKey || '').trim());
}

/**
 * Build collision-safe iconKey for a state Level-3 exam row.
 * Format: <stateSlug>:<testSlug>  e.g. br:police-constable, mp:patwari
 *
 * Legacy hp: / allindia: keys are preserved when already set (Himachal / All India migration).
 */
function buildStateExamIconKey(level1, level2, level3, existingIconKey = '') {
  const existing = String(existingIconKey || '').trim();
  if (existing.startsWith('http://') || existing.startsWith('https://')) {
    return existing.slice(0, MAX_ICON_KEY_LEN);
  }
  if (existing.startsWith('hp:') || existing.startsWith('allindia:')) {
    return existing.slice(0, MAX_ICON_KEY_LEN);
  }
  if (existing.includes(':') && !existing.startsWith('state:')) {
    return existing.slice(0, MAX_ICON_KEY_LEN);
  }

  const stateSlug = resolveStateSlugFromLevel2(level2);
  const testSlug = normalizeSlugPart(level3);
  if (!stateSlug || !testSlug) {
    return existing.slice(0, MAX_ICON_KEY_LEN);
  }
  return `${stateSlug}:${testSlug}`.slice(0, MAX_ICON_KEY_LEN);
}

function resolveSectionTitle(sectionSlug, explicitTitle, templates = DEFAULT_STATE_EXAM_SECTION_TEMPLATES) {
  const trimmed = String(explicitTitle || '').trim();
  if (trimmed) return trimmed.slice(0, MAX_SECTION_TITLE_LEN);
  const tpl = templates.find((t) => t.slug === sectionSlug) || DEFAULT_SECTION_BY_SLUG.other;
  return (tpl.titleHi || tpl.titleEn || 'Other Exams').slice(0, MAX_SECTION_TITLE_LEN);
}

function resolveSectionSortOrder(sectionSlug, explicitOrder, templates = DEFAULT_STATE_EXAM_SECTION_TEMPLATES) {
  if (explicitOrder !== undefined && explicitOrder !== null && String(explicitOrder).trim() !== '') {
    return clampSortOrder(explicitOrder, 99, MAX_SECTION_SORT_ORDER);
  }
  const tpl = templates.find((t) => t.slug === sectionSlug) || DEFAULT_SECTION_BY_SLUG.other;
  return clampSortOrder(tpl.sortOrder, 99, MAX_SECTION_SORT_ORDER);
}

/**
 * Optional heuristic for admin wizard (Phase 2) — NOT used for Himachal hardcoded catalog.
 */
function suggestSectionSlugFromLevel3(level3) {
  const key = String(level3 || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ');

  if (!key) return 'other';
  if (key.includes('gk') || key.includes('general knowledge') || key.includes('history') || key.includes('geography')) {
    return 'gk';
  }
  if (key.includes('police') || key.includes('constable') || key.includes('si ') || key.endsWith(' si')) {
    return 'police';
  }
  if (
    key.includes('tet') ||
    key.includes('tgt') ||
    key.includes('pgt') ||
    key.includes('teacher') ||
    key.includes('lecturer') ||
    key.includes('jbt') ||
    key.includes('ntt')
  ) {
    return 'teaching';
  }
  if (key.includes('patwari') || key.includes('revenue') || key.includes('tehsildar') || key.includes('naib')) {
    return 'revenue';
  }
  if (key.includes('medical') || key.includes('nurse') || key.includes('anm') || key.includes('mo ')) {
    return 'medical';
  }
  if (key.includes('je ') || key.includes('junior engineer') || key.includes('lineman') || key.includes('technical')) {
    return 'technical';
  }
  if (key.includes('judicial') || key.includes('court') || key.includes('judge')) {
    return 'judiciary';
  }
  if (key.includes('forest') || key.includes('acf') || key.includes('guard')) {
    return 'forest';
  }
  if (key.includes('conductor') || key.includes('transport') || key.includes('hrtc')) {
    return 'transport';
  }
  if (key.includes('hpas') || key.includes('sdm') || key.includes('dsp') || key.includes('administrative')) {
    return 'admin';
  }
  return 'other';
}

/**
 * Normalize one examCategories row (legacy + extended fields).
 * Unknown fields are ignored. Missing extended fields get safe defaults.
 */
function normalizeStateExamCategoryRow(raw, index = 0, options = {}) {
  const templates = options.sectionTemplates || DEFAULT_STATE_EXAM_SECTION_TEMPLATES;
  const x = raw || {};
  const level1 = String(x.level1 || '').trim().slice(0, MAX_LEVEL_LEN);
  const level2 = String(x.level2 || '').trim().slice(0, MAX_LEVEL_LEN);
  const level3 = String(x.level3 || '').trim().slice(0, MAX_LEVEL_LEN);

  if (!level1 || !level2 || !level3) {
    return { ok: false, error: 'Each exam category row needs Level 1, Level 2, and Level 3.' };
  }

  const sectionSlugExplicit = String(x.sectionSlug || x.section_slug || '').trim();
  const sectionSlug = sectionSlugExplicit
    ? normalizeSectionSlug(sectionSlugExplicit)
    : normalizeSectionSlug(suggestSectionSlugFromLevel3(level3));

  const sectionTitle = resolveSectionTitle(
    sectionSlug,
    x.sectionTitle || x.section_title || '',
    templates,
  );
  const sectionSortOrder = resolveSectionSortOrder(sectionSlug, x.sectionSortOrder ?? x.section_sort_order, templates);
  const itemSortOrder = clampSortOrder(x.itemSortOrder ?? x.item_sort_order, 999, MAX_ITEM_SORT_ORDER);
  const featured = parseBoolean(x.featured, false);
  const linkedTestId = String(x.linkedTestId || x.linked_test_id || '').trim().slice(0, MAX_LINKED_TEST_ID_LEN);

  const iconKey = buildStateExamIconKey(level1, level2, level3, x.iconKey || x.icon_key || '');

  return {
    ok: true,
    row: {
      id: String(x.id || `exam-cat-${index + 1}`).trim().slice(0, 60),
      level1,
      level2,
      level3,
      iconKey,
      enabled: x.enabled !== false,
      sectionSlug,
      sectionTitle,
      sectionSortOrder,
      itemSortOrder,
      featured,
      linkedTestId: linkedTestId || null,
    },
  };
}

function migrateLegacyExamCategoryRow(legacyRow, index = 0) {
  return normalizeStateExamCategoryRow(legacyRow, index);
}

/**
 * Sort items for display inside one section.
 * Order: featured DESC → itemSortOrder ASC → level3 ASC (case-insensitive).
 */
function compareStateExamItems(a, b) {
  const featA = a.featured ? 1 : 0;
  const featB = b.featured ? 1 : 0;
  if (featA !== featB) return featB - featA;
  if (a.itemSortOrder !== b.itemSortOrder) return a.itemSortOrder - b.itemSortOrder;
  return String(a.level3 || '').localeCompare(String(b.level3 || ''), 'en', { sensitivity: 'base' });
}

function sortStateExamItems(items) {
  return [...items].sort(compareStateExamItems);
}

/**
 * Group enabled rows for one state (level2) into ordered sections.
 */
function buildStateExamSectionsForState(examCategories, stateLevel2, options = {}) {
  const templates = options.sectionTemplates || DEFAULT_STATE_EXAM_SECTION_TEMPLATES;
  const stateKey = resolveStateSlugFromLevel2(stateLevel2);
  const items = (examCategories?.items || [])
    .map((row, index) => normalizeStateExamCategoryRow(row, index, { sectionTemplates: templates }))
    .filter((r) => r.ok)
    .map((r) => r.row)
    .filter((row) => row.enabled && isStateExamLevel1(row.level1))
    .filter((row) => resolveStateSlugFromLevel2(row.level2, row.iconKey) === stateKey);

  const grouped = new Map();
  for (const row of items) {
    if (!grouped.has(row.sectionSlug)) grouped.set(row.sectionSlug, []);
    grouped.get(row.sectionSlug).push(row);
  }

  const sections = [...grouped.entries()].map(([slug, rows]) => {
    const sortedRows = sortStateExamItems(rows);
    const first = sortedRows[0];
    return {
      sectionSlug: slug,
      sectionTitle: first.sectionTitle,
      sectionSortOrder: first.sectionSortOrder,
      tests: sortedRows.map((r) => ({
        applyTestName: r.level3,
        iconKey: r.iconKey,
        featured: r.featured,
        itemSortOrder: r.itemSortOrder,
        linkedTestId: r.linkedTestId,
      })),
    };
  });

  sections.sort((a, b) => {
    if (a.sectionSortOrder !== b.sectionSortOrder) return a.sectionSortOrder - b.sectionSortOrder;
    return a.sectionTitle.localeCompare(b.sectionTitle, 'en', { sensitivity: 'base' });
  });

  return sections;
}

function validateStateExamCategoryRow(row) {
  const errors = [];
  if (!row.level1 || !row.level2 || !row.level3) {
    errors.push('level1, level2, level3 required');
  }
  if (!isStateExamLevel1(row.level1) && String(row.level1 || '').trim()) {
    errors.push('level1 must be a State exam level (e.g. "State") for state section UI');
  }
  if (!resolveStateSlugFromLevel2(row.level2)) {
    errors.push(`unknown state Level 2: "${row.level2}"`);
  }
  if (!DEFAULT_SECTION_BY_SLUG[row.sectionSlug] && row.sectionSlug !== 'other') {
    // Custom sections allowed in Phase 1+; warn only in strict mode
  }
  if (row.itemSortOrder < 0 || row.itemSortOrder > MAX_ITEM_SORT_ORDER) {
    errors.push('itemSortOrder out of range');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Detect duplicate icon keys or duplicate level3 within same state.
 */
function findStateExamCatalogCollisions(rows) {
  const normalized = rows
    .map((row, index) => normalizeStateExamCategoryRow(row, index))
    .filter((r) => r.ok)
    .map((r) => r.row)
    .filter((r) => r.enabled);

  const iconKeyMap = new Map();
  const level3Map = new Map();
  const collisions = [];

  for (const row of normalized) {
    const stateSlug = resolveStateSlugFromLevel2(row.level2, row.iconKey);
    const l3Key = `${stateSlug}::${row.level3.trim().toLowerCase()}`;
    const iconKey = String(row.iconKey || '').trim().toLowerCase();

    if (iconKey) {
      const prev = iconKeyMap.get(iconKey);
      if (prev) {
        collisions.push({
          type: 'duplicate_icon_key',
          iconKey: row.iconKey,
          a: prev.level3,
          b: row.level3,
          state: row.level2,
        });
      } else {
        iconKeyMap.set(iconKey, row);
      }
    }

    const prevL3 = level3Map.get(l3Key);
    if (prevL3) {
      collisions.push({
        type: 'duplicate_level3',
        state: row.level2,
        level3: row.level3,
        aId: prevL3.id,
        bId: row.id,
      });
    } else {
      level3Map.set(l3Key, row);
    }
  }

  return collisions;
}

/**
 * Audit: exam category level3 vs test subcategory (+ optional linkedTestId).
 */
function auditStateExamTestAlignment(examCategories, tests, options = {}) {
  const templates = options.sectionTemplates || DEFAULT_STATE_EXAM_SECTION_TEMPLATES;
  const rows = (examCategories?.items || [])
    .map((row, index) => normalizeStateExamCategoryRow(row, index, { sectionTemplates: templates }))
    .filter((r) => r.ok)
    .map((r) => r.row)
    .filter((r) => r.enabled && isStateExamLevel1(r.level1));

  const enabledLevel3 = rows.map((r) => r.level3);
  const enabledLevel3Lower = new Set(enabledLevel3.map((x) => x.toLowerCase()));

  const testsWithoutSubcategory = [];
  const testsNotInCategories = [];
  const categoriesWithoutTests = [];
  const linkedTestMismatches = [];

  for (const t of tests || []) {
    const sub = String(t.subcategory || '').trim();
    const title = String(t.title || '').trim();
    if (!sub) {
      testsWithoutSubcategory.push({ title, subcategory: sub });
      continue;
    }
    if (!enabledLevel3Lower.has(sub.toLowerCase())) {
      testsNotInCategories.push({ title, subcategory: sub });
    }
  }

  const testById = new Map((tests || []).filter((t) => t.id).map((t) => [String(t.id), t]));
  const testSubLower = new Set(
    (tests || []).map((t) => String(t.subcategory || '').trim().toLowerCase()).filter(Boolean),
  );

  for (const row of rows) {
    const hasTest = testSubLower.has(row.level3.toLowerCase());
    if (!hasTest && !row.linkedTestId) {
      categoriesWithoutTests.push(row.level3);
    }
    if (row.linkedTestId) {
      const linked = testById.get(row.linkedTestId);
      if (!linked) {
        linkedTestMismatches.push({ level3: row.level3, linkedTestId: row.linkedTestId, reason: 'test_not_found' });
      } else if (String(linked.subcategory || '').trim().toLowerCase() !== row.level3.toLowerCase()) {
        linkedTestMismatches.push({
          level3: row.level3,
          linkedTestId: row.linkedTestId,
          reason: 'subcategory_mismatch',
          testSubcategory: linked.subcategory,
        });
      }
    }
  }

  const ok =
    testsWithoutSubcategory.length === 0 &&
    testsNotInCategories.length === 0 &&
    categoriesWithoutTests.length === 0 &&
    linkedTestMismatches.length === 0;

  return {
    ok,
    enabledCategoryCount: rows.length,
    testCount: (tests || []).length,
    testsWithoutSubcategory,
    testsNotInCategories,
    categoriesWithoutTests,
    linkedTestMismatches,
  };
}

/**
 * Build a wizard draft row (Phase 2) from admin selections.
 */
function buildWizardExamCategoryDraft({ stateName, sectionSlug, testTitle, testId, featured = false, itemSortOrder = 1 }) {
  const level3 = String(testTitle || '').trim();
  const level2 = String(stateName || '').trim();
  if (!level2 || !level3) {
    return { ok: false, error: 'stateName and testTitle are required' };
  }
  const slug = normalizeSectionSlug(sectionSlug || suggestSectionSlugFromLevel3(level3));
  return normalizeStateExamCategoryRow(
    {
      id: `exam-cat-wizard-${Date.now()}`,
      level1: 'State',
      level2,
      level3,
      sectionSlug: slug,
      itemSortOrder,
      featured: parseBoolean(featured, false),
      linkedTestId: testId || null,
      enabled: true,
    },
    0,
  );
}

/**
 * Phase 4 — featured state exams for home carousel boost (signup state).
 */
function buildFeaturedStateExamsForHome(examCategories, stateLevel2, options = {}) {
  const maxItems = Math.max(1, Math.min(12, Number(options.maxItems) || 4));
  const excludeApplied = new Set(
    (options.excludeApplied || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean),
  );
  const stateKey = resolveStateSlugFromLevel2(stateLevel2);
  if (!stateKey) return [];

  const items = (examCategories?.items || [])
    .map((row, index) => normalizeStateExamCategoryRow(row, index))
    .filter((r) => r.ok)
    .map((r) => r.row)
    .filter((row) => row.enabled && row.featured && isStateExamLevel1(row.level1))
    .filter((row) => resolveStateSlugFromLevel2(row.level2, row.iconKey) === stateKey)
    .filter((row) => !excludeApplied.has(row.level3.trim().toLowerCase()));

  return sortStateExamItems(items)
    .slice(0, maxItems)
    .map((row) => ({
      level3: row.level3,
      itemSortOrder: row.itemSortOrder,
      sectionSlug: row.sectionSlug,
      iconKey: row.iconKey,
    }));
}

module.exports = {
  MAX_LEVEL_LEN,
  MAX_SECTION_SLUG_LEN,
  MAX_SECTION_TITLE_LEN,
  MAX_ICON_KEY_LEN,
  MAX_ITEM_SORT_ORDER,
  DEFAULT_STATE_EXAM_SECTION_TEMPLATES,
  RESERVED_ICON_PREFIXES,
  normalizeSlugPart,
  normalizeSectionSlug,
  buildStateExamIconKey,
  suggestSectionSlugFromLevel3,
  normalizeStateExamCategoryRow,
  migrateLegacyExamCategoryRow,
  compareStateExamItems,
  sortStateExamItems,
  buildStateExamSectionsForState,
  validateStateExamCategoryRow,
  findStateExamCatalogCollisions,
  auditStateExamTestAlignment,
  buildWizardExamCategoryDraft,
  buildFeaturedStateExamsForHome,
  resolveSectionTitle,
  resolveSectionSortOrder,
};
