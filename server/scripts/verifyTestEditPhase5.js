#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relPath), 'utf8');
}

/** Mirror of server normalizeDateOnlyField (Phase 2). */
function normalizeDateOnlyField(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mirror of server badge save rule (Phase 4). */
function resolveBadgeForSave(badgeEnabled, badgeTextRaw) {
  const enabled = badgeEnabled === true;
  const text = String(badgeTextRaw || '').trim().slice(0, 40);
  return {
    badgeEnabled: enabled,
    badgeText: enabled ? (text || 'Live') : '',
  };
}

/** Mirror of app toTestCard badge mapping (Phase 4). */
function mapBadgeForApp(badgeEnabled, badgeText) {
  const enabled = badgeEnabled === true;
  const text = String(badgeText || '').trim();
  return {
    badgeEnabled: enabled,
    badgeText: enabled ? (text || 'Live') : '',
  };
}

let ok = true;

const syncSrc = readRepoFile('server/src/lib/syncTestQuestionCount.js');
ok = line(
  syncSrc.includes('resolveSyncedQuestionCount'),
  'syncTestQuestionCount uses published-or-total resolver',
) && ok;

ok = line(
  normalizeDateOnlyField('2026-07-08T00:00:00.000Z') === '2026-07-08',
  'Phase 2: ISO examDate normalizes to YYYY-MM-DD',
) && ok;
ok = line(
  !Number.isNaN(Date.parse(`${normalizeDateOnlyField('2026-07-08T00:00:00.000Z')}T00:00:00Z`)),
  'Phase 2: normalized examDate passes save validation parse',
) && ok;

const adminJs = readRepoFile('server/src/routes/admin.js');
ok = line(adminJs.includes('function normalizeDateOnlyField'), 'Phase 2: server normalizeDateOnlyField present') && ok;
ok = line(
  adminJs.includes("const badgeText = badgeEnabled ? (badgeTextRaw || 'Live') : ''"),
  'Phase 4: server clears badge_text when badge disabled',
) && ok;

const adminTsx = readRepoFile('admin-web/src/App.tsx');
ok = line(adminTsx.includes('function toDateInputValue'), 'Phase 2: admin toDateInputValue present') && ok;
ok = line(
  adminTsx.includes('const freshItems = await load()') &&
    adminTsx.includes('freshItems.find((x) => x.id === editingId)'),
  'Phase 3: edit save reloads advanced config from GET /admin/tests',
) && ok;

const appKt = readRepoFile('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
ok = line(
  !appKt.includes('badgeEnabled == true || !badgeText.isNullOrBlank()'),
  'Phase 4: app no longer forces badge ON from badgeText alone',
) && ok;
ok = line(
  appKt.includes('badgeEnabled = badgeEnabled == true'),
  'Phase 4: app badgeEnabled follows API flag only',
) && ok;

const badgeOff = resolveBadgeForSave(false, 'Live');
ok = line(badgeOff.badgeEnabled === false && badgeOff.badgeText === '', 'Phase 4: save payload clears badge text when OFF') && ok;

const appOff = mapBadgeForApp(false, 'Live');
ok = line(appOff.badgeEnabled === false && appOff.badgeText === '', 'Phase 4: app hides badge when API badgeEnabled=false') && ok;

const badgeOn = mapBadgeForApp(true, '');
ok = line(badgeOn.badgeEnabled === true && badgeOn.badgeText === 'Live', 'Phase 4: app default Live text when enabled') && ok;

async function printDbHint() {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const { pool } = require('../src/db');
    const badBadge = await pool.query(
      `SELECT COUNT(*)::int AS c FROM tests WHERE badge_enabled = false AND COALESCE(badge_text, '') <> ''`,
    );
    const count = Number(badBadge.rows[0]?.c || 0);
    console.log(`\nINFO  tests with badge_enabled=false but badge_text set: ${count}`);
    if (count > 0) {
      console.log('INFO  re-save those tests in admin (badge OFF) to clear legacy badge_text in DB');
    }
    await pool.end();
  } catch (e) {
    console.log('INFO  DB snapshot skipped:', e.message || e);
  }
}

(async () => {
  if (!ok) {
    console.error('TEST_EDIT_PHASE5_VERIFY_FAIL');
    process.exit(1);
  }
  console.log('TEST_EDIT_PHASE5_VERIFY_OK');
  await printDbHint();
})();
