#!/usr/bin/env node
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  const phone = process.argv[2] || '9817585270';
  const { rows } = await pool.query(
    `SELECT id::text, email, phone, display_name, is_banned, marketing_emails_unsubscribed_at, created_at
     FROM users
     WHERE trim(COALESCE(phone,'')) = $1 OR trim(COALESCE(email,'')) ILIKE $2
     ORDER BY created_at DESC
     LIMIT 5`,
    [phone, `%${phone}%`],
  );
  console.log('Users matching phone', phone, ':', JSON.stringify(rows, null, 2));

  const fullId = '452c5413-69b9-4edc-8be2-14d6dab71a12';
  const { rows: t } = await pool.query(
    `SELECT title, is_published, created_at, updated_at FROM tests WHERE id=$1::uuid`,
    [fullId],
  );
  console.log('\nFull Flow row:', t[0]);

  const adv = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key='testAdvancedConfigs'`);
  const map = JSON.parse(String(adv.rows[0]?.setting_value || '{}'));
  console.log('\nFull Flow in testAdvancedConfigs:', map[fullId] ?? 'MISSING');

  const gmail = await pool.query(
    `SELECT email FROM users WHERE email ILIKE '%@gmail.%' AND is_banned=false AND marketing_emails_unsubscribed_at IS NULL LIMIT 8`,
  );
  console.log('\nSample real gmail recipients in DB:', gmail.rows.map((r) => r.email));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
