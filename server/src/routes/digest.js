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

async function loadDailyQuizSettings() {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'dailyQuizSettings' LIMIT 1`,
    );
    const raw = rows[0]?.setting_value;
    const parsed = raw ? JSON.parse(String(raw || '{}')) : {};
    return {
      releaseHour: Math.max(0, Math.min(23, Number(parsed.releaseHour ?? 10))),
      releaseMinute: Math.max(0, Math.min(59, Number(parsed.releaseMinute ?? 0))),
      timezoneOffsetMinutes: Math.max(-720, Math.min(840, Number(parsed.timezoneOffsetMinutes ?? 330))),
    };
  } catch (_e) {
    return { releaseHour: 10, releaseMinute: 0, timezoneOffsetMinutes: 330 };
  }
}

function resolveDailyKey(nowMs, schedule) {
  const offsetMs = Number(schedule.timezoneOffsetMinutes || 0) * 60 * 1000;
  const localNow = new Date(nowMs + offsetMs);
  const releaseAnchor = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    Number(schedule.releaseHour || 0),
    Number(schedule.releaseMinute || 0),
    0,
    0,
  ));
  let effective = localNow;
  if (localNow.getTime() < releaseAnchor.getTime()) {
    effective = new Date(localNow.getTime() - 24 * 60 * 60 * 1000);
  }
  const y = effective.getUTCFullYear();
  const m = String(effective.getUTCMonth() + 1).padStart(2, '0');
  const d = String(effective.getUTCDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
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
    const dayKey = resolveDailyKey(Date.now(), schedule);
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
