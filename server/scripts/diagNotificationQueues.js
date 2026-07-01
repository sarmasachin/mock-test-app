'use strict';

require('dotenv').config();
const { pool } = require('../src/db');

async function main() {
  const keys = ['notificationScheduling', 'publishScheduling'];
  const now = Date.now();

  for (const key of keys) {
    const res = await pool.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1',
      [key]
    );
    const raw = res.rows[0]?.setting_value;
    let parsed = { items: [] };
    try {
      parsed = JSON.parse(String(raw || '{}')) || { items: [] };
    } catch {
      parsed = { items: [] };
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const byStatus = {};
    const byTitle = {};
    for (const it of items) {
      const st = String(it.status || 'unknown');
      byStatus[st] = (byStatus[st] || 0) + 1;
      const title = String(it.title || '(no title)');
      byTitle[title] = (byTitle[title] || 0) + 1;
    }

    console.log(`\n=== ${key} (total=${items.length}) ===`);
    console.log('byStatus:', JSON.stringify(byStatus));
    console.log('byTitle:', JSON.stringify(byTitle));

    const scheduled = items.filter((it) => String(it.status || '') === 'scheduled');
    const overdue = scheduled.filter((it) => {
      const ms = Date.parse(String(it.scheduleAt || ''));
      return Number.isFinite(ms) && ms <= now;
    });
    console.log(`scheduled=${scheduled.length}, overdue=${overdue.length}`);

    for (const it of items.slice(0, 40)) {
      const scheduleMs = Date.parse(String(it.scheduleAt || ''));
      const isOverdue = Number.isFinite(scheduleMs) && scheduleMs <= now;
      console.log(
        JSON.stringify({
          id: it.id,
          title: it.title,
          message: String(it.message || '').slice(0, 100),
          status: it.status,
          repeatType: it.repeatType,
          scheduleAt: it.scheduleAt,
          overdue: isOverdue,
          lastError: it.lastError,
          entityType: it.entityType,
          entityId: it.entityId,
          action: it.action,
          notifyOnPublish: it.notifyOnPublish,
          sentAt: it.sentAt,
          publishedAt: it.publishedAt,
        })
      );
    }
  }

  const tests = await pool.query(
    `SELECT id, title, is_published, duration_minutes, last_cycle_started_at, updated_at
     FROM tests WHERE is_published = true ORDER BY updated_at DESC LIMIT 15`
  );
  console.log('\n=== published tests ===');
  for (const t of tests.rows) {
    const started = Date.parse(String(t.last_cycle_started_at || ''));
    const dur = Math.max(1, Number(t.duration_minutes || 0));
    const cycleEnd = started + dur * 60000;
    console.log(
      JSON.stringify({
        id: t.id,
        title: t.title,
        duration_minutes: t.duration_minutes,
        last_cycle_started_at: t.last_cycle_started_at,
        cycle_ends_in_min: Number.isFinite(cycleEnd)
          ? ((cycleEnd - now) / 60000).toFixed(1)
          : null,
        updated_at: t.updated_at,
      })
    );
  }

  const ids = ['8d792753-a54d-4b2d-b7b8-d8bd337193a2', '4678d374-2171-4b18-a353-d81814735055'];
  const testRes = await pool.query(
    `SELECT id, title, is_published, duration_minutes, last_cycle_started_at, updated_at
     FROM tests WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  console.log('\n=== cycle tests (by publish queue entityId) ===');
  for (const t of testRes.rows) {
    console.log(JSON.stringify(t));
  }

  const pubRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'publishScheduling' LIMIT 1`
  );
  let pubItems = [];
  try {
    pubItems = JSON.parse(String(pubRes.rows[0]?.setting_value || '{}')).items || [];
  } catch {
    pubItems = [];
  }
  const stuck = pubItems.filter((it) => String(it.status) === 'scheduled');
  console.log('\n=== stuck publishScheduling (scheduled) ===');
  console.log(JSON.stringify(stuck, null, 2));

  const published = pubItems
    .filter((it) => String(it.status) === 'published')
    .map((it) => ({
      entityId: it.entityId,
      scheduleAt: it.scheduleAt,
      processedAt: it.processedAt,
    }))
    .sort((a, b) => Date.parse(b.processedAt || b.scheduleAt) - Date.parse(a.processedAt || a.scheduleAt));

  console.log('\n=== publish interval analysis (last 20) ===');
  for (let i = 0; i < Math.min(20, published.length); i++) {
    const cur = published[i];
    const prev = published[i + 1];
    const curMs = Date.parse(cur.processedAt || cur.scheduleAt);
    const prevMs = prev ? Date.parse(prev.processedAt || prev.scheduleAt) : NaN;
    const gapMin = Number.isFinite(curMs) && Number.isFinite(prevMs) ? ((curMs - prevMs) / 60000).toFixed(1) : null;
    console.log(JSON.stringify({ ...cur, gap_from_prev_min: gapMin }));
  }

  const pushRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'pushNotificationSettings' LIMIT 1`
  );
  let pushItems = [];
  try {
    pushItems = JSON.parse(String(pushRes.rows[0]?.setting_value || '{}')).items || [];
  } catch {
    pushItems = [];
  }
  console.log('\n=== pushNotificationSettings (inbox campaigns) ===');
  console.log('count:', pushItems.length);
  for (const it of pushItems.slice(0, 15)) {
    console.log(JSON.stringify({ title: it.title, message: String(it.message || '').slice(0, 80), scheduleAt: it.scheduleAt, status: it.status }));
  }

  await pool.end();
}

main().catch((e) => {
  console.error('DIAG_FAIL', e.message || e);
  process.exit(1);
});
