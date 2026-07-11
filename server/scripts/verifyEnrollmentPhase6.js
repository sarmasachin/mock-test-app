'use strict';

/**
 * Phase 6 — Full enrollment fix verification (offline phases 1–5 + live read-only API).
 *
 * Usage:
 *   node scripts/verifyEnrollmentPhase6.js
 *   node scripts/verifyEnrollmentPhase6.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/verifyEnrollmentPhase6.js --with-apply   # mutates enrollment on live API
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
const args = process.argv.slice(2);
const withApply = args.includes('--with-apply');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function runNodeScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const res = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  if (out) console.log(out);
  return { ok: res.status === 0, status: res.status ?? 1 };
}

function main() {
  console.log('=== Phase 6: Enrollment E2E verification ===\n');
  let ok = true;

  const offlineScripts = [
    'verifyApplyEnrollmentPhase1.js',
    'verifyPublishStabilityPhase2.js',
    'verifyApplyOncePhase3.js',
    'verifyAndroidEnrollmentCachePhase4.js',
    'verifyResolveEnrollmentPhase5.js',
    'verifyApplyOncePhase1.js',
    'verifyQuizSubmitCatalogIdFallback.js',
    'verifyApplyOncePhase1.js',
    'verifyQuizSubmitCatalogIdFallback.js',
  ];

  console.log('-- Offline phase checks (1–5) --');
  for (const script of offlineScripts) {
    const label = script.replace(/^verify/, '').replace(/\.js$/, '');
    const result = runNodeScript(script);
    ok = line(result.ok, `offline ${label}`) && ok;
  }

  console.log('\n-- Live API (read-only) --');
  const e2eArgs = args.filter((a) => a.startsWith('--api'));
  if (!withApply) {
    e2eArgs.push('--read-only');
  } else {
    e2eArgs.push('--with-apply');
  }
  const live = runNodeScript('e2eEnrollStartTestCheck.js', e2eArgs);
  ok = line(live.ok, withApply ? 'live e2e with apply mutation' : 'live e2e read-only') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_ENROLLMENT_PHASE6_OK');
    process.exit(0);
  }
  console.error('VERIFY_ENROLLMENT_PHASE6_FAILED');
  process.exit(1);
}

main();

main();

main();
