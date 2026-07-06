'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { pool } = require('../src/db');

(async () => {
  const tests = await pool.query(
    `SELECT id, title, subcategory, is_published, capacity_total, enrolled_count,
            exam_date, slot_label, dynamic_date_enabled, valid_until
     FROM tests ORDER BY title`,
  );
  console.log('TESTS', JSON.stringify(tests.rows, null, 2));
  const homeRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'homeContent' LIMIT 1`,
  );
  const home = JSON.parse(String(homeRes.rows[0]?.setting_value || '{}'));
  console.log('scheduleTimerEnabled', home.startSeriesScheduleTimerEnabled === true);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
