'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/content', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT setting_key, setting_value
       FROM app_settings
       WHERE setting_key IN ('homeContent', 'submitApplicationContent', 'instructionContent', 'profileMenuItems', 'examCategories')`,
    );
    if (!rows.length) {
      return res.json({ content: null, submitApplicationContent: null, instructionContent: null, profileMenuItems: [], examCategories: { items: [] } });
    }
    const map = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    let parsedHome = null;
    let parsedSubmit = null;
    let parsedInstruction = null;
    let parsedProfileMenuItems = [];
    let parsedExamCategories = { items: [] };
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
    return res.json({
      content: parsedHome,
      submitApplicationContent: parsedSubmit,
      instructionContent: parsedInstruction,
      profileMenuItems: parsedProfileMenuItems,
      examCategories: parsedExamCategories,
    });
  } catch (e) {
    if (e && e.code === '42P01') {
      return res.json({ content: null, submitApplicationContent: null, instructionContent: null, profileMenuItems: [], examCategories: { items: [] } });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load home content' });
  }
});

module.exports = router;
