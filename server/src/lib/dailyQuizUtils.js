'use strict';

const { pool } = require('../db');
const { clampMcqCorrectIndex } = require('../mcqShuffle');

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
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Seeded Fisher-Yates in place. */
function fisherYatesSeeded(list, seedPrefix) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const r = seededRandom(`${seedPrefix}-${i}`);
    const j = Math.floor(r * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function isIdentityOrder(list, keyFn, baselineKeys) {
  if (list.length !== baselineKeys.length) return false;
  for (let i = 0; i < list.length; i += 1) {
    if (keyFn(list[i]) !== baselineKeys[i]) return false;
  }
  return true;
}

/**
 * When Fisher-Yates returns admin order, force one seeded swap so delivery always differs
 * (when length >= 2). Keeps determinism for the same seedPrefix.
 */
function ensureVisibleShuffle(list, seedPrefix, keyFn, baselineKeys) {
  if (list.length < 2) return list;
  if (!isIdentityOrder(list, keyFn, baselineKeys)) return list;
  const j = 1 + Math.floor(seededRandom(`${seedPrefix}-identity-fix`) * (list.length - 1));
  const tmp = list[0];
  list[0] = list[j];
  list[j] = tmp;
  return list;
}

function shuffleQuizOptions(item, dayKey) {
  const orig = clampMcqCorrectIndex(item.correctIndex);
  const options = [
    { text: item.optionA, originalIndex: 0 },
    { text: item.optionB, originalIndex: 1 },
    { text: item.optionC, originalIndex: 2 },
    { text: item.optionD, originalIndex: 3 },
  ];
  const baselineKeys = options.map((x) => x.originalIndex);
  const list = [...options];
  const seedPrefix = `daily-quiz-opt-${item.id}-${dayKey}`;
  fisherYatesSeeded(list, seedPrefix);
  ensureVisibleShuffle(list, seedPrefix, (x) => x.originalIndex, baselineKeys);
  const correctIndex = list.findIndex((x) => x.originalIndex === orig);
  if (correctIndex < 0) {
    return {
      options: [item.optionA, item.optionB, item.optionC, item.optionD].map((x) => String(x || '')),
      correctIndex: orig,
    };
  }
  return {
    options: list.map((x) => x.text),
    correctIndex,
  };
}

/** All published admin questions for one calendar day (order shuffled per day, options shuffled per item). */
function buildDailyQuizItemsForDay(items, dayKey) {
  const published = items.filter((x) => x && x.isPublished !== false);
  if (!published.length) return [];
  const baselineKeys = published.map((x) => String(x.id || ''));
  const list = [...published];
  const seedPrefix = `daily-quiz-order-${dayKey}`;
  fisherYatesSeeded(list, seedPrefix);
  ensureVisibleShuffle(list, seedPrefix, (x) => String(x.id || ''), baselineKeys);
  return list.map((item) => {
    const shuffled = shuffleQuizOptions(item, dayKey);
    return {
      id: String(item.id || ''),
      questionPrompt: String(item.questionPrompt || ''),
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: String(item.explanation || ''),
    };
  });
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
  return {
    dayKey: Number(`${y}${m}${d}`),
    quizDay: `${y}-${m}-${d}`,
  };
}

async function loadPublishedDailyQuizItems() {
  const settings = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'dailyQuizItems' LIMIT 1`,
  );
  const raw = settings.rows[0]?.setting_value;
  const parsed = raw ? JSON.parse(String(raw || '{}')) : {};
  return Array.isArray(parsed.items) ? parsed.items : [];
}

function parseQuizDayInput(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

module.exports = {
  hashString,
  seededRandom,
  fisherYatesSeeded,
  isIdentityOrder,
  ensureVisibleShuffle,
  shuffleQuizOptions,
  buildDailyQuizItemsForDay,
  loadDailyQuizSettings,
  resolveDailyKey,
  loadPublishedDailyQuizItems,
  parseQuizDayInput,
};
