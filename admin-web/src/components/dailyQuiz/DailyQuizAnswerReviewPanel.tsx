import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';
import {
  formatQuizDuration,
  normalizeDailyQuizAnswerReview,
  normalizeDailyQuizAnswerReviewSession,
  type DailyQuizAnswerReviewAttempt,
  type DailyQuizAnswerReviewPrefill,
  type DailyQuizAnswerReviewResultFilter,
  type DailyQuizAnswerReviewSession,
  type DailyQuizDashboardApiClient,
} from './dailyQuizTypes';

type Props = {
  apiClient: DailyQuizDashboardApiClient;
  quizDay: string;
  tableReady: boolean;
  prefill: DailyQuizAnswerReviewPrefill | null;
  scopeParams: Record<string, string>;
  scopeLabel: string;
  scopeKey: string;
  onClearPrefill: () => void;
};

const OPTION_LABELS = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];

function resultBadge(attempt: DailyQuizAnswerReviewAttempt) {
  if (attempt.isSkipped) {
    return { label: 'Skipped', bg: '#f1f5f9', color: '#64748b' };
  }
  if (attempt.isCorrect) {
    return { label: 'Correct', bg: '#dcfce7', color: '#166534' };
  }
  return { label: 'Wrong', bg: '#fee2e2', color: '#b91c1c' };
}

function selectedLabel(attempt: DailyQuizAnswerReviewAttempt): string {
  if (attempt.isSkipped) return '—';
  const idx = attempt.selectedOptionIndex;
  if (idx == null || idx < 0 || idx > 3) return '—';
  return OPTION_LABELS[idx] || `#${idx + 1}`;
}

function correctLabel(attempt: DailyQuizAnswerReviewAttempt): string {
  const idx = attempt.correctIndex;
  if (idx < 0 || idx > 3) return '—';
  return OPTION_LABELS[idx] || `#${idx + 1}`;
}

