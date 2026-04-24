'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function resolveExamDate(row) {
  const base = row.exam_date ? new Date(row.exam_date) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  if (!row.dynamic_date_enabled) return toIsoDate(base);
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (!cycleDays) return toIsoDate(base);
  const today = new Date();
  const diffMs = today.setHours(0, 0, 0, 0) - new Date(base).setHours(0, 0, 0, 0);
  if (diffMs <= 0) return toIsoDate(base);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const jump = Math.ceil(diffDays / cycleDays) * cycleDays;
  const shifted = new Date(base);
  shifted.setDate(shifted.getDate() + jump);
  return toIsoDate(shifted);
}

function mapTest(row) {
  const capacityTotal = Math.max(0, Number(row.capacity_total || 0));
  const enrolledCount = Math.max(0, Number(row.enrolled_count || 0));
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subcategory: row.subcategory,
    metaLine: row.meta_line,
    durationMinutes: row.duration_minutes,
    questionCount: row.question_count,
    testKind: row.test_kind,
    examDate: resolveExamDate(row),
    totalMarks: Number(row.total_marks || 0),
    slotLabel: String(row.slot_label || ''),
    capacityTotal,
    enrolledCount,
    remainingSeats: Math.max(0, capacityTotal - enrolledCount),
    attemptsAllowed: Number(row.attempts_allowed || 1),
    languageMode: String(row.language_mode || 'Bilingual'),
    examMode: String(row.exam_mode || 'Practice'),
    negativeMarkingText: String(row.negative_marking_text || 'No'),
    testTypeLabel: String(row.test_type_label || ''),
    validUntil: row.valid_until ? toIsoDate(new Date(row.valid_until)) : null,
    answerKeyReleaseAt: row.answer_key_release_at ? new Date(row.answer_key_release_at).toISOString() : null,
    resultReleaseAt: row.result_release_at ? new Date(row.result_release_at).toISOString() : null,
    dynamicDateEnabled: row.dynamic_date_enabled === true,
    dateCycleDays: Number(row.date_cycle_days || 0),
  };
}

router.get('/', async (req, res) => {
  const sub = String(req.query.subcategory || '').trim();
  const kind = String(req.query.testKind || '').trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '40'), 10) || 40, 1), 100);
  try {
    let q;
    let params;
    if (sub && kind && ['mock', 'quiz'].includes(kind)) {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind,
                  exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
                  language_mode, exam_mode, negative_marking_text, test_type_label, valid_until, answer_key_release_at, result_release_at,
                  dynamic_date_enabled, date_cycle_days
           FROM tests
           WHERE is_published = true AND test_kind = $1
             AND subcategory ILIKE $2
           ORDER BY title ASC
           LIMIT $3`;
      params = [kind, `%${sub}%`, limit];
    } else if (sub) {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind,
                  exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
                  language_mode, exam_mode, negative_marking_text, test_type_label, valid_until, answer_key_release_at, result_release_at,
                  dynamic_date_enabled, date_cycle_days
           FROM tests
           WHERE is_published = true AND subcategory ILIKE $1
           ORDER BY title ASC
           LIMIT $2`;
      params = [`%${sub}%`, limit];
    } else if (kind && ['mock', 'quiz'].includes(kind)) {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind,
                  exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
                  language_mode, exam_mode, negative_marking_text, test_type_label, valid_until, answer_key_release_at, result_release_at,
                  dynamic_date_enabled, date_cycle_days
           FROM tests
           WHERE is_published = true AND test_kind = $1
           ORDER BY title ASC
           LIMIT $2`;
      params = [kind, limit];
    } else {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind,
                  exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
                  language_mode, exam_mode, negative_marking_text, test_type_label, valid_until, answer_key_release_at, result_release_at,
                  dynamic_date_enabled, date_cycle_days
           FROM tests
           WHERE is_published = true
           ORDER BY title ASC
           LIMIT $1`;
      params = [limit];
    }
    const { rows } = await pool.query(q, params);
    return res.json({ items: rows.map(mapTest) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list tests' });
  }
});

module.exports = router;
