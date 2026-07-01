'use strict';

const assert = require('assert');
const { resolveNotifyOnCycleRepublish } = require('../src/lib/testVisibility');

assert.strictEqual(resolveNotifyOnCycleRepublish({}), false);
assert.strictEqual(resolveNotifyOnCycleRepublish({ notifyOnCycleRepublish: false }), false);
assert.strictEqual(resolveNotifyOnCycleRepublish({ notifyOnCycleRepublish: true }), true);
assert.strictEqual(resolveNotifyOnCycleRepublish(null), false);
console.log('notify_on_cycle_republish_phase4_smoke_ok');
