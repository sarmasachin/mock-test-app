'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/today', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, question_prompt, option_a, option_b, option_c, option_d, correct_index, fact_text
       FROM daily_digest_items
       WHERE is_published = true
       ORDER BY created_at ASC`,
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No daily digest content available' });
    }
    const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
    const item = rows[dayOfYear % rows.length];
    return res.json({
      item: {
        id: item.id,
        questionPrompt: item.question_prompt,
        options: [item.option_a, item.option_b, item.option_c, item.option_d],
        correctIndex: item.correct_index,
        factText: item.fact_text,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily digest' });
  }
});

module.exports = router;
