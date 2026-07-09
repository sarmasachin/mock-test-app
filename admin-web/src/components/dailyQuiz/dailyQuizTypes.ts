export type DailyQuizStatsRange = '7d' | '30d' | '90d';

export type DailyQuizDashboardTab =
  | 'overview'
  | 'leaderboard'
  | 'questionAnalysis'
  | 'answerReview';

export type DailyQuizAdminStatsData = {
  rangeDays: number;
  tableReady: boolean;
  kpis: {
    totalAttempts: number;
    uniqueUsers: number;
    attemptsToday: number;
    uniqueUsersToday?: number;
    correctRatePct: number;
    avgTimeSeconds: number;
    publishedItems: number;
  };
  attemptsPerDay: {
    labels: string[];
    attempts: number[];
    uniqueUsers: number[];
  };
  outcomeSplit: { correct: number; wrong: number; skipped: number };
  recentActivity: Array<{
    student: string;
    quizDay: string;
    isCorrect: boolean;
    timeTakenSeconds: number;
    questionPrompt: string;
    submittedAt: string;
  }>;
};

export type DailyQuizAnswerReviewPrefill = {
  studentQ: string;
  quizDay: string;
  questionQ: string;
  userId?: string;
  itemId?: string;
};

export type DailyQuizQuestionAnalysisScope = 'day' | 'range';

export type DailyQuizQuestionAnalysisItem = {
  itemId: string;
  questionPrompt: string;
  correctIndex: number | null;
  attemptCount: number;
  correctCount: number;
  correctRatePct: number;
  avgTimeSeconds: number;
  skippedCount: number;
  optionPicks: number[];
  optionPickPct: number[];
  difficulty: 'easy' | 'medium' | 'hard' | 'unknown';
};

export type DailyQuizQuestionAnalysisData = {
  quizDay: string;
  scope: DailyQuizQuestionAnalysisScope;
  rangeDays: number;
  startDay: string;
  endDay: string;
  tableReady: boolean;
  totalQuestions: number;
  items: DailyQuizQuestionAnalysisItem[];
};

export function difficultyLabel(difficulty: DailyQuizQuestionAnalysisItem['difficulty']): string {
  if (difficulty === 'hard') return 'Hard';
  if (difficulty === 'easy') return 'Easy';
  if (difficulty === 'medium') return 'Medium';
  return '—';
}

export function normalizeDailyQuizQuestionAnalysis(raw: unknown): DailyQuizQuestionAnalysisData {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(r.items)
    ? r.items.map((row) => {
        const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const optionPicks = Array.isArray(o.optionPicks) ? o.optionPicks.map((x) => num(x)) : [0, 0, 0, 0];
        const optionPickPct = Array.isArray(o.optionPickPct) ? o.optionPickPct.map((x) => num(x)) : [0, 0, 0, 0];
        const ci = o.correctIndex;
        const correctIndex =
          ci == null || ci === '' || !Number.isFinite(Number(ci)) ? null : num(ci);
        const diffRaw = String(o.difficulty || 'medium').toLowerCase();
        const difficulty: DailyQuizQuestionAnalysisItem['difficulty'] =
          diffRaw === 'hard' || diffRaw === 'easy' || diffRaw === 'unknown' ? diffRaw : 'medium';
        return {
          itemId: String(o.itemId || ''),
          questionPrompt: String(o.questionPrompt || 'Question'),
          correctIndex,
          attemptCount: num(o.attemptCount),
          correctCount: num(o.correctCount),
          correctRatePct: num(o.correctRatePct),
          avgTimeSeconds: num(o.avgTimeSeconds),
          skippedCount: num(o.skippedCount),
          optionPicks: optionPicks.length === 4 ? optionPicks : [0, 0, 0, 0],
          optionPickPct: optionPickPct.length === 4 ? optionPickPct : [0, 0, 0, 0],
          difficulty,
        };
      })
    : [];
  const scopeRaw = String(r.scope || 'day').toLowerCase();
  return {
    quizDay: String(r.quizDay || '').slice(0, 10),
    scope: scopeRaw === 'range' ? 'range' : 'day',
    rangeDays: num(r.rangeDays, 7),
    startDay: String(r.startDay || '').slice(0, 10),
    endDay: String(r.endDay || '').slice(0, 10),
    tableReady: r.tableReady !== false,
    totalQuestions: num(r.totalQuestions, items.length),
    items,
  };
}

