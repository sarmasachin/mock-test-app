'use strict';

/**
 * Phase 1 verify — uses shared public sanitize lib (kept in sync with live API).
 */

const {
  sanitizeHomeContentForPublicApi,
  normalizeScheduleTimerEnabled,
  hasLegacyTimerFields,
} = require('../src/lib/homeContentPublicSanitize');

function line(ok, label) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`  [${mark}] ${label}`);
  return ok;
}

function reconcileEntriesOff(entries, nowMs) {
  const ttl = 90 * 24 * 60 * 60 * 1000;
  return entries.map((entry) => ({
    ...entry,
    unlockAtMillis: nowMs,
    scheduledStartAtMillis: 0,
    expiresAtMillis: nowMs + ttl,
  }));
}

let ok = true;

const legacy = sanitizeHomeContentForPublicApi({
  startSeriesLockSeconds: 20,
  startSeriesActiveWindowMinutes: 30,
  welcomeText: 'Hi',
});
ok = line(legacy.startSeriesScheduleTimerEnabled === false, 'public API strips legacy → timer off') && ok;
ok = line(!hasLegacyTimerFields(legacy), 'legacy timer keys not in sanitized output') && ok;
ok = line(legacy.welcomeText === 'Hi', 'other home fields preserved') && ok;

const enabled = sanitizeHomeContentForPublicApi({ startSeriesScheduleTimerEnabled: true });
ok = line(enabled.startSeriesScheduleTimerEnabled === true, 'public API passes enabled timer') && ok;

ok = line(normalizeScheduleTimerEnabled({}) === false, 'normalize missing → false') && ok;
ok = line(normalizeScheduleTimerEnabled({ startSeriesScheduleTimerEnabled: true }) === true, 'normalize true') && ok;

const now = Date.parse('2026-07-01T10:00:00.000Z');
const stale = [
  {
    testName: 'SSC Mock',
    unlockAtMillis: now + 20_000,
    expiresAtMillis: now + 30 * 60 * 1000,
    scheduledStartAtMillis: now + 3_600_000,
  },
];
const fixed = reconcileEntriesOff(stale, now);
ok = line(fixed[0].unlockAtMillis === now, 'reconcile → immediate unlock') && ok;
ok = line(fixed[0].scheduledStartAtMillis === 0, 'reconcile → clears schedule lock') && ok;
ok = line(fixed[0].expiresAtMillis > now + 80 * 24 * 60 * 60 * 1000, 'reconcile → 90d TTL') && ok;

function homeRemainingMs(scheduleTimerEnabled, entry, nowMs) {
  if (!scheduleTimerEnabled) return 0;
  const unlock = entry.scheduledStartAtMillis > nowMs
    ? entry.scheduledStartAtMillis
    : entry.unlockAtMillis;
  return Math.max(0, unlock - nowMs);
}

ok = line(homeRemainingMs(false, stale[0], now) === 0, 'home card: timer off → no countdown') && ok;
ok = line(homeRemainingMs(true, stale[0], now) > 0, 'home card: timer on → countdown') && ok;

console.log(ok ? '\nPhase 1 schedule timer verify: PASS' : '\nPhase 1 schedule timer verify: FAIL');
process.exit(ok ? 0 : 1);
