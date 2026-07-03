'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { sanitizeHomeContentForPublicApi } = require('../src/lib/homeContentPublicSanitize');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
        ? { rejectUnauthorized: false }
        : false,
  });
  const client = await pool.connect();
  try {
    const sel = await client.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'homeContent' LIMIT 1",
    );
    if (!sel.rows.length) {
      console.log('homeContent setting not found');
      return;
    }
    let parsed = {};
    try {
      parsed = JSON.parse(String(sel.rows[0].setting_value || '{}'));
    } catch (_e) {
      parsed = {};
    }
    const cleaned = sanitizeHomeContentForPublicApi(parsed) || {};
    await client.query(
      "INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES ('homeContent', $1, NULL) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()",
      [JSON.stringify(cleaned)],
    );
    console.log('homeContent normalized successfully');
    console.log(`sections=${Array.isArray(cleaned.sections) ? cleaned.sections.length : 0}`);
    console.log(`startSeriesScheduleTimerEnabled=${cleaned.startSeriesScheduleTimerEnabled === true}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
