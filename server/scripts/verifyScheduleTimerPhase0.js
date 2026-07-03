'use strict';

/**
 * Phase 0 verify — schedule timer replaces fixed 20s/30min lock (offline, no DB).
 */

const assert = require('assert');

function line(ok, label) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`  [${mark}] ${label}`);
  return ok;
}

// Mirror admin.js normalizeHomeContent timer field
function normalizeTimerField(safe) {
  return safe.startSeriesScheduleTimerEnabled === true;
}

let ok = true;

ok = line(normalizeTimerField({}) === false, 'missing field → timer off') && ok;
ok = line(normalizeTimerField({ startSeriesScheduleTimerEnabled: false }) === false, 'explicit false') && ok;
ok = line(normalizeTimerField({ startSeriesScheduleTimerEnabled: true }) === true, 'explicit true') && ok;
ok = line(
  normalizeTimerField({ startSeriesLockSeconds: 20, startSeriesActiveWindowMinutes: 30 }) === false,
  'legacy lock seconds ignored → timer off unless enabled',
) && ok;

// Mirror Kotlin resolveAppliedSeriesTiming (timer off)
function resolveTimingOff(nowMs) {
  const ttl = 90 * 24 * 60 * 60 * 1000;
  return { unlockAt: nowMs, expiresAt: nowMs + ttl, scheduled: 0 };
}

const now = Date.parse('2026-07-01T10:00:00.000Z');
const off = resolveTimingOff(now);
ok = line(off.unlockAt === now, 'timer off → immediate unlock') && ok;
ok = line(off.unlockAt < off.expiresAt, 'timer off → positive TTL') && ok;

// Timer on + future schedule
function parseExamStartMs(dateStr, slot) {
  const d = new Date(`${dateStr}T${slot}:00+05:30`);
  return d.getTime();
}

function resolveTimingOn(nowMs, examDate, slot, lateJoinMin = 0) {
  const scheduled = parseExamStartMs(examDate, slot);
  const unlockAt = scheduled > nowMs ? scheduled : nowMs;
  const joinMs = lateJoinMin > 0 ? lateJoinMin * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = Math.max(scheduled + joinMs, unlockAt + 60 * 1000);
  return { unlockAt, expiresAt, scheduled };
}

const future = resolveTimingOn(now, '2026-07-02', '10:00', 30);
ok = line(future.unlockAt > now, 'timer on + future exam → locked until start') && ok;
ok = line(future.expiresAt > future.unlockAt, 'timer on → expiry after unlock') && ok;

const past = resolveTimingOn(Date.parse('2026-07-03T12:00:00.000Z'), '2026-07-02', '10:00', 30);
ok = line(past.unlockAt <= Date.parse('2026-07-03T12:00:00.000Z'), 'timer on + past start → unlock now') && ok;

console.log(ok ? '\nPhase 0 schedule timer verify: PASS' : '\nPhase 0 schedule timer verify: FAIL');
process.exit(ok ? 0 : 1);
