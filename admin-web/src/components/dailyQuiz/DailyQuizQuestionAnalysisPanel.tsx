import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  difficultyLabel,
  normalizeDailyQuizQuestionAnalysis,
  type DailyQuizAnswerReviewPrefill,
  type DailyQuizDashboardApiClient,
  type DailyQuizQuestionAnalysisData,
  type DailyQuizQuestionAnalysisScope,
  type DailyQuizStatsRange,
} from './dailyQuizTypes';

type Props = {
  apiClient: DailyQuizDashboardApiClient;
  quizDay: string;
  statsRange: DailyQuizStatsRange;
  tableReady: boolean;
  scopeParams: Record<string, string>;
  scopeLabel: string;
  scopeKey: string;
  onOpenAnswerReview: (prefill: DailyQuizAnswerReviewPrefill) => void;
};

const OPTION_LABELS = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];

function statsRangeToDays(range: DailyQuizStatsRange): string {
  if (range === '30d') return '30';
  if (range === '90d') return '90';
  return '7';
}

export function DailyQuizQuestionAnalysisPanel({
  apiClient,
  quizDay,
  statsRange,
  tableReady,
  scopeParams,
  scopeLabel,
  scopeKey,
  onOpenAnswerReview,
}: Props) {
  const [scope, setScope] = useState<DailyQuizQuestionAnalysisScope>('day');
  const [rangeDays, setRangeDays] = useState(statsRangeToDays(statsRange));
  const [data, setData] = useState<DailyQuizQuestionAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState('');

  useEffect(() => {
    setRangeDays(statsRangeToDays(statsRange));
  }, [statsRange]);

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
        scope,
        ...scopeParams,
      };
      if (scope === 'range') params.rangeDays = rangeDays;
      const res = await apiClient.get('/admin/daily-quiz/question-analysis', { params });
      setData(normalizeDailyQuizQuestionAnalysis(res.data));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiClient, quizDay, scope, rangeDays, scopeParams, scopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setExpandedItemId('');
  }, [quizDay, scope, rangeDays, scopeKey]);

  if (!tableReady) {
    return (
      <div className="dq-placeholder" role="tabpanel" aria-label="Question Analysis">
        <h3>Question Analysis unavailable</h3>
        <p>Run migration <code>database/postgres/017_daily_quiz_attempts.sql</code> and restart the API.</p>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="dash-loading">Loading question analysis…</div>;
  }

  if (!data) {
    return (
      <div className="dash-loading">
        Could not load question analysis.{' '}
        <button type="button" className="dash-refresh" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label="Question Analysis">
      <div className="dq-leaderboard-toolbar">
        <div className="dq-qa-scope">
          <label>
            Scope
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as DailyQuizQuestionAnalysisScope)}
              aria-label="Analysis scope"
            >
              <option value="day">This quiz day only</option>
              <option value="range">Date range ending on quiz day</option>
            </select>
          </label>
          {scope === 'range' ? (
            <label>
              Days
              <select value={rangeDays} onChange={(e) => setRangeDays(e.target.value)} aria-label="Range days">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
          ) : null}
        </div>
        <button type="button" className="dash-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      <p className="dq-recent-hint">
        {data.totalQuestions} question{data.totalQuestions === 1 ? '' : 's'} ·{' '}
        {data.startDay === data.endDay ? data.endDay : `${data.startDay} → ${data.endDay}`}
        {scopeLabel ? ` · ${scopeLabel}` : ''}
        {' · '}Sorted hardest first · Options are shuffled per user (slots 1–4).
      </p>

      <div className="dash-card dash-table-card dq-leaderboard-card">
        <table className="dq-qa-table">
          <thead>
            <tr>
              <th aria-label="Expand" />
              <th>Question</th>
              <th>Attempts</th>
              <th>Correct %</th>
              <th>Avg time</th>
              <th>Difficulty</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: '#64748b' }}>
                  No attempts found for this period.
                </td>
              </tr>
            ) : (
              data.items.map((item) => {
                const expanded = expandedItemId === item.itemId;
                return (
                  <Fragment key={item.itemId}>
                    <tr
                      className="dq-recent-row"
                      onClick={() => setExpandedItemId(expanded ? '' : item.itemId)}
                    >
                      <td className="dq-qa-expand">{expanded ? '▾' : '▸'}</td>
                      <td>
                        <div className="dq-qa-prompt">{item.questionPrompt}</div>
                        <div className="dq-leaderboard-email">ID: {item.itemId}</div>
                      </td>
                      <td>{item.attemptCount}</td>
                      <td>{item.correctRatePct}%</td>
                      <td>{item.avgTimeSeconds}s</td>
                      <td>
                        <span className={`dash-badge dq-diff-${item.difficulty}`}>
                          {difficultyLabel(item.difficulty)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dash-refresh dq-qa-review-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAnswerReview({
                              studentQ: '',
                              quizDay: data.endDay || quizDay,
                              questionQ: item.questionPrompt,
                              itemId: item.itemId,
                            });
                          }}
                        >
                          View answers
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="dq-qa-detail-row">
                        <td colSpan={7}>
                          <div className="dq-qa-detail">
                            <div className="dq-qa-detail-title">Option pick distribution (displayed slots)</div>
                            {OPTION_LABELS.map((label, idx) => {
                              const pct = item.optionPickPct[idx] ?? 0;
                              const picks = item.optionPicks[idx] ?? 0;
                              const isCorrectSlot = item.correctIndex === idx;
                              return (
                                <div key={`${item.itemId}-opt-${idx}`} className="dq-option-row">
                                  <div className="dq-option-label">
                                    {label}
                                    {isCorrectSlot ? ' ✓' : ''}
                                  </div>
                                  <div className="dq-option-bar-track">
                                    <div
                                      className={`dq-option-bar-fill${isCorrectSlot ? ' dq-option-bar-correct' : ''}`}
                                      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                    />
                                  </div>
                                  <div className="dq-option-pct">
                                    {pct}% ({picks})
                                  </div>
                                </div>
                              );
                            })}
                            {item.skippedCount > 0 ? (
                              <div className="dq-qa-skipped">Skipped: {item.skippedCount}</div>
                            ) : null}
                          </div>
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
    </div>
  );
}
