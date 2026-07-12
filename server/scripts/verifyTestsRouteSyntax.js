#!/usr/bin/env node
'use strict';

/**
 * Guard against tests.js import destructuring duplicates (crashes Node at startup).
 * Run: npm run verify:tests-route-syntax
 */

const fs = require('fs');
const path = require('path');

const testsPath = path.join(__dirname, '..', 'src', 'routes', 'tests.js');
const src = fs.readFileSync(testsPath, 'utf8');
const importRe = /const\s*\{([\s\S]*?)\}\s*=\s*require\('\.\.\/lib\/testApplicationCycle'\)/;
const match = src.match(importRe);

if (!match) {
  console.error('VERIFY_TESTS_ROUTE_SYNTAX_FAILED: testApplicationCycle import block not found');
  process.exit(1);
}

const names = match[1]
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean);

const seen = new Set();
let ok = true;
for (const name of names) {
  if (seen.has(name)) {
    console.error(`VERIFY_TESTS_ROUTE_SYNTAX_FAILED: duplicate import "${name}" in tests.js`);
    ok = false;
  }
  seen.add(name);
}

try {
  require(testsPath);
} catch (e) {
  console.error('VERIFY_TESTS_ROUTE_SYNTAX_FAILED: require(tests.js) threw:', e.message);
  process.exit(1);
}

if (!ok) process.exit(1);
console.log('VERIFY_TESTS_ROUTE_SYNTAX_OK');
