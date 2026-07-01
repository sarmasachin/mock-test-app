'use strict';
require('dotenv').config();
const { pool } = require('../src/db');

async function loadAdvancedMap() {
  const res = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  try {
    return JSON.parse(String(res.rows[0]?.setting_value || '{}')) || {};
  } catch {
    return {};
  }
}

function resolveAdv(map, testId) {
  const key = String(testId || '').trim();
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (String(k).trim().toLowerCase() === lower) return v;
  }
  return null;
}

(async () => {
  const nowMs = Date.now();
  const advancedMap = await loadAdvancedMap();

  const tests = await pool.query(
    `SELECT id, title, slug, subcategory, is_published, duration_minutes, question_count,
            last_cycle_started_at, enrolled_count, capacity_total, valid_until, exam_date,
            dynamic_date_enabled, date_cycle_days, updated_at, test_kind
     FROM tests
     ORDER BY updated_at DESC`,
  );

  console.log('=== ALL TESTS (' + tests.rows.length + ') ===\n');
  for (const t of tests.rows) {
    const adv = resolveAdv(advancedMap, t.id) || {};
    const publishAt = String(adv.publishAt || '').trim();
    const unpublishAt = String(adv.unpublishAt || '').trim();
    const started = Date.parse(String(t.last_cycle_started_at || ''));
    const dur = Math.max(1, Number(t.duration_minutes || 0));
    const cycleEnd = Number.isFinite(started) ? started + dur * 60000 : NaN;

    const qCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM questions WHERE test_id = $1::uuid AND is_published = true`,
      [t.id],
    );
    const publishedQ = qCount.rows[0]?.c || 0;

    const reasons = [];
    if (t.is_published !== true) reasons.push('is_published=false');
    if (publishedQ === 0) reasons.push('no_published_questions');
    if (publishAt && Date.parse(publishAt) > nowMs) reasons.push('publishAt_in_future:' + publishAt);
    if (unpublishAt && Date.parse(unpublishAt) <= nowMs) reasons.push('unpublishAt_passed:' + unpublishAt);
    if (t.valid_until) {
      const vu = String(t.valid_until).slice(0, 10);
      const endMs = Date.parse(vu + 'T23:59:59.999+05:30');
      if (Number.isFinite(endMs) && nowMs > endMs) reasons.push('valid_until_passed:' + vu);
    }

    const catalogVisible = reasons.length === 0;

    console.log(JSON.stringify({
      title: t.title,
      id: String(t.id).slice(0, 8),
      is_published: t.is_published,
      duration_minutes: t.duration_minutes,
      question_count: t.question_count,
      published_questions: publishedQ,
      subcategory: t.subcategory,
      test_kind: t.test_kind,
      last_cycle_started_at: t.last_cycle_started_at,
      cycle_ended: Number.isFinite(cycleEnd) ? nowMs >= cycleEnd : null,
      catalog_visible: catalogVisible,
      block_reasons: reasons,
      advanced: { publishAt: publishAt || null, unpublishAt: unpublishAt || null },
      enrolled: t.enrolled_count,
      capacity: t.capacity_total,
    }, null, 2));
    console.log('');
  }

  const pubRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'publishScheduling' LIMIT 1`,
  );
  let pubItems = [];
  try {
    pubItems = JSON.parse(String(pubRes.rows[0]?.setting_value || '{}')).items || [];
  } catch {
    pubItems = [];
  }
  const pending = pubItems.filter((i) => String(i.status) === 'scheduled' && String(i.entityType) === 'test');
  console.log('=== PENDING REPUBLISH (' + pending.length + ') ===');
  for (const p of pending.slice(0, 10)) {
    const overdue = Date.parse(String(p.scheduleAt || '')) <= nowMs;
    console.log(JSON.stringify({ entityId: String(p.entityId).slice(0, 8), scheduleAt: p.scheduleAt, overdue }));
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
