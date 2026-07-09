'use strict';

const express = require('express');
const { pool } = require('../db');
const { clampMcqCorrectIndex } = require('../mcqShuffle');
const {
  seededRandom,
  shuffleQuizOptions,
  selectDailyQuizItemsForDay,
  filterEligibleDailyQuizItems,
  DAILY_QUIZ_SCOPE_ALL_INDIA,
  loadDailyQuizSettings,
  resolveDailyKey,
  loadPublishedDailyQuizItems,
} = require('../lib/dailyQuizUtils');

const router = express.Router();

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
  const orig = clampMcqCorrectIndex(item.correct_index);
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
  const correctIndex = list.findIndex((x) => x.originalIndex === orig);
  if (correctIndex < 0) {
    return {
      options: [item.option_a, item.option_b, item.option_c, item.option_d].map((x) => String(x || '')),
      correctIndex: orig,
    };
  }
  return {
    options: list.map((x) => x.text),
    correctIndex,
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
    const schedule = await loadDailyQuizSettings();
    const { dayKey } = resolveDailyKey(Date.now(), schedule);
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

router.get('/quiz-today', async (_req, res) => {
  try {
    const items = await loadPublishedDailyQuizItems();
    if (!items.length) {
      return res.status(404).json({ error: 'No daily quiz content available' });
    }
    const schedule = await loadDailyQuizSettings();
    const { dayKey, quizDay } = resolveDailyKey(Date.now(), schedule);
    const allIndiaPool = filterEligibleDailyQuizItems(items, { scope: DAILY_QUIZ_SCOPE_ALL_INDIA });
    const quizItems = selectDailyQuizItemsForDay(allIndiaPool, dayKey, quizDay, schedule);
    if (!quizItems.length) {
      return res.status(404).json({ error: 'No daily quiz content available' });
    }
    return res.json({
      quizDay,
      questionCount: quizItems.length,
      items: quizItems,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz' });
  }
});

module.exports = router;
