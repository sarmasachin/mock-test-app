import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatQuizDuration,
  normalizeDailyQuizLeaderboard,
  type DailyQuizAnswerReviewPrefill,
  type DailyQuizDashboardApiClient,
  type DailyQuizLeaderboardData,
} from './dailyQuizTypes';

type Props = {
  apiClient: DailyQuizDashboardApiClient;
  quizDay: string;
  tableReady: boolean;
  scopeParams: Record<string, string>;
  scopeLabel: string;
  scopeKey: string;
  onOpenAnswerReview: (prefill: DailyQuizAnswerReviewPrefill) => void;
};

export function DailyQuizLeaderboardPanel({
  apiClient,
  quizDay,
  tableReady,
  scopeParams,
  scopeLabel,
  scopeKey,
  onOpenAnswerReview,
}: Props) {
  const [data, setData] = useState<DailyQuizLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [limit, setLimit] = useState('100');

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
        limit,
        ...scopeParams,
      };
      if (appliedSearch.trim()) params.q = appliedSearch.trim();
      const res = await apiClient.get('/admin/daily-quiz/leaderboard', { params });
      setData(normalizeDailyQuizLeaderboard(res.data));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiClient, quizDay, appliedSearch, limit, scopeParams, scopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  if (!tableReady) {
    return (
      <div className="dq-placeholder" role="tabpanel" aria-label="Leaderboard">
        <h3>Leaderboard unavailable</h3>
        <p>Run migration <code>database/postgres/017_daily_quiz_attempts.sql</code> and restart the API.</p>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="dash-loading">Loading leaderboard…</div>;
  }

  if (!data) {
    return (
      <div className="dash-loading">
        Could not load leaderboard.{' '}
        <button type="button" className="dash-refresh" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label="Leaderboard">
      <div className="dq-leaderboard-toolbar">
        <form className="dq-leaderboard-search" onSubmit={handleSearchSubmit}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, or public ID"
            aria-label="Search leaderboard"
          />
          <button type="submit" className="dash-refresh">
            Search
          </button>
          {appliedSearch ? (
            <button
              type="button"
              className="dash-refresh"
              onClick={() => {
                setSearchInput('');
                setAppliedSearch('');
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
        <div className="dq-leaderboard-meta">
          <label>
            Show top
            <select value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Leaderboard limit">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
          <button type="button" className="dash-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="dq-recent-hint">
        {data.totalPlayers} player{data.totalPlayers === 1 ? '' : 's'} on {data.quizDay || quizDay}
        {appliedSearch ? ` · filter: “${appliedSearch}”` : ''}
        {scopeLabel ? ` · ${scopeLabel}` : ''}
        {' · '}Click a row to review answers.
      </p>

      <div className="dash-card dash-table-card dq-leaderboard-card">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Public ID</th>
              <th>Score</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: '#64748b' }}>
                  No players found for this quiz day{appliedSearch ? ' matching your search' : ''}.
                </td>
              </tr>
            ) : (
              data.entries.map((entry) => (
                <tr
                  key={`${entry.userId}-${entry.rank}`}
                  className="dq-recent-row"
                  role="button"
                  tabIndex={0}
                  title="Open Answer Review"
                  onClick={() =>
                    onOpenAnswerReview({
                      studentQ: entry.displayName,
                      quizDay: data.quizDay || quizDay,
                      questionQ: '',
                      userId: entry.userId || undefined,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenAnswerReview({
                        studentQ: entry.displayName,
                        quizDay: data.quizDay || quizDay,
                        questionQ: '',
                        userId: entry.userId || undefined,
                      });
                    }
                  }}
                >
                  <td>#{entry.rank}</td>
                  <td>
                    <div className="dq-leaderboard-player">{entry.displayName}</div>
                    {entry.email ? <div className="dq-leaderboard-email">{entry.email}</div> : null}
                  </td>
                  <td>{entry.publicId || '—'}</td>
                  <td>
                    {entry.correctCount}/{entry.totalQuestions}
                  </td>
                  <td>{formatQuizDuration(entry.timeTakenSeconds)}</td>
                  <td>
                    {entry.isPerfect ? (
                      <span className="dash-badge dq-badge-perfect">Perfect</span>
                    ) : (
                      <span className="dash-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
