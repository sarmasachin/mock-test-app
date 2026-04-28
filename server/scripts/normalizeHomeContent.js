'use strict';

require('dotenv').config();
const { Pool } = require('pg');

function sanitizeHomeContent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((section, idx) => {
      const s = section || {};
      const title = String(s.title || '').trim();
      const items = (Array.isArray(s.items) ? s.items : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 12);
      return {
        id: String(s.id || `section-${idx + 1}`).trim(),
        title,
        items,
      };
    })
    .filter((s) => s.title && s.items.length > 0);

  const quickActionSections = (Array.isArray(raw.quickActionSections) ? raw.quickActionSections : [])
    .map((section, idx) => {
      const s = section || {};
      const title = String(s.title || '').trim();
      const items = (Array.isArray(s.items) ? s.items : [])
        .map((item) => ({
          title: String((item || {}).title || '').trim(),
          actionKey: String((item || {}).actionKey || '').trim(),
          iconKey: String((item || {}).iconKey || '').trim(),
        }))
        .filter((x) => x.title && x.actionKey);
      return {
        id: String(s.id || `qa-section-${idx + 1}`).trim(),
        title,
        items,
      };
    })
    .filter((s) => s.title && s.items.length > 0);

  return {
    ...raw,
    sections,
    quickActionSections,
    newsCategoryMenu: (Array.isArray(raw.newsCategoryMenu) ? raw.newsCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    jobCategoryMenu: (Array.isArray(raw.jobCategoryMenu) ? raw.jobCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    examCategoryMenu: (Array.isArray(raw.examCategoryMenu) ? raw.examCategoryMenu : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  };
}

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
    const cleaned = sanitizeHomeContent(parsed) || {};
    await client.query(
      "INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES ('homeContent', $1, NULL) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()",
      [JSON.stringify(cleaned)],
    );
    console.log('homeContent normalized successfully');
    console.log(`sections=${Array.isArray(cleaned.sections) ? cleaned.sections.length : 0}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
