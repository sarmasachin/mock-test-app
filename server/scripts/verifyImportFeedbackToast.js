#!/usr/bin/env node
'use strict';

/**
 * Import / question-bank feedback toasts (Phase 1 #6).
 * Run: npm run verify:import-feedback-toast
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function pluralQuestions(count) {
  return `${count} question${count === 1 ? '' : 's'}`;
}

function formatBankSummary(sync) {
  if (!sync || sync.totalQuestionCount <= 0) return '';
  if (sync.publishedQuestionCount > 0) {
    return ` Bank now has ${pluralQuestions(sync.totalQuestionCount)} (${sync.publishedQuestionCount} published).`;
  }
  return ` Bank now has ${pluralQuestions(sync.totalQuestionCount)} (draft).`;
}

function formatPublishNextStep(sync) {
  const published = sync?.publishedQuestionCount ?? 0;
  if (published >= 1) return ' Publish the test when ready.';
  return ' Mark questions as published, then publish the test when ready.';
}

function buildImportSuccessToast(input) {
  const inserted = Math.max(0, Math.trunc(Number(input.inserted) || 0));
  if (inserted < 1) return 'No questions were imported. Check your file format and try again.';
  const verb =
    input.mode === 'replace'
      ? `Replaced question bank with ${pluralQuestions(inserted)}.`
      : `${pluralQuestions(inserted)} added.`;
  return `${verb}${formatBankSummary(input.sync)}${formatPublishNextStep(input.sync)}`;
}

function buildQuestionSaveSuccessToast(input) {
  if (input.isEdit) {
    const bank = formatBankSummary(input.sync);
    if (input.questionPublished && (input.sync?.publishedQuestionCount ?? 0) >= 1) {
      return `Question updated.${bank} Publish the test when ready.`;
    }
    return `Question updated.${bank}`;
  }
  const bank = formatBankSummary(input.sync);
  if (input.questionPublished && (input.sync?.publishedQuestionCount ?? 0) >= 1) {
    return `Question added.${bank} Publish the test when ready.`;
  }
  return `Question added.${bank} Mark questions as published, then publish the test when ready.`;
}

function buildQuestionDeleteSuccessToast(sync) {
  const bank = formatBankSummary(sync);
  if ((sync?.publishedQuestionCount ?? 0) < 1) {
    return `Question deleted.${bank} Add published questions before publishing the test.`;
  }
  return `Question deleted.${bank}`;
}

function main() {
  console.log('=== Import feedback toast (Phase 1 #6) ===\n');
  let ok = true;

  const feedbackPath = path.join(root, 'admin-web/src/lib/questionImportFeedback.ts');
  const appTsx = fs.readFileSync(path.join(root, 'admin-web/src/App.tsx'), 'utf8');
  const feedbackSrc = fs.readFileSync(feedbackPath, 'utf8');

  ok = line(fs.existsSync(feedbackPath), 'questionImportFeedback.ts exists') && ok;
  ok = line(appTsx.includes('buildImportSuccessToast'), 'App uses import success toast helper') && ok;
  ok = line(appTsx.includes('buildQuestionSaveSuccessToast'), 'App uses save toast helper') && ok;
  ok = line(feedbackSrc.includes('Publish the test when ready'), 'toast mentions publish next step') && ok;

  const importMsg = buildImportSuccessToast({
    inserted: 12,
    mode: 'append',
    sync: { questionCount: 12, totalQuestionCount: 12, publishedQuestionCount: 0 },
  });
  ok = line(importMsg.includes('12 questions added'), 'import toast shows inserted count') && ok;
  ok = line(importMsg.includes('Mark questions as published'), 'draft import guides publish guard') && ok;

  const importLive = buildImportSuccessToast({
    inserted: 5,
    mode: 'append',
    sync: { questionCount: 20, totalQuestionCount: 20, publishedQuestionCount: 20 },
  });
  ok = line(importLive.includes('Publish the test when ready'), 'published bank guides test publish') && ok;

  const replaceMsg = buildImportSuccessToast({
    inserted: 3,
    mode: 'replace',
    sync: { questionCount: 3, totalQuestionCount: 3, publishedQuestionCount: 1 },
  });
  ok = line(replaceMsg.includes('Replaced question bank'), 'replace mode wording') && ok;

  const saveMsg = buildQuestionSaveSuccessToast({
    isEdit: false,
    sync: { questionCount: 1, totalQuestionCount: 1, publishedQuestionCount: 1 },
    questionPublished: true,
  });
  ok = line(saveMsg.includes('Question added'), 'single add toast') && ok;

  const deleteMsg = buildQuestionDeleteSuccessToast({
    questionCount: 2,
    totalQuestionCount: 2,
    publishedQuestionCount: 0,
  });
  ok = line(deleteMsg.includes('Add published questions'), 'delete toast warns when no published left') && ok;

  console.log(`\n${ok ? 'VERIFY_IMPORT_FEEDBACK_TOAST_OK' : 'VERIFY_IMPORT_FEEDBACK_TOAST_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