export type DailyQuizAnswerReviewResultFilter = 'all' | 'correct' | 'wrong' | 'skipped';

export type DailyQuizAnswerReviewAttempt = {
  id: number;
  userId: string;
  displayName: string;
  email: string | null;
  publicId: string | null;
  quizDay: string;
  itemId: string;
  selectedOptionIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  isSkipped: boolean;
  timeTakenSeconds: number;
  questionPrompt: string;
  options: string[];
  explanation: string;
  clientSubmissionId: string | null;
  submittedAt: string;
};

export type DailyQuizAnswerReviewData = {
  quizDay: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  result: DailyQuizAnswerReviewResultFilter;
  searchQ: string | null;
  userId: string | null;
  itemId: string | null;
  tableReady: boolean;
  attempts: DailyQuizAnswerReviewAttempt[];
};

export type DailyQuizAnswerReviewSession = {
  userId: string;
  quizDay: string;
  displayName: string;
  clientSubmissionId: string | null;
  tableReady: boolean;
  summary: {
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    totalQuestions: number;
    timeTakenSeconds: number;
  };
  attempts: DailyQuizAnswerReviewAttempt[];
};

export function normalizeDailyQuizAnswerReviewAttempt(raw: unknown): DailyQuizAnswerReviewAttempt {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const selectedRaw = o.selectedOptionIndex;
  const selectedOptionIndex =
    selectedRaw == null || selectedRaw === '' ? null : num(selectedRaw);
  const options = Array.isArray(o.options) ? o.options.map((x) => String(x || '')).slice(0, 4) : [];
  return {
    id: num(o.id),
    userId: String(o.userId || ''),
    displayName: String(o.displayName || 'Player'),
    email: o.email == null ? null : String(o.email),
    publicId: o.publicId == null ? null : String(o.publicId),
    quizDay: String(o.quizDay || '').slice(0, 10),
    itemId: String(o.itemId || ''),
    selectedOptionIndex,
    correctIndex: num(o.correctIndex),
    isCorrect: Boolean(o.isCorrect),
    isSkipped: Boolean(o.isSkipped) || selectedOptionIndex == null,
    timeTakenSeconds: num(o.timeTakenSeconds),
    questionPrompt: String(o.questionPrompt || ''),
    options,
    explanation: String(o.explanation || ''),
    clientSubmissionId: o.clientSubmissionId == null ? null : String(o.clientSubmissionId),
    submittedAt: String(o.submittedAt || ''),
  };
}

export function normalizeDailyQuizAnswerReview(raw: unknown): DailyQuizAnswerReviewData {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const resultRaw = String(r.result || 'all').toLowerCase();
  const result: DailyQuizAnswerReviewResultFilter =
    resultRaw === 'correct' || resultRaw === 'wrong' || resultRaw === 'skipped' ? resultRaw : 'all';
  const attempts = Array.isArray(r.attempts)
    ? r.attempts.map((row) => normalizeDailyQuizAnswerReviewAttempt(row))
    : [];
  return {
    quizDay: String(r.quizDay || '').slice(0, 10),
    page: Math.max(1, num(r.page, 1)),
    limit: Math.max(1, num(r.limit, 50)),
    total: num(r.total),
    totalPages: num(r.totalPages),
    result,
    searchQ: r.searchQ == null ? null : String(r.searchQ),
    userId: r.userId == null ? null : String(r.userId),
    itemId: r.itemId == null ? null : String(r.itemId),
    tableReady: r.tableReady !== false,
    attempts,
  };
}

export function normalizeDailyQuizAnswerReviewSession(raw: unknown): DailyQuizAnswerReviewSession {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const s = r.summary && typeof r.summary === 'object' ? (r.summary as Record<string, unknown>) : {};
  const attempts = Array.isArray(r.attempts)
    ? r.attempts.map((row) => normalizeDailyQuizAnswerReviewAttempt(row))
    : [];
  return {
    userId: String(r.userId || ''),
    quizDay: String(r.quizDay || '').slice(0, 10),
    displayName: String(r.displayName || 'Player'),
    clientSubmissionId: r.clientSubmissionId == null ? null : String(r.clientSubmissionId),
    tableReady: r.tableReady !== false,
    summary: {
      correctCount: num(s.correctCount),
      wrongCount: num(s.wrongCount),
      skippedCount: num(s.skippedCount),
      totalQuestions: num(s.totalQuestions),
      timeTakenSeconds: num(s.timeTakenSeconds),
    },
    attempts,
  };
}

