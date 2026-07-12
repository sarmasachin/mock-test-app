import type { QuestionCountSyncPayload } from './questionCountSync';

export type ImportToastInput = {
  inserted: number;
  mode: 'append' | 'replace';
  sync: QuestionCountSyncPayload | null;
};

export type QuestionSaveToastInput = {
  isEdit: boolean;
  sync: QuestionCountSyncPayload | null;
  questionPublished: boolean;
};

function pluralQuestions(count: number): string {
  return `${count} question${count === 1 ? '' : 's'}`;
}

function formatBankSummary(sync: QuestionCountSyncPayload | null): string {
  if (!sync || sync.totalQuestionCount <= 0) return '';
  if (sync.publishedQuestionCount > 0) {
    return ` Bank now has ${pluralQuestions(sync.totalQuestionCount)} (${sync.publishedQuestionCount} published).`;
  }
  return ` Bank now has ${pluralQuestions(sync.totalQuestionCount)} (draft).`;
}

function formatPublishNextStep(sync: QuestionCountSyncPayload | null): string {
  const published = sync?.publishedQuestionCount ?? 0;
  if (published >= 1) {
    return ' Publish the test when ready.';
  }
  return ' Mark questions as published, then publish the test when ready.';
}

/** Phase 1 #6 — clear next step after bulk CSV/JSON import. */
export function buildImportSuccessToast(input: ImportToastInput): string {
  const inserted = Math.max(0, Math.trunc(Number(input.inserted) || 0));
  if (inserted < 1) {
    return 'No questions were imported. Check your file format and try again.';
  }

  const verb =
    input.mode === 'replace'
      ? `Replaced question bank with ${pluralQuestions(inserted)}.`
      : `${pluralQuestions(inserted)} added.`;

  return `${verb}${formatBankSummary(input.sync)}${formatPublishNextStep(input.sync)}`;
}

export function buildQuestionSaveSuccessToast(input: QuestionSaveToastInput): string {
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
  if (input.questionPublished) {
    return `Question added.${bank} Mark it published if needed, then publish the test when ready.`;
  }
  return `Question added.${bank} Mark questions as published, then publish the test when ready.`;
}

export function buildQuestionDeleteSuccessToast(sync: QuestionCountSyncPayload | null): string {
  const bank = formatBankSummary(sync);
  if ((sync?.publishedQuestionCount ?? 0) < 1) {
    return `Question deleted.${bank} Add published questions before publishing the test.`;
  }
  return `Question deleted.${bank}`;
}
