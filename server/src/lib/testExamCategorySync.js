'use strict';

/**
 * Phase 5 — auto-sync examCategories when admin creates/updates tests.
 */

const { resolveIndianStateSlug } = require('./indianStateVisualCatalog');
const {
  DEFAULT_STATE_EXAM_SECTION_TEMPLATES,
  buildWizardExamCategoryDraft,
  suggestSectionSlugFromLevel3,
} = require('./stateExamDynamicSpec');
const {
  normalizeExamCategoriesValue,
  validateExamCategoriesCollisions,
  normalizeStateExamSectionTemplates,
} = require('./examCategoriesAdmin');

function parseStateExamSyncPayload(body) {
  const raw = body?.stateExamSync;
  if (raw === undefined || raw === null) {
    return { mode: 'auto' };
  }
  if (raw === false || raw.enabled === false) {
    return { mode: 'off' };
  }
  const stateName = String(raw.stateName || raw.state || '').trim();
  if (!stateName) {
    if (raw.enabled === true) {
      return { error: 'stateExamSync.stateName is required when enabled is true' };
    }
    return { mode: 'auto' };
  }
  const sectionSlugRaw = raw.sectionSlug != null ? String(raw.sectionSlug).trim() : '';
  const itemSortOrderRaw = raw.itemSortOrder;
  return {
    mode: 'upsert',
    stateName,
    sectionSlug: sectionSlugRaw || undefined,
    featured: raw.featured === true,
    itemSortOrder:
      itemSortOrderRaw != null && Number.isFinite(Number(itemSortOrderRaw))
        ? Math.max(1, Math.min(9999, Math.trunc(Number(itemSortOrderRaw))))
        : undefined,
  };
}

function findCategoryIndexForTest(items, testId, stateName, level3) {
  const tid = String(testId || '').trim();
  const level3Lower = String(level3 || '').trim().toLowerCase();
  const stateKey = stateName ? resolveIndianStateSlug(stateName) : '';

  if (tid) {
    const byLink = items.findIndex((row) => String(row.linkedTestId || '') === tid);
    if (byLink >= 0) return byLink;
  }

  if (stateKey && level3Lower) {
    const byStateLevel3 = items.findIndex(
      (row) =>
        row.enabled !== false &&
        resolveIndianStateSlug(row.level2, row.iconKey) === stateKey &&
        String(row.level3 || '').trim().toLowerCase() === level3Lower,
    );
    if (byStateLevel3 >= 0) return byStateLevel3;
  }

  if (level3Lower) {
    return items.findIndex(
      (row) => row.enabled !== false && String(row.level3 || '').trim().toLowerCase() === level3Lower,
    );
  }

  return -1;
}

function mergeDraftIntoCategoryItems(existingItems, draftRow, sectionTemplates) {
  const items = Array.isArray(existingItems) ? [...existingItems] : [];
  const idx = findCategoryIndexForTest(
    items,
    draftRow.linkedTestId,
    draftRow.level2,
    draftRow.level3,
  );

  if (idx >= 0) {
    const prev = items[idx];
    const merged = {
      ...prev,
      ...draftRow,
      id: prev.id,
    };
    items[idx] = merged;
    return items;
  }

  return [
    {
      ...draftRow,
      id: draftRow.id || `exam-cat-sync-${Date.now()}`,
    },
    ...items,
  ];
}

/**
 * Build normalized examCategories value after test save.
 * @returns {{ ok: true, value: object, action: string } | { ok: false, status: number, error: string }}
 */
