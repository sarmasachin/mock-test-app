'use strict';
require('dotenv').config();
const { pool } = require('../src/db');
const { resolveCycleRepublishGapMinutes } = require('../src/lib/cycleRepublishGap');

(async () => {
  const now = Date.now();
  const tests = await pool.query(
    `SELECT id, title, is_published, duration_minutes, last_cycle_started_at, enrolled_count, updated_at
     FROM tests ORDER BY updated_at DESC LIMIT 10`,
  );
  console.log('=== TESTS ===');
  for (const t of tests.rows) {
    const started = Date.parse(String(t.last_cycle_started_at || ''));
    const dur = Math.max(1, Number(t.duration_minutes || 0));
    const cycleEnd = Number.isFinite(started) ? started + dur * 60000 : NaN;
    const republishAt = Number.isFinite(cycleEnd)
      ? cycleEnd + resolveCycleRepublishGapMinutes(null) * 60000
      : NaN;
    console.log(
      JSON.stringify({
        title: t.title,
        is_published: t.is_published,
        duration_minutes: t.duration_minutes,
        last_cycle_started_at: t.last_cycle_started_at,
        cycle_ended: Number.isFinite(cycleEnd) ? now >= cycleEnd : null,
        minutes_since_cycle_end: Number.isFinite(cycleEnd) ? ((now - cycleEnd) / 60000).toFixed(1) : null,
        republish_at: Number.isFinite(republishAt) ? new Date(republishAt).toISOString() : null,
        minutes_until_republish: Number.isFinite(republishAt) ? ((republishAt - now) / 60000).toFixed(1) : null,
        enrolled_count: t.enrolled_count,
      }),
    );
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
  const pending = pubItems.filter(
    (i) => String(i.status) === 'scheduled' && String(i.entityType) === 'test',
  );
  console.log('\n=== PENDING REPUBLISH ===');
  for (const p of pending) {
    console.log(JSON.stringify({ entityId: p.entityId, scheduleAt: p.scheduleAt, notifyOnPublish: p.notifyOnPublish }));
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
