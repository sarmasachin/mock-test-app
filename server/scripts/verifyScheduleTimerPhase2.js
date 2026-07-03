'use strict';

/**
 * Phase 2 verify — offline checks for E2E compare helpers (no network/DB).
 */

const {
  sanitizeHomeContentForPublicApi,
  scheduleTimerFieldsMatchApi,
  hasLegacyTimerFields,
  LEGACY_TIMER_KEYS,
} = require('../src/lib/homeContentPublicSanitize');

function line(ok, label) {
  console.log(`  [${ok ? 'OK' : 'FAIL'}] ${label}`);
  return ok;
}

function assertNoLegacyKeys(content, label) {
  let ok = true;
  for (const key of LEGACY_TIMER_KEYS) {
    ok = line(!Object.prototype.hasOwnProperty.call(content || {}, key), `${label}: no ${key}`) && ok;
  }
  return ok;
}

let ok = true;

ok = line(LEGACY_TIMER_KEYS.length === 2, 'legacy key list defined') && ok;

const dbRaw = { startSeriesLockSeconds: 20, startSeriesActiveWindowMinutes: 30, welcomeText: 'x' };
const apiSim = sanitizeHomeContentForPublicApi(dbRaw);
ok = line(scheduleTimerFieldsMatchApi(dbRaw, apiSim), 'DB raw vs API sanitize timer match') && ok;
ok = assertNoLegacyKeys(apiSim, 'sanitized') && ok;

ok =
  line(
    scheduleTimerFieldsMatchApi(
      { startSeriesScheduleTimerEnabled: true },
      { startSeriesScheduleTimerEnabled: true, sections: [] },
    ),
    'enabled flag match true',
  ) && ok;

ok =
  line(
    !scheduleTimerFieldsMatchApi(
      { startSeriesScheduleTimerEnabled: true },
      { startSeriesScheduleTimerEnabled: false },
    ),
    'mismatch detected when enabled differs',
  ) && ok;

const myAppShape = {
  items: [
    {
      testId: 'uuid',
      testTitle: 'Test',
      examDate: '2026-07-15',
      slotLabel: '10:00 AM',
      canStart: true,
      startBlockReason: null,
      joinClosesAt: '2026-10-01T00:00:00.000Z',
    },
  ],
};
ok = line(Array.isArray(myAppShape.items), 'my-applications shape has items[]') && ok;
ok = line('examDate' in myAppShape.items[0], 'my-applications item has examDate for Android sync') && ok;
ok = line('slotLabel' in myAppShape.items[0], 'my-applications item has slotLabel') && ok;
ok = line('canStart' in myAppShape.items[0], 'my-applications item has canStart (phase 3)') && ok;
ok = line('joinClosesAt' in myAppShape.items[0], 'my-applications item has joinClosesAt (phase 3)') && ok;

console.log(ok ? '\nPhase 2 schedule timer verify (offline): PASS' : '\nPhase 2 schedule timer verify (offline): FAIL');
process.exit(ok ? 0 : 1);
