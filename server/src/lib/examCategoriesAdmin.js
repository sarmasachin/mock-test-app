'use strict';

/**
 * Phase 1 — Admin + public API normalization for dynamic state exam categories.
 * Uses stateExamDynamicSpec.js (Phase 0) for schema, sort, and collision rules.
 */

const { resolveExamCategoryIconKey } = require('./allIndiaExamVisualCatalog');
const {
  DEFAULT_STATE_EXAM_SECTION_TEMPLATES,
  normalizeStateExamCategoryRow,
  findStateExamCatalogCollisions,
  buildStateExamIconKey,
} = require('./stateExamDynamicSpec');

function parseJsonObject(raw, fallback = {}) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_e) {
    return fallback;
  }
}

function resolveFinalExamCategoryIconKey(level1, level2, level3, iconKey = '') {
  const existing = String(iconKey || '').trim();
  if (existing.startsWith('http://') || existing.startsWith('https://')) {
    return existing.slice(0, 800);
  }
  if (existing.startsWith('hp:') || existing.startsWith('allindia:')) {
    return existing.slice(0, 800);
  }

  const built = buildStateExamIconKey(level1, level2, level3, '');
  const legacy = resolveExamCategoryIconKey(level1, level2, level3, existing);
  if (legacy.startsWith('http://') || legacy.startsWith('https://')) {
    return legacy.slice(0, 800);
  }

  // Prefer unique per-title keys (fixes HP TGT Math/Hindi alias collision on hp:hp-tgt).
  if (built && built.includes(':') && !built.startsWith('state:')) {
    return built.slice(0, 800);
  }

  if (legacy.startsWith('hp:') || legacy.startsWith('allindia:')) {
    return legacy.slice(0, 800);
  }

  return String(legacy || existing || built).slice(0, 800);
}

function normalizeStateExamSectionTemplates(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  if (rawItems.length === 0) {
    return {
      value: {
        items: DEFAULT_STATE_EXAM_SECTION_TEMPLATES.map((t) => ({ ...t })),
      },
    };
  }

  const seen = new Set();
  const items = [];
  for (const item of rawItems) {
    const x = item || {};
    const slug = String(x.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const sortRaw = x.sortOrder ?? x.sort_order;
    const sortOrder = Number.isFinite(Number(sortRaw))
      ? Math.min(999, Math.max(0, Math.trunc(Number(sortRaw))))
      : 99;
    items.push({
      slug,
      titleHi: String(x.titleHi || x.title_hi || '').trim().slice(0, 120),
      titleEn: String(x.titleEn || x.title_en || slug).trim().slice(0, 120),
      sortOrder,
    });
  }

  if (items.length === 0) {
    return {
      value: {
        items: DEFAULT_STATE_EXAM_SECTION_TEMPLATES.map((t) => ({ ...t })),
      },
    };
  }

  items.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
  return { value: { items } };
}

function mergeExamCategoryRow(incoming, existing) {
  const inc = incoming || {};
  const prev = existing || {};
  const merged = { ...prev, ...inc };

  const prevLevel3 = String(prev.level3 || '').trim();
  const incomingLevel3 =
    inc.level3 !== undefined ? String(inc.level3 || '').trim() : prevLevel3;
  const level3Changed =
    Boolean(incomingLevel3 && prevLevel3) &&
    incomingLevel3.toLowerCase() !== prevLevel3.toLowerCase();
  const hasExplicitSection =
    inc.sectionSlug !== undefined ||
    inc.section_slug !== undefined ||
    inc.sectionTitle !== undefined ||
    inc.section_title !== undefined;

  if (level3Changed && !hasExplicitSection) {
    delete merged.sectionSlug;
    delete merged.section_slug;
    delete merged.sectionTitle;
    delete merged.section_title;
  }

  return merged;
}

/**
 * Normalize examCategories payload for save or public API output.
 */
function normalizeExamCategoriesValue(value, options = {}) {
  const sectionTemplates = options.sectionTemplates || DEFAULT_STATE_EXAM_SECTION_TEMPLATES;
  const existingItems = Array.isArray(options.existingItems) ? options.existingItems : [];
  const existingById = new Map(
    existingItems.map((row) => [String((row || {}).id || '').trim(), row || {}]),
  );

  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const errors = [];
  const items = [];

  for (let index = 0; index < rawItems.length; index += 1) {
    const incoming = rawItems[index] || {};
    const id = String(incoming.id || `exam-cat-${index + 1}`).trim();
    const prev = existingById.get(id);
    const merged = mergeExamCategoryRow(incoming, prev);

    const level1 = String(merged.level1 || '').trim();
    const level2 = String(merged.level2 || '').trim();
    const level3 = String(merged.level3 || '').trim();
    const iconKey = resolveFinalExamCategoryIconKey(
      level1,
      level2,
      level3,
      merged.iconKey || merged.icon_key || '',
    );

    const normalized = normalizeStateExamCategoryRow(
      {
        ...merged,
        id,
        level1,
        level2,
        level3,
        iconKey,
        enabled: merged.enabled !== false,
      },
      index,
      { sectionTemplates },
    );

    if (!normalized.ok) {
      errors.push({ index, id, error: normalized.error });
      continue;
    }
    items.push(normalized.row);
  }

  return {
    value: { items },
    rawCount: rawItems.length,
    errors,
  };
}

function validateExamCategoriesCollisions(items) {
  const collisions = findStateExamCatalogCollisions(items || []);
  if (collisions.length === 0) {
    return { ok: true, collisions: [] };
  }

  const first = collisions[0];
  let error = 'Exam category collision detected.';
  if (first.type === 'duplicate_icon_key') {
    error =
      `Duplicate iconKey "${first.iconKey}" for "${first.a}" and "${first.b}" in ${first.state}. ` +
      'Each exam needs a unique title per state.';
  } else if (first.type === 'duplicate_level3') {
    error =
      `Duplicate Level 3 "${first.level3}" in ${first.state}. ` +
      'Each exam name must be unique per state.';
  }

  return { ok: false, status: 409, error, collisions };
}

function buildExamCategoriesSettingsForApi(rawExamCategories, rawSectionTemplates) {
  const templatesResult = normalizeStateExamSectionTemplates(
    rawSectionTemplates === undefined || rawSectionTemplates === null
      ? null
      : rawSectionTemplates,
  );
  const sectionTemplates = templatesResult.value.items;
  const rawParsed =
    rawExamCategories && typeof rawExamCategories === 'object'
      ? rawExamCategories
      : parseJsonObject(rawExamCategories, { items: [] });
  const existingItems = Array.isArray(rawParsed.items) ? rawParsed.items : [];
  const normalized = normalizeExamCategoriesValue(
    { items: existingItems },
    { sectionTemplates, existingItems },
  );

  return {
    stateExamSectionTemplates: templatesResult.value,
    examCategories: normalized.value,
    normalizeErrors: normalized.errors,
  };
}

module.exports = {
  parseJsonObject,
  resolveFinalExamCategoryIconKey,
  normalizeStateExamSectionTemplates,
  mergeExamCategoryRow,
  normalizeExamCategoriesValue,
  validateExamCategoriesCollisions,
  buildExamCategoriesSettingsForApi,
};