export type DailyQuizLeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  email: string | null;
  publicId: string | null;
  correctCount: number;
  totalQuestions: number;
  isPerfect: boolean;
  timeTakenSeconds: number;
};

export type DailyQuizLeaderboardData = {
  quizDay: string;
  totalPlayers: number;
  searchQ: string | null;
  tableReady: boolean;
  entries: DailyQuizLeaderboardEntry[];
};

export function formatQuizDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function normalizeDailyQuizLeaderboard(raw: unknown): DailyQuizLeaderboardData {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const entries = Array.isArray(r.entries)
    ? r.entries.map((row) => {
        const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const correctCount = num(o.correctCount);
        const totalQuestions = num(o.totalQuestions);
        return {
          rank: num(o.rank),
          userId: String(o.userId || ''),
          displayName: String(o.displayName || 'Player'),
          email: o.email == null ? null : String(o.email),
          publicId: o.publicId == null ? null : String(o.publicId),
          correctCount,
          totalQuestions,
          isPerfect: Boolean(o.isPerfect) || (totalQuestions > 0 && correctCount === totalQuestions),
          timeTakenSeconds: num(o.timeTakenSeconds),
        };
      })
    : [];
  return {
    quizDay: String(r.quizDay || '').slice(0, 10),
    totalPlayers: num(r.totalPlayers),
    searchQ: r.searchQ == null ? null : String(r.searchQ),
    tableReady: r.tableReady !== false,
    entries,
  };
}

export type DailyQuizDashboardApiClient = {
  get: (url: string, config?: { params?: Record<string, string> }) => Promise<{ data: unknown }>;
};

function num(v: unknown, d = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

/** UTC calendar day — matches server `quiz_day` storage. */
export function todayQuizDayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDailyQuizAdminStats(raw: unknown): DailyQuizAdminStatsData {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const kp = r.kpis && typeof r.kpis === 'object' ? (r.kpis as Record<string, unknown>) : {};
  const apd = r.attemptsPerDay && typeof r.attemptsPerDay === 'object'
    ? (r.attemptsPerDay as Record<string, unknown>)
    : {};
  const os = r.outcomeSplit && typeof r.outcomeSplit === 'object'
    ? (r.outcomeSplit as Record<string, unknown>)
    : {};
  const labels = Array.isArray(apd.labels) ? apd.labels.map((x) => String(x)) : [];
  const attempts = Array.isArray(apd.attempts) ? apd.attempts.map((x) => num(x)) : [];
  const uniqueUsers = Array.isArray(apd.uniqueUsers) ? apd.uniqueUsers.map((x) => num(x)) : [];
  const recentActivity = Array.isArray(r.recentActivity)
    ? r.recentActivity.map((row) => {
        const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        return {
          student: String(o.student || 'User'),
          quizDay: String(o.quizDay || ''),
          isCorrect: Boolean(o.isCorrect),
          timeTakenSeconds: num(o.timeTakenSeconds),
          questionPrompt: String(o.questionPrompt || ''),
          submittedAt: String(o.submittedAt || ''),
        };
      })
    : [];

  return {
    rangeDays: num(r.rangeDays, 7),
    tableReady: r.tableReady !== false,
    kpis: {
      totalAttempts: num(kp.totalAttempts),
      uniqueUsers: num(kp.uniqueUsers),
      attemptsToday: num(kp.attemptsToday),
      uniqueUsersToday: num(kp.uniqueUsersToday),
      correctRatePct: num(kp.correctRatePct),
      avgTimeSeconds: num(kp.avgTimeSeconds),
      publishedItems: num(kp.publishedItems),
    },
    attemptsPerDay: { labels, attempts, uniqueUsers },
    outcomeSplit: {
      correct: num(os.correct),
      wrong: num(os.wrong),
      skipped: num(os.skipped),
    },
    recentActivity,
  };
}

export const DAILY_QUIZ_DASHBOARD_TABS: ReadonlyArray<{
  id: DailyQuizDashboardTab;
  label: string;
  description: string;
}> = [
  { id: 'overview', label: 'Overview', description: 'Trends and recent activity' },
  { id: 'leaderboard', label: 'Leaderboard', description: 'Daily player rankings' },
  { id: 'questionAnalysis', label: 'Question Analysis', description: 'Per-question performance' },
  { id: 'answerReview', label: 'Answer Review', description: 'Student answer details' },
];
