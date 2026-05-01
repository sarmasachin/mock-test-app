#!/usr/bin/env node
/**
 * Post-build sanity check: auth card CSS tokens exist (layout regression guard).
 * Run: npm run build && npm run check:auth-layout
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

const required = [
  '.auth-page .login-card',
  '.auth-page .auth-shell',
  '.auth-float-form',
  '.input-box-float',
  '.auth-section-heading',
  '.auth-switch-tabs',
];

function main() {
  if (!existsSync(dist)) {
    console.error('FAIL: dist/ missing — run npm run build first.');
    process.exit(1);
  }
  const assets = join(dist, 'assets');
  if (!existsSync(assets)) {
    console.error('FAIL: dist/assets missing.');
    process.exit(1);
  }
  const cssFiles = readdirSync(assets).filter((f) => f.endsWith('.css'));
  if (!cssFiles.length) {
    console.error('FAIL: no CSS chunk in dist/assets.');
    process.exit(1);
  }
  let bundle = '';
  for (const f of cssFiles) {
    bundle += readFileSync(join(assets, f), 'utf8');
  }
  const missing = required.filter((token) => !bundle.includes(token));
  if (missing.length) {
    console.error('FAIL: built CSS missing selectors:', missing.join(', '));
    process.exit(1);
  }
  console.log('PASS: auth layout selectors present in', cssFiles.length, 'CSS chunk(s).');
  console.log('      Checked:', required.join(', '));
  process.exit(0);
}

main();
