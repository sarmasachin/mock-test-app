'use strict';

const express = require('express');
const { pool } = require('../db');
const { sanitizeHomeContentForPublicApi } = require('../lib/homeContentPublicSanitize');
const { buildExamCategoriesSettingsForApi, parseJsonObject } = require('../lib/examCategoriesAdmin');

const router = express.Router();

function normalizePollDurationMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1440;
  return Math.max(1, Math.min(10080, Math.floor(n)));
}

function isPollActiveNow(item, nowMs) {
  const createdAtRaw = String((item || {}).createdAt || '').trim();
  const createdAtMs = Date.parse(createdAtRaw);
  if (!Number.isFinite(createdAtMs)) return true;
  const durationMinutes = normalizePollDurationMinutes((item || {}).durationMinutes);
  const expiresAtMs = createdAtMs + durationMinutes * 60 * 1000;
  return nowMs < expiresAtMs;
}

function sanitizePollSettings(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const itemsRaw = Array.isArray(safe.items) ? safe.items : [];
  const nowMs = Date.now();
  const items = itemsRaw
    .map((item, idx) => {
      const x = item || {};
      const options = (Array.isArray(x.options) ? x.options : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 8);
      return {
        id: String(x.id || `poll-${idx + 1}`).trim(),
        question: String(x.question || '').trim(),
        options,
        allowMultiple: Boolean(x.allowMultiple),
        durationMinutes: normalizePollDurationMinutes(x.durationMinutes),
        enabled: x.enabled !== false,
        createdAt: String(x.createdAt || '').trim() || new Date().toISOString(),
      };
    })
    .filter((x) => x.id && x.question && x.options.length >= 2 && x.enabled && isPollActiveNow(x, nowMs));
  return {
    showHomePopup: safe.showHomePopup !== false,
    items,
  };
}

