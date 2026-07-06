#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  console.log('=== Deep publish-email DB trace ===\n');
  console.log('DATABASE_URL host:', (() => {
    try {
      const u = new URL(String(process.env.DATABASE_URL || '').replace(/^postgres:/, 'http:'));
      return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch (_e) {
      return '(parse failed — local .env)';
    }
  })());

  const tests = await pool.query(
    `SELECT id::text AS id, title, slug, is_published, created_at, updated_at, last_cycle_started_at
     FROM tests
     ORDER BY updated_at DESC
     LIMIT 10`,
  );
  console.log('\n-- Recent tests (newest update first) --');
  for (const t of tests.rows) {
    console.log(JSON.stringify({
      title: t.title,
      id: t.id,
      is_published: t.is_published,
      created_at: t.created_at,
      updated_at: t.updated_at,
      last_cycle_started_at: t.last_cycle_started_at,
    }));
  }

  const advRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  let advMap = {};
  try {
    advMap = JSON.parse(String(advRes.rows[0]?.setting_value || '{}')) || {};
  } catch (_e) {
    advMap = {};
  }

  console.log('\n-- advancedConfig per recent test id --');
  for (const t of tests.rows) {
    const cfg = advMap[t.id] || advMap[String(t.id).toLowerCase()] || null;
    console.log(JSON.stringify({
      test: t.title,
      id: t.id,
      sendEmailOnPublish: cfg?.sendEmailOnPublish === true,
      notifyOnPublish: cfg?.notifyOnPublish !== false,
      notifyOnCycleRepublish: cfg?.notifyOnCycleRepublish === true,
      raw_sendEmailOnPublish: cfg?.sendEmailOnPublish,
    }));
  }

  const fullFlow = tests.rows.find((r) => String(r.title || '').toLowerCase().includes('full flow'));
  if (fullFlow) {
    const created = new Date(fullFlow.created_at).getTime();
    const updated = new Date(fullFlow.updated_at).getTime();
    const deltaSec = Math.round((updated - created) / 1000);
    console.log('\n-- "Full Flow" publish-email path analysis --');
    console.log(`created_at vs updated_at delta: ${deltaSec}s`);
    if (deltaSec < 5) {
      console.log('LIKELY PATH: POST create (new test) — email WOULD schedule IF sendEmailOnPublish=true AND is_published=true');
    } else {
      console.log('LIKELY PATH: created then edited (PATCH) — email only if unpublish→publish transition on a PATCH');
    }
    const cfg = advMap[fullFlow.id] || {};
    console.log(`sendEmailOnPublish in DB: ${JSON.stringify(cfg.sendEmailOnPublish)} (need strict true)`);
    console.log(`is_published now: ${fullFlow.is_published}`);
    if (cfg.sendEmailOnPublish !== true) {
      console.log('BLOCKER: sendEmailOnPublish is NOT true in testAdvancedConfigs — checkbox was OFF on save OR advancedConfig not saved for this test id');
    }
  }

  const togglesRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'emailEventToggles' LIMIT 1`,
  );
  let toggles = {};
  try {
    toggles = JSON.parse(String(togglesRes.rows[0]?.setting_value || '{}')) || {};
  } catch (_e) {
    toggles = {};
  }
  console.log('\n-- emailEventToggles.admin_content_alert --', toggles.admin_content_alert);

  const mail = require('../src/mail');
  console.log('\n-- SMTP (this server process .env) --');
  console.log('isMailConfigured:', mail.isMailConfigured());

  console.log('\n=== Done ===');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
