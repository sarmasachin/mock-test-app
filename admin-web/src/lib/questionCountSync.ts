export type QuestionCountSyncPayload = {
  questionCount: number;
  totalQuestionCount: number;
  publishedQuestionCount: number;
};

export function parseQuestionCountSyncPayload(
  data: Record<string, unknown> | null | undefined,
): QuestionCountSyncPayload | null {
  if (!data || typeof data !== 'object') return null;
  const questionCount = Number(data.questionCount);
  if (!Number.isFinite(questionCount) || questionCount <= 0) return null;
  return {
    questionCount: Math.trunc(questionCount),
    totalQuestionCount: Math.max(0, Math.trunc(Number(data.totalQuestionCount) || 0)),
    publishedQuestionCount: Math.max(0, Math.trunc(Number(data.publishedQuestionCount) || 0)),
  };
}

export function formatQuestionCountSyncHint(sync: QuestionCountSyncPayload): string {
  if (sync.publishedQuestionCount > 0 && sync.publishedQuestionCount !== sync.totalQuestionCount) {
    return `${sync.questionCount} in test (${sync.publishedQuestionCount} published, ${sync.totalQuestionCount} total)`;
  }
  if (sync.totalQuestionCount > 0) {
    return `${sync.questionCount} question${sync.questionCount === 1 ? '' : 's'} in bank`;
  }
  return `${sync.questionCount} (set count — add questions in Question Builder)`;
}
