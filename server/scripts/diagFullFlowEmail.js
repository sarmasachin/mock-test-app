#!/usr/bin/env node
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  const advRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  const advMap = JSON.parse(String(advRes.rows[0]?.setting_value || '{}'));
  console.log('testAdvancedConfigs keys:', Object.keys(advMap));
  console.log('full map:', JSON.stringify(advMap, null, 2));

  const fullId = '452c5413-69b9-4edc-8be2-14d6dab71a12';
  console.log('\nFull Flow key lookup:', advMap[fullId] ? 'FOUND' : 'MISSING');

  try {
    const audit = await pool.query(
      `SELECT action_type, target_type, target_id, details_json, created_at
       FROM admin_audit_logs
       WHERE target_type = 'test' OR details_json::text ILIKE '%Full Flow%'
       ORDER BY created_at DESC
       LIMIT 15`,
    );
    console.log('\n-- Recent admin audit (test related) --');
    for (const r of audit.rows) {
      console.log(JSON.stringify({
        at: r.created_at,
        action: r.action_type,
        target: r.target_id,
        details: r.details_json,
      }));
    }
  } catch (e) {
    console.log('audit logs:', e.code || e.message);
  }

  const notif = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`,
  );
  let items = [];
  try {
    items = JSON.parse(String(notif.rows[0]?.setting_value || '{}')).items || [];
  } catch (_e) {}
  const testNotifs = items.filter((x) =>
    String(x?.message || '').toLowerCase().includes('full flow') ||
    String(x?.title || '').toLowerCase().includes('test published'),
  ).slice(0, 5);
  console.log('\n-- notificationScheduling items mentioning Full Flow / publish --');
  console.log(JSON.stringify(testNotifs, null, 2));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
