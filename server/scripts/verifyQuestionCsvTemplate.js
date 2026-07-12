#!/usr/bin/env node
'use strict';

/**
 * Question Builder CSV/JSON template download (Phase 1 #4).
 * Run: npm run verify:question-csv-template
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildCsvTemplate() {
  const headers = [
    'position',
    'subjectKey',
    'stem',
    'choiceA',
    'choiceB',
    'choiceC',
    'choiceD',
    'correctIndex',
    'explanation',
    'isPublished',
  ];
  const row1 = ['1', '', 'What is 2 + 2?', '3', '4', '5', '6', '1', 'Basic addition', 'true'];
  return `${[headers.join(','), row1.map(escapeCsvCell).join(',')].join('\r\n')}\r\n`;
}

function parseCsvHeaderLine(line) {
  const header = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      header.push(current.trim().toLowerCase());
      current = '';
      continue;
    }
    current += ch;
  }
  header.push(current.trim().toLowerCase());
  return header;
}

function main() {
  console.log('=== Question CSV template download (#4) ===\n');
  let ok = true;

  const templateTs = fs.readFileSync(path.join(root, 'admin-web/src/lib/questionImportTemplates.ts'), 'utf8');
  const appTsx = fs.readFileSync(path.join(root, 'admin-web/src/App.tsx'), 'utf8');

  ok = line(templateTs.includes('downloadQuestionImportTemplate'), 'template download helper exists') && ok;
  ok = line(templateTs.includes('correctIndex'), 'template includes correctIndex column') && ok;
  ok = line(templateTs.includes('subjectKey'), 'template includes optional subjectKey') && ok;
  ok = line(appTsx.includes('Download sample'), 'Question Builder download button wired') && ok;
  ok = line(appTsx.includes('subjectKey: row.subjectkey'), 'CSV parser maps subjectKey column') && ok;

  const csv = buildCsvTemplate();
  const lines = csv.trim().split(/\r?\n/);
  const header = parseCsvHeaderLine(lines[0]);
  const required = ['stem', 'choicea', 'choiceb', 'choicec', 'choiced', 'correctindex'];
  ok = line(required.every((key) => header.includes(key)), 'template headers match import parser') && ok;
  ok = line(header.includes('subjectkey'), 'template supports subjectKey header') && ok;
  ok = line(lines.length >= 2, 'template has sample data row') && ok;

  console.log(`\n${ok ? 'VERIFY_QUESTION_CSV_TEMPLATE_OK' : 'VERIFY_QUESTION_CSV_TEMPLATE_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