function AnswerDetailBlock({ attempt }: { attempt: DailyQuizAnswerReviewAttempt }) {
  return (
    <div className="dq-ar-detail">
      <div className="dq-ar-detail-q">{attempt.questionPrompt || 'Question'}</div>
      <div className="dq-ar-options">
        {(attempt.options.length ? attempt.options : ['—', '—', '—', '—']).map((text, idx) => {
          const isCorrect = idx === attempt.correctIndex;
          const isSelected = idx === attempt.selectedOptionIndex;
          let cls = 'dq-ar-opt';
          if (isCorrect && isSelected) cls += ' dq-ar-opt-selected-correct';
          else if (isCorrect) cls += ' dq-ar-opt-correct';
          else if (isSelected) cls += ' dq-ar-opt-wrong';
          return (
            <div key={`${attempt.id}-opt-${idx}`} className={cls}>
              <span className="dq-ar-opt-tag">{OPTION_LABELS[idx] || `#${idx + 1}`}</span>
              <span>{text || '—'}</span>
            </div>
          );
        })}
      </div>
      {attempt.explanation ? (
        <div className="dq-ar-explanation">
          <strong>Explanation:</strong> {attempt.explanation}
        </div>
      ) : null}
      <div className="dq-ar-meta">
        Submitted:{' '}
        {attempt.submittedAt
          ? new Date(attempt.submittedAt).toLocaleString('en-IN', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '—'}
        {' · '}Item ID: {attempt.itemId}
      </div>
    </div>
  );
}

export function DailyQuizAnswerReviewPanel({
  apiClient,
  quizDay,
  tableReady,
  prefill,
  scopeParams,
  scopeLabel,
  scopeKey,
  onClearPrefill,
}: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [result, setResult] = useState<DailyQuizAnswerReviewResultFilter>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState('50');
  const [data, setData] = useState<ReturnType<typeof normalizeDailyQuizAnswerReview> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [session, setSession] = useState<DailyQuizAnswerReviewSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.userId) setFilterUserId(prefill.userId);
    if (prefill.itemId) setFilterItemId(prefill.itemId);
    if (prefill.studentQ) {
      setSearchInput(prefill.studentQ);
      setAppliedSearch(prefill.studentQ);
    } else if (prefill.questionQ) {
      setSearchInput(prefill.questionQ);
      setAppliedSearch(prefill.questionQ);
    }
    setPage(1);
    setExpandedId(null);
    setSession(null);
  }, [prefill]);

  const load = useCallback(async () => {
    if (!quizDay) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string> = {
        quizDay,
        page: String(page),
        limit,
        result,
        ...scopeParams,
      };
      if (filterUserId.trim()) params.userId = filterUserId.trim();
      if (filterItemId.trim()) params.itemId = filterItemId.trim();
      if (appliedSearch.trim()) params.q = appliedSearch.trim();
      const res = await apiClient.get('/admin/daily-quiz/answer-review', { params });
      setData(normalizeDailyQuizAnswerReview(res.data));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiClient, quizDay, page, limit, result, filterUserId, filterItemId, appliedSearch, scopeParams, scopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [quizDay, result, appliedSearch, filterUserId, filterItemId, scopeKey]);

  async function loadSession(userId: string, day: string) {
    setSessionLoading(true);
    try {
      const res = await apiClient.get('/admin/daily-quiz/answer-review/session', {
        params: { userId, quizDay: day, ...scopeParams },
      });
      setSession(normalizeDailyQuizAnswerReviewSession(res.data));
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  function handleClearFilters() {
    setSearchInput('');
    setAppliedSearch('');
    setFilterUserId('');
    setFilterItemId('');
    setResult('all');
    setPage(1);
    setExpandedId(null);
    setSession(null);
    onClearPrefill();
  }

  if (!tableReady) {
    return (
      <div className="dq-placeholder" role="tabpanel" aria-label="Answer Review">
        <h3>Answer Review unavailable</h3>
        <p>Run migration <code>database/postgres/017_daily_quiz_attempts.sql</code> and restart the API.</p>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="dash-loading">Loading answer review…</div>;
  }

  if (!data) {
    return (
      <div className="dash-loading">
        Could not load answer review.{' '}
        <button type="button" className="dash-refresh" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label="Answer Review">
      {prefill ? (
        <div className="dq-ar-prefill">
          <div>
            <strong>Filtered view</strong>
            {prefill.studentQ ? ` · ${prefill.studentQ}` : ''}
            {prefill.itemId ? ` · Q: ${prefill.itemId}` : ''}
          </div>
          <button type="button" className="dash-refresh" onClick={handleClearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      <div className="dq-leaderboard-toolbar">
        <form className="dq-leaderboard-search" onSubmit={handleSearchSubmit}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search student, email, question, item ID"
            aria-label="Search answer review"
          />
          <button type="submit" className="dash-refresh">
            Search
          </button>
        </form>
        <div className="dq-qa-scope">
          <label>
            Result
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as DailyQuizAnswerReviewResultFilter)}
              aria-label="Result filter"
            >
              <option value="all">All</option>
              <option value="correct">Correct</option>
              <option value="wrong">Wrong</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>
          <button type="button" className="dash-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="dq-recent-hint">
        {data.total} attempt{data.total === 1 ? '' : 's'} on {data.quizDay || quizDay}
        {scopeLabel ? ` · ${scopeLabel}` : ''}
        {' · '}Page {data.page}{data.totalPages > 0 ? ` of ${data.totalPages}` : ''}
        {' · '}Click a row to expand answer snapshot (shuffled options as user saw them).
      </p>

      {session ? (
        <div className="dash-card dq-ar-session-card">
          <div className="dq-ar-session-head">
            <div>
              <strong>{session.displayName}</strong> — full session ({session.quizDay})
              <div className="dq-leaderboard-email">
                {session.summary.correctCount}/{session.summary.totalQuestions} correct ·{' '}
                {formatQuizDuration(session.summary.timeTakenSeconds)}
              </div>
            </div>
            <button type="button" className="dash-refresh" onClick={() => setSession(null)}>
              Close session
            </button>
          </div>
          {session.attempts.map((attempt) => (
            <div key={`session-${attempt.id}`} className="dq-ar-session-item">
              <AnswerDetailBlock attempt={attempt} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="dash-card dash-table-card dq-leaderboard-card">
        <table className="dq-qa-table">
          <thead>
            <tr>
              <th aria-label="Expand" />
              <th>Student</th>
              <th>Question</th>
              <th>Selected</th>
              <th>Correct</th>
              <th>Result</th>
              <th>Time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.attempts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: '#64748b' }}>
                  No attempts match your filters.
                </td>
              </tr>
            ) : (
              data.attempts.map((attempt) => {
                const expanded = expandedId === attempt.id;
                const badge = resultBadge(attempt);
                return (
                  <Fragment key={attempt.id}>
                    <tr
                      className="dq-recent-row"
                      onClick={() => setExpandedId(expanded ? null : attempt.id)}
                    >
                      <td className="dq-qa-expand">{expanded ? '▾' : '▸'}</td>
                      <td>
                        <div className="dq-leaderboard-player">{attempt.displayName}</div>
                        {attempt.email ? <div className="dq-leaderboard-email">{attempt.email}</div> : null}
                      </td>
                      <td>
                        <div className="dq-qa-prompt">{attempt.questionPrompt}</div>
                      </td>
                      <td>{selectedLabel(attempt)}</td>
                      <td>{correctLabel(attempt)}</td>
                      <td>
                        <span className="dash-badge" style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td>{attempt.timeTakenSeconds}s</td>
                      <td>
                        <button
                          type="button"
                          className="dash-refresh dq-qa-review-btn"
                          disabled={sessionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            void loadSession(attempt.userId, attempt.quizDay || quizDay);
                          }}
                        >
                          Session
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="dq-qa-detail-row">
                        <td colSpan={8}>
                          <AnswerDetailBlock attempt={attempt} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 ? (
        <div className="dq-ar-pagination">
          <button
            type="button"
            className="dash-refresh"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            className="dash-refresh"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
