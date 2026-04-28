'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function sanitizeHomeContent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
  const quickSectionsRaw = Array.isArray(raw.quickActionSections) ? raw.quickActionSections : [];
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
    ...raw,
    sections,
    quickActionSections,
    newsCategoryMenu: (Array.isArray(raw.newsCategoryMenu) ? raw.newsCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    jobCategoryMenu: (Array.isArray(raw.jobCategoryMenu) ? raw.jobCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    examCategoryMenu: (Array.isArray(raw.examCategoryMenu) ? raw.examCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  };
}

router.get('/content', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT setting_key, setting_value
       FROM app_settings
       WHERE setting_key IN ('homeContent', 'submitApplicationContent', 'instructionContent', 'profileMenuItems', 'examCategories', 'pollSettings', 'pushNotificationSettings')`,
    );
    if (!rows.length) {
      return res.json({
        content: null,
        submitApplicationContent: null,
        instructionContent: null,
        profileMenuItems: [],
        examCategories: { items: [] },
        pollSettings: { items: [] },
        pushNotificationSettings: { items: [] },
      });
    }
    const map = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    let parsedHome = null;
    let parsedSubmit = null;
    let parsedInstruction = null;
    let parsedProfileMenuItems = [];
    let parsedExamCategories = { items: [] };
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
      const parsed = JSON.parse(String(map.examCategories || '{}'));
      parsedExamCategories = parsed && typeof parsed === 'object' ? parsed : { items: [] };
    } catch (_e) {
      parsedExamCategories = { items: [] };
    }
    try {
      const parsed = JSON.parse(String(map.pollSettings || '{}'));
      parsedPollSettings = parsed && typeof parsed === 'object' ? parsed : { items: [] };
    } catch (_e) {
      parsedPollSettings = { items: [] };
    }
    try {
      const parsed = JSON.parse(String(map.pushNotificationSettings || '{}'));
      parsedPushNotificationSettings = parsed && typeof parsed === 'object' ? parsed : { items: [] };
    } catch (_e) {
      parsedPushNotificationSettings = { items: [] };
    }
    return res.json({
      content: sanitizeHomeContent(parsedHome),
      submitApplicationContent: parsedSubmit,
      instructionContent: parsedInstruction,
      profileMenuItems: parsedProfileMenuItems,
      examCategories: parsedExamCategories,
      pollSettings: parsedPollSettings,
      pushNotificationSettings: parsedPushNotificationSettings,
    });
  } catch (e) {
    if (e && e.code === '42P01') {
      return res.json({
        content: null,
        submitApplicationContent: null,
        instructionContent: null,
        profileMenuItems: [],
        examCategories: { items: [] },
        pollSettings: { items: [] },
        pushNotificationSettings: { items: [] },
      });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load home content' });
  }
});

module.exports = router;
