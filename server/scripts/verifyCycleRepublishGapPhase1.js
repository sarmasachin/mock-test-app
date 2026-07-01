'use strict';
/**
 * Phase 1 verify — cycle republish gap config (no DB writes).
 * Default must stay 30 min when env unset (backward compatible).
 */
const {
  DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES,
  clampCycleRepublishGapMinutes,
  resolveDefaultCycleRepublishGapMinutes,
  resolveCycleRepublishGapMinutes,
  cycleRepublishAtMs,
} = require('../src/lib/cycleRepublishGap');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = String(value);
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

let ok = true;

ok = line(
  DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES === 30,
  `default constant is 30 (got ${DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES})`,
) && ok;

ok = withEnv('CYCLE_REPUBLISH_GAP_MINUTES', undefined, () =>
  line(
    resolveDefaultCycleRepublishGapMinutes() === 30,
    'env unset → 30 minutes',
  ),
) && ok;

ok = withEnv('CYCLE_REPUBLISH_GAP_MINUTES', '5', () =>
  line(resolveDefaultCycleRepublishGapMinutes() === 5, 'env CYCLE_REPUBLISH_GAP_MINUTES=5 → 5'),
) && ok;

ok = withEnv('CYCLE_REPUBLISH_GAP_MINUTES', 'bad', () =>
  line(
    resolveDefaultCycleRepublishGapMinutes() === 30,
    'invalid env → fallback 30',
  ),
) && ok;

ok = line(
  resolveCycleRepublishGapMinutes({ cycleRepublishGapMinutes: 10 }) === 10,
  'per-test override 10',
) && ok;

ok = withEnv('CYCLE_REPUBLISH_GAP_MINUTES', '30', () =>
  line(
    resolveCycleRepublishGapMinutes({ cycleRepublishGapMinutes: 10 }) === 10,
    'per-test override beats env',
  ),
) && ok;

ok = withEnv('CYCLE_REPUBLISH_GAP_MINUTES', '15', () =>
  line(
    resolveCycleRepublishGapMinutes({}) === 15,
    'empty advancedConfig uses env default',
  ),
) && ok;

const cycleEnd = Date.parse('2026-07-01T10:00:00.000Z');
const republishMs = cycleRepublishAtMs(cycleEnd, { cycleRepublishGapMinutes: 5 });
ok = line(
  republishMs === cycleEnd + 5 * 60 * 1000,
  'cycleRepublishAtMs adds gap correctly',
) && ok;

ok = line(clampCycleRepublishGapMinutes(-5) === 0, 'clamp negative → 0') && ok;
ok = line(clampCycleRepublishGapMinutes(99999) === 10080, 'clamp max → 10080') && ok;

if (ok) {
  console.log('\nPHASE1_VERIFY_OK');
  process.exit(0);
}
console.log('\nPHASE1_VERIFY_FAILED');
process.exit(1);
