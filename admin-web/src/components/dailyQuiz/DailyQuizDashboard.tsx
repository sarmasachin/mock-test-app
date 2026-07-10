import { useCallback, useEffect, useState } from 'react';
import '../../dashboardAnalytics.css';
import './dailyQuizDashboard.css';
import { DailyQuizAnswerReviewPanel } from './DailyQuizAnswerReviewPanel';
import { DailyQuizDeliveryScopeFilter } from './DailyQuizDeliveryScopeFilter';
import { DailyQuizLeaderboardPanel } from './DailyQuizLeaderboardPanel';
import { DailyQuizOverviewPanel } from './DailyQuizOverviewPanel';
import { DailyQuizQuestionAnalysisPanel } from './DailyQuizQuestionAnalysisPanel';
import {
  DAILY_QUIZ_ANALYTICS_TABS,
  normalizeDailyQuizAdminStats,
  todayQuizDayUtc,
  type DailyQuizAdminStatsData,
  type DailyQuizAnalyticsTab,
  type DailyQuizAnswerReviewPrefill,
  type DailyQuizDashboardApiClient,
  type DailyQuizStatsRange,
} from './dailyQuizTypes';
import {
  buildDailyQuizAnalyticsScopeParams,
  formatDailyQuizAnalyticsScopeLabel,
  loadDailyQuizAnalyticsScopeFilter,
  saveDailyQuizAnalyticsScopeFilter,
  type DailyQuizAnalyticsQuizScope,
} from './dailyQuizScopeUi';

type Props = {
  apiClient: DailyQuizDashboardApiClient;
};