function buildExamCategoriesAfterTestSave({
  existingExamCategories,
  sectionTemplates,
  test,
  stateExamSync,
  previousSubcategory,
}) {
  const subcategory = String(test.subcategory || test.title || '').trim();
  if (!subcategory) {
    return { ok: true, skipped: true, reason: 'empty_subcategory' };
  }

  const sync = stateExamSync || { mode: 'auto' };
  if (sync.error) {
    return { ok: false, status: 400, error: sync.error };
  }

  const existingItems = Array.isArray(existingExamCategories?.items) ? existingExamCategories.items : [];
  const linkedIdx = existingItems.findIndex(
    (row) => String(row.linkedTestId || '') === String(test.id || ''),
  );
  const hasLinked = linkedIdx >= 0;
  const prevSub = String(previousSubcategory || '').trim();

  if (sync.mode === 'off' && !hasLinked) {
    return { ok: true, skipped: true, reason: 'sync_off' };
  }

  let shouldUpsert = sync.mode === 'upsert';
  let stateName = sync.mode === 'upsert' ? sync.stateName : '';
  let sectionSlug = sync.sectionSlug;
  let featured = sync.featured;
  let itemSortOrder = sync.itemSortOrder;

  if (!shouldUpsert && hasLinked) {
    shouldUpsert = true;
    const linked = existingItems[linkedIdx];
    stateName = linked.level2;
    sectionSlug = linked.sectionSlug;
    featured = linked.featured === true;
    itemSortOrder = linked.itemSortOrder;
  }

  if (!shouldUpsert && sync.mode === 'auto' && prevSub && prevSub.toLowerCase() !== subcategory.toLowerCase()) {
    const idx = findCategoryIndexForTest(existingItems, null, '', prevSub);
    if (idx >= 0) {
      shouldUpsert = true;
      stateName = existingItems[idx].level2;
      sectionSlug = existingItems[idx].sectionSlug;
      featured = existingItems[idx].featured === true;
      itemSortOrder = existingItems[idx].itemSortOrder;
    }
  }

  if (!shouldUpsert) {
    return { ok: true, skipped: true, reason: 'nothing_to_sync' };
  }

  if (!stateName) {
    return { ok: true, skipped: true, reason: 'no_state' };
  }

  const draftBuilt = buildWizardExamCategoryDraft({
    stateName,
    sectionSlug: sectionSlug || suggestSectionSlugFromLevel3(subcategory),
    testTitle: subcategory,
    testId: test.id,
    featured: featured === true,
    itemSortOrder: itemSortOrder != null ? itemSortOrder : hasLinked ? existingItems[linkedIdx].itemSortOrder : 999,
  });

  if (!draftBuilt.ok) {
    return { ok: false, status: 400, error: draftBuilt.error || 'Failed to build exam category draft' };
  }

  const mergedItems = mergeDraftIntoCategoryItems(existingItems, draftBuilt.row, sectionTemplates);
  const normalized = normalizeExamCategoriesValue(
    { items: mergedItems },
    { sectionTemplates, existingItems },
  );

  if (normalized.errors && normalized.errors.length > 0) {
    return {
      ok: false,
      status: 400,
      error: normalized.errors[0].error || 'Invalid exam category row after test sync',
    };
  }

  const collisionCheck = validateExamCategoriesCollisions(normalized.value.items);
  if (!collisionCheck.ok) {
    return collisionCheck;
  }

  const action = hasLinked || findCategoryIndexForTest(existingItems, test.id, stateName, subcategory) >= 0
    ? 'updated'
    : 'created';

  return {
    ok: true,
    value: normalized.value,
    action,
    level3: subcategory,
    stateName,
  };
}

async function loadSectionTemplatesFromDb(queryFn) {
  const { rows } = await queryFn(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'stateExamSectionTemplates' LIMIT 1`,
  );
  if (!rows[0]) {
    return normalizeStateExamSectionTemplates(null).value.items;
  }
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    return normalizeStateExamSectionTemplates(parsed).value.items;
  } catch (_e) {
    return DEFAULT_STATE_EXAM_SECTION_TEMPLATES;
  }
}

async function loadExamCategoriesFromDb(queryFn) {
  const { rows } = await queryFn(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'examCategories' LIMIT 1`,
  );
  if (!rows[0]) return { items: [] };
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    return parsed && typeof parsed === 'object' ? parsed : { items: [] };
  } catch (_e) {
    return { items: [] };
  }
}

async function saveExamCategoriesInDb(queryFn, userId, value) {
  await queryFn(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ('examCategories', $1, $2::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(value), userId],
  );
}

/**
 * Apply category sync after test create/update. Uses transaction client when provided.
 */
async function syncExamCategoryForTestSave({
  client,
  pool,
  userId,
  test,
  body,
  previousSubcategory,
}) {
  const queryFn = client
    ? (sql, params) => client.query(sql, params)
    : (sql, params) => pool.query(sql, params);

  const stateExamSync = parseStateExamSyncPayload(body || {});
  if (stateExamSync.error) {
    return { ok: false, status: 400, error: stateExamSync.error };
  }

  const sectionTemplates = await loadSectionTemplatesFromDb(queryFn);
  const existingExamCategories = await loadExamCategoriesFromDb(queryFn);

  const built = buildExamCategoriesAfterTestSave({
    existingExamCategories,
    sectionTemplates,
    test,
    stateExamSync,
    previousSubcategory,
  });

  if (!built.ok) {
    return built;
  }
  if (built.skipped) {
    return { ok: true, skipped: true, reason: built.reason };
  }

  await saveExamCategoriesInDb(queryFn, userId, built.value);

  return {
    ok: true,
    synced: true,
    action: built.action,
    level3: built.level3,
    stateName: built.stateName,
  };
}

module.exports = {
  parseStateExamSyncPayload,
  buildExamCategoriesAfterTestSave,
  syncExamCategoryForTestSave,
  findCategoryIndexForTest,
  mergeDraftIntoCategoryItems,
};
