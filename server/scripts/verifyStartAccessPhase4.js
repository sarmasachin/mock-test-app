'use strict';

/**
 * Phase 4 verify — Android server sync merge logic (offline mirror of Kotlin).
 */

const { DEFAULT_NO_SCHEDULE_TTL_MS } = require('../src/lib/testStartAccess');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

const APPLIED_SERIES_NO_TIMER_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function mergeServerAppliedItem({
  nowMs,
  scheduleTimerEnabled,
  item,
}) {
  const title = String(item.testTitle || '').trim();
  if (!title) return null;
  const timing = scheduleTimerEnabled
    ? { unlockAt: nowMs, expiresAt: nowMs + 24 * 60 * 60 * 1000, scheduled: 0 }
    : {
        unlockAt: nowMs,
        expiresAt: nowMs + APPLIED_SERIES_NO_TIMER_TTL_MS,
        scheduled: 0,
      };
  const joinClosesAtMs = item.joinClosesAtMillis;
  const unlockAt =
    !scheduleTimerEnabled && item.canStart === true ? nowMs : timing.unlockAt;
  const expiresAt =
    joinClosesAtMs != null && joinClosesAtMs > unlockAt
      ? joinClosesAtMs
      : timing.expiresAt;
  return {
    testName: title,
    unlockAtMillis: unlockAt,
    expiresAtMillis: expiresAt,
    serverCanStart: item.canStart,
    startBlockReason: item.startBlockReason || null,
  };
}

function replaceFromServer(items, scheduleTimerEnabled, nowMs = Date.now()) {
  return items
    .map((item) => mergeServerAppliedItem({ nowMs, scheduleTimerEnabled, item }))
    .filter(Boolean);
}

function resolveStartBlockMessage(entry, scheduleTimerEnabled) {
  if (entry && entry.serverCanStart === true) return null;
  if (entry && entry.serverCanStart === false) {
    return entry.startBlockReason || 'Cannot start this test yet';
  }
  return scheduleTimerEnabled ? 'local schedule fallback' : null;
}

let ok = true;
const now = Date.parse('2026-07-01T10:00:00.000Z');

const timerOffMerged = replaceFromServer(
  [
    {
      testTitle: 'GK Test',
      canStart: true,
      joinClosesAtMillis: now + DEFAULT_NO_SCHEDULE_TTL_MS,
    },
  ],
  false,
  now,
);
ok = line(timerOffMerged.length === 1, 'atomic replace → one entry') && ok;
ok = line(timerOffMerged[0].serverCanStart === true, 'server canStart preserved') && ok;
ok = line(timerOffMerged[0].unlockAtMillis === now, 'timer off + canStart → immediate unlock') && ok;
ok = line(
  timerOffMerged[0].expiresAtMillis > now + APPLIED_SERIES_NO_TIMER_TTL_MS - 1000,
  'joinClosesAt drives expiry when longer',
) && ok;

const staleCleared = replaceFromServer([], false, now);
ok = line(staleCleared.length === 0, 'empty server list clears local ghosts') && ok;

ok = line(resolveStartBlockMessage(timerOffMerged[0], false) === null, 'server canStart → no block') && ok;
ok = line(
  resolveStartBlockMessage(
    { serverCanStart: false, startBlockReason: 'Late join window has closed' },
    true,
  ) === 'Late join window has closed',
  'server block reason surfaced',
) && ok;

if (ok) {
  console.log('\nPHASE4_ANDROID_SYNC_VERIFY_OK');
  process.exit(0);
}
console.log('\nPHASE4_ANDROID_SYNC_VERIFY_FAILED');
process.exit(1);
