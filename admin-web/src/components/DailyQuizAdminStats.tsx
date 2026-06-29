import { useCallback, useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import '../dashboardAnalytics.css';

let chartJsRegistered = false;
function ensureChartJsRegistered() {
  if (chartJsRegistered) return;
  Chart.register(...registerables);
  chartJsRegistered = true;
}

export type DailyQuizStatsRange = '7d' | '30d' | '90d';

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

function num(v: unknown, d = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
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

type ApiClient = {
  get: (url: string, config?: { params?: Record<string, string> }) => Promise<{ data: unknown }>;
};

type Props = {
  apiClient: ApiClient;
};

export function DailyQuizAdminStats({ apiClient }: Props) {
  const [range, setRange] = useState<DailyQuizStatsRange>('7d');
  const [data, setData] = useState<DailyQuizAdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const lineRef = useRef<HTMLCanvasElement>(null);
  const donutRef = useRef<HTMLCanvasElement>(null);
  const lineChartRef = useRef<{ destroy: () => void } | null>(null);
  const donutChartRef = useRef<{ destroy: () => void } | null>(null);

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

  useEffect(() => {
    if (!data || loading) return;
    const lineEl = lineRef.current;
    const donutEl = donutRef.current;
    if (!lineEl || !donutEl) return;

    lineChartRef.current?.destroy();
    donutChartRef.current?.destroy();
    lineChartRef.current = null;
    donutChartRef.current = null;

    try {
      ensureChartJsRegistered();
      const labels = data.attemptsPerDay.labels.length
        ? data.attemptsPerDay.labels
        : ['—'];
      const attempts = data.attemptsPerDay.attempts.length
        ? data.attemptsPerDay.attempts
        : [0];
      const uniqueUsers = data.attemptsPerDay.uniqueUsers.length
        ? data.attemptsPerDay.uniqueUsers
        : attempts.map(() => 0);

      lineChartRef.current = new Chart(lineEl, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Daily Quiz attempts',
              data: attempts,
              borderColor: '#1652D4',
              backgroundColor: 'rgba(22, 82, 212, 0.08)',
              fill: true,
              tension: 0.35,
              borderWidth: 2,
            },
            {
              label: 'Unique users',
              data: uniqueUsers,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.06)',
              fill: true,
              tension: 0.35,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });

      const { correct, wrong, skipped } = data.outcomeSplit;
      const sum = correct + wrong + skipped;
      let dLabels = ['Correct', 'Wrong', 'Skipped'];
      let dData = [correct, wrong, skipped];
      let dColors = ['#10B981', '#EB5757', '#E2E8F0'];
      if (sum === 0) {
        dLabels = ['No attempts yet'];
        dData = [1];
        dColors = ['#E2E8F0'];
      }

      donutChartRef.current = new Chart(donutEl, {
        type: 'doughnut',
        data: {
          labels: dLabels,
          datasets: [{ data: dData, backgroundColor: dColors, borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          cutout: '72%',
        },
      });
    } catch (e) {
      console.error('daily_quiz_admin_charts_failed', e);
    }

    return () => {
      lineChartRef.current?.destroy();
      lineChartRef.current = null;
      donutChartRef.current?.destroy();
      donutChartRef.current = null;
    };
  }, [data, loading]);

  if (loading && !data) {
    return (
      <div className="dash-analytics" style={{ margin: '0 0 20px', borderRadius: 12 }}>
        <div className="dash-loading">Loading Daily Quiz stats…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash-analytics" style={{ margin: '0 0 20px', borderRadius: 12 }}>
        <div className="dash-loading">
          Could not load Daily Quiz stats.{' '}
          <button type="button" className="dash-refresh" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="dash-analytics" style={{ margin: '0 0 24px', borderRadius: 12, overflow: 'hidden' }}>
      <div className="dash-container" style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div className="dash-page-header">
          <div>
            <h1 style={{ fontSize: 22 }}>Daily Quiz — Analytics</h1>
            <p className="dash-page-sub">
              Separate from mock-test Dashboard. Tracks <code>daily_quiz_attempts</code> only.
            </p>
          </div>
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

        <div className="dash-metrics-grid">
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
            <div className="dash-card-sub">
              {kpis.uniqueUsersToday ?? 0} unique users
            </div>
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

        <div className="dash-main-grid">
          <div className="dash-card">
            <div className="dash-card-h">Attempts per day (Daily Quiz)</div>
            <div className="dash-chart-box">
              <canvas ref={lineRef} />
            </div>
          </div>
          <div className="dash-card">
            <div className="dash-card-h">Outcome split (correct / wrong / skipped)</div>
            <div className="dash-chart-box">
              <canvas ref={donutRef} />
            </div>
          </div>
        </div>

        <div className="dash-card dash-table-card" style={{ marginTop: 16 }}>
          <div className="dash-card-h">Recent Daily Quiz activity</div>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Quiz day</th>
                <th>Result</th>
                <th>Time</th>
                <th>Question</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: '#64748b' }}>
                    No Daily Quiz attempts recorded yet.
                  </td>
                </tr>
              ) : (
                data.recentActivity.map((row, idx) => (
                  <tr key={`${row.quizDay}-${row.student}-${idx}`}>
                    <td>{row.student}</td>
                    <td>{row.quizDay}</td>
                    <td>
                      <span
                        className="dash-badge"
                        style={{
                          background: row.isCorrect ? '#dcfce7' : '#fee2e2',
                          color: row.isCorrect ? '#166534' : '#b91c1c',
                        }}
                      >
                        {row.isCorrect ? 'Correct' : 'Wrong'}
                      </span>
                    </td>
                    <td>{row.timeTakenSeconds}s</td>
                    <td>{row.questionPrompt}</td>
                    <td>
                      {row.submittedAt
                        ? new Date(row.submittedAt).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
