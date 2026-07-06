'use strict';

/**
 * Phase 8 verify — per-cycle attempt counting (offline, no DB).
 */

const {
  parseCycleStartedAtMs,
  filterAttemptTimestampsForCycle,
  evaluateAttemptAccess,
} = require('../src/lib/testAttempts');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

const cycle1StartMs = Date.parse('2026-07-01T10:00:00.000Z');
const cycle2StartMs = Date.parse('2026-07-02T10:00:00.000Z');
const attemptCycle1Ms = Date.parse('2026-07-01T11:00:00.000Z');
const attemptCycle2Ms = Date.parse('2026-07-02T11:00:00.000Z');

let ok = true;

ok = line(
  parseCycleStartedAtMs({ last_cycle_started_at: '2026-07-02T10:00:00.000Z' }) === cycle2StartMs,
  'parseCycleStartedAtMs parses ISO',
) && ok;

ok = line(
  parseCycleStartedAtMs({ last_cycle_started_at: null }) === null,
  'parseCycleStartedAtMs null when missing',
) && ok;

const cycle2Only = filterAttemptTimestampsForCycle(
  [attemptCycle1Ms, attemptCycle2Ms],
  cycle2StartMs,
);
ok = line(cycle2Only.length === 1 && cycle2Only[0] === attemptCycle2Ms, 'filter excludes older cycle attempts') && ok;

const legacyAll = filterAttemptTimestampsForCycle([attemptCycle1Ms, attemptCycle2Ms], null);
ok = line(legacyAll.length === 2, 'filter without cycle keeps all attempts (legacy)') && ok;

const usedAfterCycle1 = filterAttemptTimestampsForCycle([attemptCycle1Ms], cycle1StartMs).length;
const accessCycle1Blocked = evaluateAttemptAccess({
  attemptsAllowed: 1,
  reattemptCooldownMinutes: 0,
  attemptCount: usedAfterCycle1,
  lastAttemptAtMs: attemptCycle1Ms,
});
ok = line(
  accessCycle1Blocked.allowed === false && usedAfterCycle1 === 1,
  'same cycle: 1 attempt used blocks second try',
) && ok;

const usedAfterCycle2 = filterAttemptTimestampsForCycle([attemptCycle1Ms], cycle2StartMs).length;
const accessNewCycle = evaluateAttemptAccess({
  attemptsAllowed: 1,
  reattemptCooldownMinutes: 0,
  attemptCount: usedAfterCycle2,
  lastAttemptAtMs: null,
});
ok = line(
  accessNewCycle.allowed === true && usedAfterCycle2 === 0,
  'new cycle: prior cycle attempt does not block (attempts_allowed=1)',
) && ok;

const twoInSameCycle = filterAttemptTimestampsForCycle(
  [attemptCycle1Ms, Date.parse('2026-07-01T12:00:00.000Z')],
  cycle1StartMs,
).length;
const accessTwoSameCycle = evaluateAttemptAccess({
  attemptsAllowed: 2,
  reattemptCooldownMinutes: 0,
  attemptCount: twoInSameCycle,
  lastAttemptAtMs: Date.parse('2026-07-01T12:00:00.000Z'),
});
ok = line(
  accessTwoSameCycle.allowed === false && twoInSameCycle === 2,
  'same cycle: attempts_allowed=2 exhausted after 2 submits',
) && ok;

const cooldownNow = Date.parse('2026-07-01T11:05:00.000Z');
const cooldownAccess = evaluateAttemptAccess({
  attemptsAllowed: 2,
  reattemptCooldownMinutes: 10,
  attemptCount: 1,
  lastAttemptAtMs: attemptCycle1Ms,
  nowMs: cooldownNow,
});
ok = line(
  cooldownAccess.allowed === false && cooldownAccess.error.includes('wait'),
  'cooldown applies within same cycle',
) && ok;

if (!ok) {
  console.error('PHASE8_VERIFY_FAIL');
  process.exit(1);
}
console.log('PHASE8_VERIFY_OK');
