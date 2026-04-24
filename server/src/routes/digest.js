'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function hashString(input) {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seedText) {
  const seed = hashString(seedText);
  // mulberry32
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickDailyDigestItem(rows, dayKey) {
  if (!rows.length) return null;
  const sortedNewestFirst = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const recentCount = Math.max(1, Math.min(20, Math.ceil(sortedNewestFirst.length * 0.35)));
  const recentPool = sortedNewestFirst.slice(0, recentCount);
  const oldPool = sortedNewestFirst.slice(recentCount);

  const preferRecent = dayKey % 2 === 0;
  const chosenPool = preferRecent
    ? (recentPool.length ? recentPool : oldPool)
    : (oldPool.length ? oldPool : recentPool);
  const r = seededRandom(`digest-item-${dayKey}-${chosenPool.length}`);
  const idx = Math.floor(r * chosenPool.length) % chosenPool.length;
  return chosenPool[idx];
}

function shuffleOptionsAndRemap(item, dayKey) {
  const options = [
    { text: item.option_a, originalIndex: 0 },
    { text: item.option_b, originalIndex: 1 },
    { text: item.option_c, originalIndex: 2 },
    { text: item.option_d, originalIndex: 3 },
  ];
  const list = [...options];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const r = seededRandom(`digest-opt-${item.id}-${dayKey}-${i}`);
    const j = Math.floor(r * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  const correctIndex = list.findIndex((x) => x.originalIndex === Number(item.correct_index));
  return {
    options: list.map((x) => x.text),
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

router.get('/today', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, question_prompt, option_a, option_b, option_c, option_d, correct_index, fact_text, created_at
       FROM daily_digest_items
       WHERE is_published = true
       ORDER BY created_at DESC`,
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No daily digest content available' });
    }
    const now = new Date();
    const dayOfYear = Math.floor((Date.now() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
    const dayKey = Number(`${now.getUTCFullYear()}${String(dayOfYear).padStart(3, '0')}`);
    const item = pickDailyDigestItem(rows, dayKey);
    if (!item) {
      return res.status(404).json({ error: 'No daily digest content available' });
    }
    const shuffled = shuffleOptionsAndRemap(item, dayKey);
    return res.json({
      item: {
        id: item.id,
        questionPrompt: item.question_prompt,
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        factText: item.fact_text,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily digest' });
  }
});

module.exports = router;
