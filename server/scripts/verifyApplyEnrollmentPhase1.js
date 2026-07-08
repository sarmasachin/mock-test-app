#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — Verify apply route increments enrolled_count on cycle re-apply (offline).
 *
 * Usage:
 *   node scripts/verifyApplyEnrollmentPhase1.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function main() {
  console.log('=== verifyApplyEnrollmentPhase1 ===\n');
  let ok = true;
  const routes = read('server/src/routes/tests.js');

  ok = line(routes.includes("require('../lib/testApplicationCycle')"), 'tests.js imports testApplicationCycle') && ok;
  ok = line(routes.includes('buildApplyResponseBody'), 'tests.js uses buildApplyResponseBody') && ok;
  ok = line(routes.includes('incrementTestEnrolledCount'), 'shared incrementTestEnrolledCount helper exists') && ok;

  const reapplyBlock = /if \(existing\) \{[\s\S]{0,1400}incrementTestEnrolledCount/.test(routes);
  ok =
    line(
      reapplyBlock,
      'cycle re-apply path increments enrolled_count via incrementTestEnrolledCount',
    ) && ok;

  ok =
    line(
      routes.includes('reenrolledForNewCycle: true'),
      're-apply response sets reenrolledForNewCycle flag',
    ) && ok;

  ok =
    line(
      !routes.includes('const oneDayMs = 24 * 60 * 60 * 1000'),
      'removed duplicate 1-day isApplicationFromOlderCycle fallback from tests.js',
    ) && ok;

  const freshIncrements = /INSERT INTO test_applications[\s\S]{0,400}incrementTestEnrolledCount/.test(routes);
  ok = line(freshIncrements, 'fresh apply path uses incrementTestEnrolledCount') && ok;

  console.log('');
  if (ok) {
    console.log('PASS  Apply enrollment Phase 1 checks');
    process.exit(0);
  }
  console.error('FAIL  Apply enrollment Phase 1 checks');
  process.exit(1);
}

main();
