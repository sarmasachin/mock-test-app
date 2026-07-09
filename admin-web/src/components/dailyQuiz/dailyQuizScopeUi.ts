export type DailyQuizScopeMode = 'all_india' | 'state';

export type DailyQuizBankItemScope = {
  scope?: DailyQuizScopeMode;
  targetStates?: string[];
  categoryId?: string | null;
};

export const DAILY_QUIZ_ACTIVE_TARGET_STORAGE = {
  scope: 'dailyQuizActiveTargetScope',
  state: 'dailyQuizActiveTargetState',
  categoryId: 'dailyQuizActiveCategoryId',
} as const;

export function normalizeDailyQuizScopeMode(value: unknown): DailyQuizScopeMode {
  return String(value || '').trim().toLowerCase() === 'state' ? 'state' : 'all_india';
}

export function loadDailyQuizActiveTarget(): {
  scope: DailyQuizScopeMode;
  stateName: string;
  categoryId: string;
} {
  if (typeof window === 'undefined') {
    return { scope: 'all_india', stateName: '', categoryId: '' };
  }
  const scope = normalizeDailyQuizScopeMode(window.localStorage.getItem(DAILY_QUIZ_ACTIVE_TARGET_STORAGE.scope));
  const stateName = String(window.localStorage.getItem(DAILY_QUIZ_ACTIVE_TARGET_STORAGE.state) || '').trim();
  const categoryId = String(window.localStorage.getItem(DAILY_QUIZ_ACTIVE_TARGET_STORAGE.categoryId) || '').trim();
  return { scope, stateName, categoryId };
}

export function saveDailyQuizActiveTarget(input: {
  scope: DailyQuizScopeMode;
  stateName: string;
  categoryId: string;
}): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DAILY_QUIZ_ACTIVE_TARGET_STORAGE.scope, input.scope);
  window.localStorage.setItem(DAILY_QUIZ_ACTIVE_TARGET_STORAGE.state, input.stateName.trim());
  window.localStorage.setItem(DAILY_QUIZ_ACTIVE_TARGET_STORAGE.categoryId, input.categoryId.trim());
}

/** Slug for optional category — mirrors server normalizeDailyQuizCategoryId. */
export function slugDailyQuizCategoryId(value: string): string {
  const raw = String(value || '').trim().slice(0, 80);
  if (!raw) return '';
  const slug = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(slug)) return '';
  return slug;
}

export function buildDailyQuizScopePostBody(input: {
  scope: DailyQuizScopeMode;
  stateName: string;
  categoryId: string;
}): DailyQuizBankItemScope & { scope: DailyQuizScopeMode } {
  const scope = normalizeDailyQuizScopeMode(input.scope);
  const categorySlug = slugDailyQuizCategoryId(input.categoryId);
  if (scope === 'state') {
    const stateName = String(input.stateName || '').trim();
    return {
      scope: 'state',
      targetStates: stateName ? [stateName] : [],
      ...(categorySlug ? { categoryId: categorySlug } : { categoryId: null }),
    };
  }
  return {
    scope: 'all_india',
    targetStates: [],
    ...(categorySlug ? { categoryId: categorySlug } : { categoryId: null }),
  };
}

export const DAILY_QUIZ_ANALYTICS_SCOPE_STORAGE = {
  quizScope: 'dailyQuizAnalyticsQuizScope',
  state: 'dailyQuizAnalyticsState',
} as const;

export type DailyQuizAnalyticsQuizScope = '' | DailyQuizScopeMode;

export function loadDailyQuizAnalyticsScopeFilter(): {
  quizScope: DailyQuizAnalyticsQuizScope;
  stateName: string;
} {
  if (typeof window === 'undefined') {
    return { quizScope: '', stateName: '' };
  }
  const raw = String(window.localStorage.getItem(DAILY_QUIZ_ANALYTICS_SCOPE_STORAGE.quizScope) || '').trim();
  const quizScope: DailyQuizAnalyticsQuizScope =
    raw === 'state' ? 'state' : raw === 'all_india' ? 'all_india' : '';
  const stateName = String(window.localStorage.getItem(DAILY_QUIZ_ANALYTICS_SCOPE_STORAGE.state) || '').trim();
  return { quizScope, stateName };
}

export function saveDailyQuizAnalyticsScopeFilter(input: {
  quizScope: DailyQuizAnalyticsQuizScope;
  stateName: string;
}): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DAILY_QUIZ_ANALYTICS_SCOPE_STORAGE.quizScope, input.quizScope);
  window.localStorage.setItem(DAILY_QUIZ_ANALYTICS_SCOPE_STORAGE.state, input.stateName.trim());
}

/** Admin analytics API params — omit quizScope when filter is off (legacy all data). */
export function buildDailyQuizAnalyticsScopeParams(input: {
  quizScope: DailyQuizAnalyticsQuizScope;
  stateName: string;
}): Record<string, string> {
  if (!input.quizScope) return {};
  if (input.quizScope === 'state' && !input.stateName.trim()) return {};
  const params: Record<string, string> = { quizScope: input.quizScope };
  if (input.quizScope === 'state') {
    params.state = input.stateName.trim();
  }
  return params;
}

export function formatDailyQuizAnalyticsScopeLabel(input: {
  quizScope: DailyQuizAnalyticsQuizScope;
  stateName: string;
}): string {
  if (!input.quizScope) return 'All data (no scope filter)';
  if (input.quizScope === 'state') {
    return input.stateName.trim() ? `State: ${input.stateName.trim()}` : 'State (select state)';
  }
  return 'All India quiz items';
}

export function formatDailyQuizScopeLabel(item: DailyQuizBankItemScope): string {
  const scope = normalizeDailyQuizScopeMode(item.scope);
  if (scope === 'state') {
    const states = Array.isArray(item.targetStates)
      ? item.targetStates.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (states.length) return states.join(', ');
    return 'State (unset)';
  }
  return 'All India';
}

export function mergeDailyQuizCategoryOptions(apiCategories: string[], bankItems: DailyQuizBankItemScope[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of apiCategories) {
    const slug = slugDailyQuizCategoryId(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  for (const item of bankItems) {
    const slug = slugDailyQuizCategoryId(String(item.categoryId || ''));
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function mapDailyQuizBankItem(raw: unknown): DailyQuizBankItemScope & Record<string, unknown> {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scope = normalizeDailyQuizScopeMode(row.scope);
  const targetStates = Array.isArray(row.targetStates)
    ? row.targetStates.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const categoryRaw = row.categoryId;
  const categoryId =
    categoryRaw == null || categoryRaw === '' ? null : slugDailyQuizCategoryId(String(categoryRaw)) || null;
  return {
    ...row,
    scope,
    targetStates: scope === 'all_india' ? [] : targetStates,
    categoryId,
  };
}
