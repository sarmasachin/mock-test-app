#!/usr/bin/env node
'use strict';

/**
 * "Add questions now" shortcut after state exam save.
 * Run: npm run verify:add-questions-shortcut
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Add questions now shortcut (Phase 1 #5) ===\n');
  let ok = true;

  const banner = fs.readFileSync(path.join(root, 'admin-web/src/components/AddQuestionsNowBanner.tsx'), 'utf8');
  const wizard = fs.readFileSync(path.join(root, 'admin-web/src/tabs/StateExamManagerTab.tsx'), 'utf8');
  const appTsx = fs.readFileSync(path.join(root, 'admin-web/src/App.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'admin-web/src/App.css'), 'utf8');

  ok = line(banner.includes('Add questions now'), 'banner component has CTA label') && ok;
  ok = line(wizard.includes('onOpenQuestionBuilder'), 'State Exam Manager accepts open callback') && ok;
  ok = line(wizard.includes('offerQuestionBuilderShortcut'), 'wizard offers shortcut after save') && ok;
  ok = line(wizard.includes('AddQuestionsNowBanner'), 'wizard renders shortcut banner') && ok;
  ok = line(appTsx.includes("setTab('questionBuilder')"), 'App switches to Question Builder tab') && ok;
  ok = line(appTsx.includes('setSelectedQuestionTestId(testId)'), 'App selects saved test in QB') && ok;
  ok = line(appTsx.includes('addQuestionsShortcut'), 'All Tests create can show shortcut') && ok;
  ok = line(css.includes('.add-questions-now-banner'), 'shortcut banner styles present') && ok;

  console.log(`\n${ok ? 'VERIFY_ADD_QUESTIONS_SHORTCUT_OK' : 'VERIFY_ADD_QUESTIONS_SHORTCUT_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
