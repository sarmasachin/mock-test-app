'use strict';

/**
 * Public GET /home/content sanitization (Phase 0–2 schedule timer).
 * Single source of truth — used by home route, E2E, and offline verify scripts.
 */

const LEGACY_TIMER_KEYS = ['startSeriesLockSeconds', 'startSeriesActiveWindowMinutes'];

function normalizeScheduleTimerEnabled(raw) {
  return raw?.startSeriesScheduleTimerEnabled === true;
}

function hasLegacyTimerFields(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return LEGACY_TIMER_KEYS.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function sanitizeHomeContentForPublicApi(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const {
    startSeriesLockSeconds: _legacyLockSeconds,
    startSeriesActiveWindowMinutes: _legacyActiveWindowMinutes,
    ...rest
  } = raw;
  const sectionsRaw = Array.isArray(rest.sections) ? rest.sections : [];
  const quickSectionsRaw = Array.isArray(rest.quickActionSections) ? rest.quickActionSections : [];
  const sections = sectionsRaw
    .map((section, idx) => {
      const s = section || {};
      const title = String(s.title || '').trim();
      const items = (Array.isArray(s.items) ? s.items : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 12);
      return {
        id: String(s.id || `section-${idx + 1}`).trim(),
        title,
        items,
      };
    })
    .filter((s) => s.title && s.items.length > 0);
  const quickActionSections = quickSectionsRaw
    .map((section, idx) => {
      const s = section || {};
      const title = String(s.title || '').trim();
      const items = (Array.isArray(s.items) ? s.items : [])
        .map((item) => ({
          title: String((item || {}).title || '').trim(),
          actionKey: String((item || {}).actionKey || '').trim(),
          iconKey: String((item || {}).iconKey || '').trim(),
        }))
        .filter((x) => x.title && x.actionKey);
      return {
        id: String(s.id || `qa-section-${idx + 1}`).trim(),
        title,
        items,
      };
    })
    .filter((s) => s.title && s.items.length > 0);
  return {
    ...rest,
    startSeriesScheduleTimerEnabled: normalizeScheduleTimerEnabled(rest),
    sections,
    quickActionSections,
    newsCategoryMenu: (Array.isArray(rest.newsCategoryMenu) ? rest.newsCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    jobCategoryMenu: (Array.isArray(rest.jobCategoryMenu) ? rest.jobCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    examCategoryMenu: (Array.isArray(rest.examCategoryMenu) ? rest.examCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  };
}

/** Compare timer-relevant fields between API payload and expected sanitize of DB raw. */
function scheduleTimerFieldsMatchApi(dbRaw, apiContent) {
  const expected = sanitizeHomeContentForPublicApi(dbRaw);
  if (!expected && !apiContent) return true;
  if (!expected || !apiContent) return false;
  const apiEnabled = apiContent.startSeriesScheduleTimerEnabled === true;
  const expectedEnabled = expected.startSeriesScheduleTimerEnabled === true;
  return apiEnabled === expectedEnabled;
}

module.exports = {
  LEGACY_TIMER_KEYS,
  normalizeScheduleTimerEnabled,
  hasLegacyTimerFields,
  sanitizeHomeContentForPublicApi,
  scheduleTimerFieldsMatchApi,
};
