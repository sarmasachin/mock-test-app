export type QuestionImportTemplateFormat = 'csv' | 'excel' | 'json';

export const QUESTION_IMPORT_CSV_HEADERS = [
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
] as const;

function escapeCsvCell(value: string): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsvLine(values: string[]): string {
  return values.map(escapeCsvCell).join(',');
}

const SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    position: '1',
    subjectKey: '',
    stem: 'What is 2 + 2?',
    choiceA: '3',
    choiceB: '4',
    choiceC: '5',
    choiceD: '6',
    correctIndex: '1',
    explanation: 'Basic addition',
    isPublished: 'true',
  },
  {
    position: '2',
    subjectKey: 'gk',
    stem: 'Capital of India?',
    choiceA: 'Mumbai',
    choiceB: 'Delhi',
    choiceC: 'Kolkata',
    choiceD: 'Chennai',
    correctIndex: '1',
    explanation: 'New Delhi is the capital',
    isPublished: 'true',
  },
];

export function buildQuestionCsvTemplateContent(): string {
  const lines = [
    buildCsvLine([...QUESTION_IMPORT_CSV_HEADERS]),
    ...SAMPLE_ROWS.map((row) =>
      buildCsvLine(QUESTION_IMPORT_CSV_HEADERS.map((header) => row[header] ?? '')),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function buildQuestionExcelTemplateContent(): string {
  const header = QUESTION_IMPORT_CSV_HEADERS.join('\t');
  const body = SAMPLE_ROWS.map((row) =>
    QUESTION_IMPORT_CSV_HEADERS.map((header) => row[header] ?? '').join('\t'),
  );
  return `${[header, ...body].join('\r\n')}\r\n`;
}

export function buildQuestionJsonTemplateContent(): string {
  const items = SAMPLE_ROWS.map((row) => ({
    position: Number(row.position),
    subjectKey: row.subjectKey || '',
    stem: row.stem,
    choiceA: row.choiceA,
    choiceB: row.choiceB,
    choiceC: row.choiceC,
    choiceD: row.choiceD,
    correctIndex: Number(row.correctIndex),
    explanation: row.explanation,
    isPublished: row.isPublished !== 'false',
  }));
  return `${JSON.stringify(items, null, 2)}\n`;
}

export function templateFilenameForFormat(
  format: QuestionImportTemplateFormat,
  testTitle?: string,
): string {
  const slug = String(testTitle || 'questions')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'questions';
  if (format === 'json') return `${slug}-import-template.json`;
  if (format === 'excel') return `${slug}-import-template.tsv`;
  return `${slug}-import-template.csv`;
}

export function templateMimeTypeForFormat(format: QuestionImportTemplateFormat): string {
  if (format === 'json') return 'application/json;charset=utf-8';
  if (format === 'excel') return 'text/tab-separated-values;charset=utf-8';
  return 'text/csv;charset=utf-8';
}

export function buildQuestionImportTemplateContent(format: QuestionImportTemplateFormat): string {
  if (format === 'json') return buildQuestionJsonTemplateContent();
  if (format === 'excel') return buildQuestionExcelTemplateContent();
  return buildQuestionCsvTemplateContent();
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadQuestionImportTemplate(
  format: QuestionImportTemplateFormat,
  testTitle?: string,
): { filename: string; content: string } {
  const content = buildQuestionImportTemplateContent(format);
  const filename = templateFilenameForFormat(format, testTitle);
  downloadTextFile(filename, content, templateMimeTypeForFormat(format));
  return { filename, content };
}