export function DailyQuizDashboard({ apiClient }: Props) {
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<DailyQuizAnalyticsTab | null>(null);
  const [range, setRange] = useState<DailyQuizStatsRange>('7d');
  const [quizDay, setQuizDay] = useState(todayQuizDayUtc);
  const [data, setData] = useState<DailyQuizAdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerReviewPrefill, setAnswerReviewPrefill] = useState<DailyQuizAnswerReviewPrefill | null>(
    null,
  );
  const initialScope = loadDailyQuizAnalyticsScopeFilter();
  const [analyticsQuizScope, setAnalyticsQuizScope] = useState<DailyQuizAnalyticsQuizScope>(
    initialScope.quizScope,
  );
  const [analyticsStateName, setAnalyticsStateName] = useState(initialScope.stateName);
  const [signupStateOptions, setSignupStateOptions] = useState<string[]>([]);

  const analyticsScopeParams = buildDailyQuizAnalyticsScopeParams({
    quizScope: analyticsQuizScope,
    stateName: analyticsStateName,
  });
  const analyticsScopeLabel = formatDailyQuizAnalyticsScopeLabel({
    quizScope: analyticsQuizScope,
    stateName: analyticsStateName,
  });
  const analyticsScopeKey = `${analyticsQuizScope}:${analyticsStateName}`;

  useEffect(() => {
    saveDailyQuizAnalyticsScopeFilter({
      quizScope: analyticsQuizScope,
      stateName: analyticsStateName,
    });
  }, [analyticsQuizScope, analyticsStateName]);

  useEffect(() => {
    void apiClient.get('/admin/settings').then((res) => {
      const raw = (res.data as { settings?: { signupRegions?: { items?: unknown[] } } })?.settings
        ?.signupRegions?.items;
      const states = Array.isArray(raw)
        ? raw
            .map((row) =>
              row && typeof row === 'object'
                ? String((row as { state?: string }).state || '').trim()
                : '',
            )
            .filter(Boolean)
        : [];
      setSignupStateOptions(Array.from(new Set(states)).sort((a, b) => a.localeCompare(b)));
    }).catch(() => {
      setSignupStateOptions([]);
    });
  }, [apiClient]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/daily-quiz/stats', { params: { range } });
      setData(normalizeDailyQuizAdminStats(res.data));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiClient, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAnswerReview = useCallback((prefill: DailyQuizAnswerReviewPrefill) => {
    if (prefill.quizDay) setQuizDay(prefill.quizDay.slice(0, 10));
    setAnswerReviewPrefill(prefill);
    setActiveAnalyticsTab('answerReview');
  }, []);

  const handleAnalyticsTabClick = useCallback((tabId: DailyQuizAnalyticsTab) => {
    setActiveAnalyticsTab((prev) => (prev === tabId ? null : tabId));
  }, []);

  if (loading && !data) {
    return (
      <div className="dash-analytics dq-dashboard" style={{ margin: '0 0 20px', borderRadius: 12 }}>
        <div className="dash-loading">Loading Daily Quiz dashboard…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash-analytics dq-dashboard" style={{ margin: '0 0 20px', borderRadius: 12 }}>
        <div className="dash-loading">
          Could not load Daily Quiz dashboard.{' '}
          <button type="button" className="dash-refresh" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="dash-analytics dq-dashboard" style={{ margin: '0 0 24px', borderRadius: 12, overflow: 'hidden' }}>
      <div className="dash-container" style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div className="dash-page-header">
          <div>
            <h1 style={{ fontSize: 22 }}>Daily Quiz Dashboard</h1>
            <p className="dash-page-sub">
              Analytics for daily quiz attempts only — separate from mock-test Dashboard.
            </p>
          </div>
          <div className="dq-header-tools">
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: '#64748b' }}>
              QUIZ DAY
              <input
                type="date"
                className="dq-quiz-day-input"
                value={quizDay}
                onChange={(e) => setQuizDay(e.target.value.slice(0, 10))}
                aria-label="Quiz day"
              />
            </label>
            <div className="dash-range-bar" role="group" aria-label="Daily quiz date range">
              {(['7d', '30d', '90d'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`dash-range-btn${range === key ? ' dash-range-btn-active' : ''}`}
                  onClick={() => setRange(key)}
                  disabled={loading}
                >
                  {key === '7d' ? '7 days' : key === '30d' ? '30 days' : '90 days'}
                </button>
              ))}
              <button type="button" className="dash-refresh" onClick={() => void load()} disabled={loading}>
                {loading ? '…' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {!data.tableReady ? (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 10,
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              fontSize: '0.88rem',
              color: '#78350f',
            }}
          >
            <strong>Database table not ready:</strong> run migration{' '}
            <code>database/postgres/017_daily_quiz_attempts.sql</code> and restart the API server.
          </div>
        ) : null}

        <div className={`dash-metrics-grid${loading ? ' dq-kpi-skeleton' : ''}`}>
          <div className="dash-m-card">
            <div className="dash-m-label">Attempts ({data.rangeDays}d)</div>
            <div className="dash-m-value">{kpis.totalAttempts}</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Unique players</div>
            <div className="dash-m-value">{kpis.uniqueUsers}</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Today</div>
            <div className="dash-m-value">{kpis.attemptsToday}</div>
            <div className="dash-card-sub">{kpis.uniqueUsersToday ?? 0} unique users</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Correct rate</div>
            <div className="dash-m-value">{kpis.correctRatePct}%</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Avg time</div>
            <div className="dash-m-value">{kpis.avgTimeSeconds}s</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Published items</div>
            <div className="dash-m-value">{kpis.publishedItems}</div>
          </div>
        </div>

        <DailyQuizOverviewPanel
          data={data}
          loading={loading}
          onOpenAnswerReview={openAnswerReview}
        />

        <div className="dq-tab-bar" role="tablist" aria-label="Daily quiz analytics sections">
          {DAILY_QUIZ_ANALYTICS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`dq-tab-${tab.id}`}
              aria-selected={activeAnalyticsTab === tab.id}
              aria-controls={`dq-panel-${tab.id}`}
              aria-expanded={activeAnalyticsTab === tab.id}
              title={tab.description}
              className={`dq-tab-btn${activeAnalyticsTab === tab.id ? ' dq-tab-btn-active' : ''}`}
              onClick={() => handleAnalyticsTabClick(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeAnalyticsTab ? (
          <div
            className="dq-tab-panel dq-tab-panel-open"
            role="tabpanel"
            id={`dq-panel-${activeAnalyticsTab}`}
            aria-labelledby={`dq-tab-${activeAnalyticsTab}`}
          >
            <div className="dq-analytics-scope-bar">
              <DailyQuizDeliveryScopeFilter
                stateOptions={signupStateOptions}
                quizScope={analyticsQuizScope}
                stateName={analyticsStateName}
                onQuizScopeChange={setAnalyticsQuizScope}
                onStateNameChange={setAnalyticsStateName}
              />
            </div>
            {activeAnalyticsTab === 'leaderboard' ? (
              <DailyQuizLeaderboardPanel
                apiClient={apiClient}
                quizDay={quizDay}
                tableReady={data.tableReady}
                scopeParams={analyticsScopeParams}
                scopeLabel={analyticsScopeLabel}
                scopeKey={analyticsScopeKey}
                onOpenAnswerReview={openAnswerReview}
              />
            ) : null}
            {activeAnalyticsTab === 'questionAnalysis' ? (
              <DailyQuizQuestionAnalysisPanel
                apiClient={apiClient}
                quizDay={quizDay}
                statsRange={range}
                tableReady={data.tableReady}
                scopeParams={analyticsScopeParams}
                scopeLabel={analyticsScopeLabel}
                scopeKey={analyticsScopeKey}
                onOpenAnswerReview={openAnswerReview}
              />
            ) : null}
            {activeAnalyticsTab === 'answerReview' ? (
              <DailyQuizAnswerReviewPanel
                apiClient={apiClient}
                quizDay={quizDay}
                tableReady={data.tableReady}
                prefill={answerReviewPrefill}
                scopeParams={analyticsScopeParams}
                scopeLabel={analyticsScopeLabel}
                scopeKey={analyticsScopeKey}
                onClearPrefill={() => setAnswerReviewPrefill(null)}
              />
            ) : null}
          </div>
        ) : (
          <p className="dq-tab-hint">Select Leaderboard, Question Analysis, or Answer Review to load details below.</p>
        )}
      </div>
    </div>
  );
}

export {
  normalizeDailyQuizAdminStats,
  type DailyQuizAdminStatsData,
  type DailyQuizStatsRange,
} from './dailyQuizTypes';
