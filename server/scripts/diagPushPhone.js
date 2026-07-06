'use strict';

require('dotenv').config();
const { pool } = require('../src/db');

async function main() {
  const tokenStats = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users FROM user_device_tokens`
  );
  console.log('user_device_tokens:', tokenStats.rows[0]);

  const ns = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`
  );
  let items = [];
  try {
    items = JSON.parse(String(ns.rows[0]?.setting_value || '{}')).items || [];
  } catch {
    items = [];
  }
  console.log('\nnotificationScheduling (FCM queue):');
  for (const it of items) {
    console.log(
      JSON.stringify({
        title: it.title,
        status: it.status,
        lastRunSent: it.lastRunSent,
        lastRunFailed: it.lastRunFailed,
        lastError: it.lastError,
      })
    );
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
  console.log('\npushNotificationSettings (in-app inbox API):');
  for (const it of pushItems) {
    console.log(
      JSON.stringify({
        id: it.id,
        title: it.title,
        status: it.status,
        enabled: it.enabled,
        scheduleAt: it.scheduleAt,
      })
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error('DIAG_FAIL', e.message || e);
  process.exit(1);
});