router.get('/content', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT setting_key, setting_value
       FROM app_settings
       WHERE setting_key IN ('homeContent', 'submitApplicationContent', 'instructionContent', 'profileMenuItems', 'examCategories', 'stateExamSectionTemplates', 'signupRegions', 'pollSettings', 'pushNotificationSettings', 'achievementContent', 'shareContent', 'dailyDigestShareContent', 'dailyQuizShareContent')`,
    );
    if (!rows.length) {
      return res.json({
        content: null,
        submitApplicationContent: null,
        instructionContent: null,
        profileMenuItems: [],
        examCategories: { items: [] },
        signupRegions: { items: [] },
        pollSettings: { items: [] },
        pushNotificationSettings: { items: [] },
        achievementContent: null,
        shareContent: null,
        dailyDigestShareContent: null,
        dailyQuizShareContent: null,
      });
    }
    const map = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    let parsedHome = null;
    let parsedSubmit = null;
    let parsedInstruction = null;
    let parsedProfileMenuItems = [];
    let parsedExamCategories = { items: [] };
    let parsedSignupRegions = { items: [] };
    let parsedPollSettings = { items: [] };
    let parsedPushNotificationSettings = { items: [] };
    try {
      parsedHome = JSON.parse(String(map.homeContent || '{}'));
    } catch (_e) {
      parsedHome = null;
    }
    try {
      parsedSubmit = JSON.parse(String(map.submitApplicationContent || '{}'));
    } catch (_e) {
      parsedSubmit = null;
    }
    try {
      parsedInstruction = JSON.parse(String(map.instructionContent || '{}'));
    } catch (_e) {
      parsedInstruction = null;
    }
    try {
      const parsed = JSON.parse(String(map.profileMenuItems || '[]'));
      parsedProfileMenuItems = Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      parsedProfileMenuItems = [];
    }
    try {
      const rawTemplates = map.stateExamSectionTemplates
        ? parseJsonObject(map.stateExamSectionTemplates, null)
        : null;
      const rawExam = parseJsonObject(map.examCategories, { items: [] });
      const built = buildExamCategoriesSettingsForApi(rawExam, rawTemplates);
      parsedExamCategories = built.examCategories;
    } catch (_e) {
      parsedExamCategories = { items: [] };
    }
    try {
      const parsed = JSON.parse(String(map.signupRegions || '{}'));
      parsedSignupRegions = parsed && typeof parsed === 'object' ? parsed : { items: [] };
    } catch (_e) {
      parsedSignupRegions = { items: [] };
    }
    try {
      const parsed = JSON.parse(String(map.pollSettings || '{}'));
      parsedPollSettings = sanitizePollSettings(parsed);
    } catch (_e) {
      parsedPollSettings = { showHomePopup: true, items: [] };
    }
    try {
      const parsed = JSON.parse(String(map.pushNotificationSettings || '{}'));
      parsedPushNotificationSettings = parsed && typeof parsed === 'object' ? parsed : { items: [] };
    } catch (_e) {
      parsedPushNotificationSettings = { items: [] };
    }
    /** Admin-managed Achievement intro copy (same shape as admin normalizeSimpleContent). Public read-only. */
    let parsedAchievementContent = null;
    try {
      const raw = JSON.parse(String(map.achievementContent || '{}'));
      if (raw && typeof raw === 'object') {
        const title = String(raw.title || 'Achievement').trim().slice(0, 120);
        const body = String(raw.body || '').trim().slice(0, 10000);
        if (body) {
          parsedAchievementContent = { title, body };
        }
      }
    } catch (_e) {
      parsedAchievementContent = null;
    }
    /** Admin-managed app share text (same shape as admin normalizeSimpleContent). Public read-only. */
    let parsedShareContent = null;
    try {
      const raw = JSON.parse(String(map.shareContent || '{}'));
      if (raw && typeof raw === 'object') {
        const title = String(raw.title || 'Share').trim().slice(0, 120);
        const body = String(raw.body || '').trim().slice(0, 10000);
        if (body) {
          parsedShareContent = { title, body };
        }
      }
    } catch (_e) {
      parsedShareContent = null;
    }
    let parsedDailyDigestShare = null;
    try {
      const raw = JSON.parse(String(map.dailyDigestShareContent || '{}'));
      if (raw && typeof raw === 'object') {
        const title = String(raw.title || 'Daily Digest Share').trim().slice(0, 120);
        const body = String(raw.body || '').trim().slice(0, 10000);
        if (body) {
          parsedDailyDigestShare = { title, body };
        }
      }
    } catch (_e) {
      parsedDailyDigestShare = null;
    }
    let parsedDailyQuizShare = null;
    try {
      const raw = JSON.parse(String(map.dailyQuizShareContent || '{}'));
      if (raw && typeof raw === 'object') {
        const title = String(raw.title || 'Daily Quiz Share').trim().slice(0, 120);
        const body = String(raw.body || '').trim().slice(0, 10000);
        if (body) {
          parsedDailyQuizShare = { title, body };
        }
      }
    } catch (_e) {
      parsedDailyQuizShare = null;
    }
    return res.json({
      content: sanitizeHomeContentForPublicApi(parsedHome),
      submitApplicationContent: parsedSubmit,
      instructionContent: parsedInstruction,
      profileMenuItems: parsedProfileMenuItems,
      examCategories: parsedExamCategories,
      signupRegions: parsedSignupRegions,
      pollSettings: parsedPollSettings,
      pushNotificationSettings: parsedPushNotificationSettings,
      achievementContent: parsedAchievementContent,
      shareContent: parsedShareContent,
      dailyDigestShareContent: parsedDailyDigestShare,
      dailyQuizShareContent: parsedDailyQuizShare,
    });
  } catch (e) {
    if (e && e.code === '42P01') {
      return res.json({
        content: null,
        submitApplicationContent: null,
        instructionContent: null,
        profileMenuItems: [],
        examCategories: { items: [] },
        signupRegions: { items: [] },
        pollSettings: { items: [] },
        pushNotificationSettings: { items: [] },
        achievementContent: null,
        shareContent: null,
        dailyDigestShareContent: null,
        dailyQuizShareContent: null,
      });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load home content' });
  }
});

module.exports = router;
