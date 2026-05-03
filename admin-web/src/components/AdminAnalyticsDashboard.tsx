import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAdminToast } from '../adminToast';
import {
  normalizeDashboardSummary,
  type AdminDashboardSummary,
  type DashboardRange,
} from './DashboardAnalytics';
import '../dashboardAnalytics.css';

let chartJsRegistered = false;
function ensureChartJsRegistered() {
  if (chartJsRegistered) return;
  Chart.register(...registerables);
  chartJsRegistered = true;
}

type ApiClient = { get: (url: string, config?: { params?: Record<string, string> }) => Promise<{ data?: unknown }> };

export type AdminAnalyticsTopTest = {
  title: string;
  attemptsCount: number;
  avgAccuracy: number | null;
};

export type AdminAnalyticsData = {
  rangeDays: number;
  kpis: {
    attemptsInRange: number;
    uniqueUsersInRange: number;
    avgAccuracyPct: number | null;
    signupsInRange: number;
  };
  labels: string[];
  attemptsPerDay: number[];
  uniqueUsersPerDay: number[];
  signupsPerDay: number[];
  topTests: AdminAnalyticsTopTest[];
  scoreBuckets: { label: string; count: number }[];
  /** Present when `/admin/analytics` is missing (404) and data comes from `/admin/summary`. */
  dataSource?: 'api' | 'summaryFallback';
};

function defaultEmpty(rangeDays: number): AdminAnalyticsData {
  const n = Math.max(1, Math.min(120, Math.floor(rangeDays)));
  const labels: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  }
  return {
    rangeDays: n,
    kpis: { attemptsInRange: 0, uniqueUsersInRange: 0, avgAccuracyPct: null, signupsInRange: 0 },
    labels,
    attemptsPerDay: labels.map(() => 0),
    uniqueUsersPerDay: labels.map(() => 0),
    signupsPerDay: labels.map(() => 0),
    topTests: [],
    scoreBuckets: [
      { label: '0–20%', count: 0 },
      { label: '21–40%', count: 0 },
      { label: '41–60%', count: 0 },
      { label: '61–80%', count: 0 },
      { label: '81–100%', count: 0 },
    ],
    dataSource: 'api',
  };
}

/** When production API has not been redeployed yet, `/admin/summary` already exposes enough for a useful view. */
function buildAnalyticsFromDashboardSummary(s: AdminDashboardSummary): AdminAnalyticsData {
  const labels = s.userGrowth7d.labels;
  const attemptsPerDay = labels.map((_, i) => (i < s.attemptsPerDay.length ? s.attemptsPerDay[i] : 0));
  const signupsPerDay = labels.map((_, i) => (i < s.userGrowth7d.values.length ? s.userGrowth7d.values[i] : 0));
  const attemptsInRange = attemptsPerDay.reduce((a, x) => a + x, 0);
  const signupsInRange = signupsPerDay.reduce((a, x) => a + x, 0);
  const zeros = labels.map(() => 0);
  const topTests: AdminAnalyticsTopTest[] = s.topTests.map((t) => ({
    title: t.title,
    attemptsCount: t.attemptsCount,
    avgAccuracy: t.avgAccuracy,
  }));
  let weightedAcc: number | null = null;
  let wsum = 0;
  let wtot = 0;
  for (const t of topTests) {
    if (t.avgAccuracy != null && t.attemptsCount > 0) {
      wsum += t.avgAccuracy * t.attemptsCount;
      wtot += t.attemptsCount;
    }
  }
  if (wtot > 0) weightedAcc = Math.round(wsum / wtot);

  return {
    rangeDays: s.rangeDays,
    kpis: {
      attemptsInRange,
      uniqueUsersInRange: s.funnel.started,
      avgAccuracyPct: weightedAcc,
      signupsInRange,
    },
    labels,
    attemptsPerDay,
    uniqueUsersPerDay: zeros,
    signupsPerDay,
    topTests,
    scoreBuckets: defaultEmpty(s.rangeDays).scoreBuckets,
    dataSource: 'summaryFallback',
  };
}

export function normalizeAdminAnalytics(raw: unknown, fallbackRange: number): AdminAnalyticsData {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  };
  let rangeDays = Math.floor(num(r.rangeDays, fallbackRange));
  if (!rangeDays || rangeDays < 1) rangeDays = fallbackRange;
  if (rangeDays > 120) rangeDays = 120;

  const kpisRaw = r.kpis && typeof r.kpis === 'object' ? (r.kpis as Record<string, unknown>) : {};
  const avgRaw = kpisRaw.avgAccuracyPct;
  const avgAccuracyPct =
    avgRaw === null || avgRaw === undefined || avgRaw === '' || !Number.isFinite(Number(avgRaw))
      ? null
      : Math.round(Number(avgRaw));

  const labels = Array.isArray(r.labels) ? r.labels.map((x) => String(x)) : [];
  const padSeries = (arr: unknown, len: number) => {
    const a = Array.isArray(arr) ? arr.map((x) => num(x)) : [];
    const out: number[] = [];
    for (let i = 0; i < len; i += 1) out.push(i < a.length ? a[i] : 0);
    return out;
  };
  const L = labels.length > 0 ? Math.min(120, labels.length) : rangeDays;
  const useLabels = labels.length > 0 ? labels.slice(0, L) : defaultEmpty(rangeDays).labels.slice(-rangeDays);

  const attemptsPerDay = padSeries(r.attemptsPerDay, useLabels.length);
  const uniqueUsersPerDay = padSeries(r.uniqueUsersPerDay, useLabels.length);
  const signupsPerDay = padSeries(r.signupsPerDay, useLabels.length);

  const topTests: AdminAnalyticsTopTest[] = Array.isArray(r.topTests)
    ? r.topTests.map((row: unknown) => {
        const x = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const title = String(x.title || '').trim().slice(0, 120);
        const attemptsCount = Math.floor(num(x.attemptsCount ?? x.attempts_count, 0));
        const ar = x.avgAccuracy ?? x.avg_accuracy ?? x.avgAccuracyPct;
        const avgAccuracy =
          ar === null || ar === undefined || ar === '' || !Number.isFinite(Number(ar)) ? null : Number(ar);
        return { title, attemptsCount, avgAccuracy };
      })
    : [];

  const defaultBuckets = defaultEmpty(7).scoreBuckets;
  let scoreBuckets = defaultBuckets;
  if (Array.isArray(r.scoreBuckets)) {
    scoreBuckets = r.scoreBuckets.map((b: unknown, i: number) => {
      const o = b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
      return {
        label: String(o.label || defaultBuckets[i]?.label || ''),
        count: Math.floor(num(o.count)),
      };
    });
    while (scoreBuckets.length < 5) {
      scoreBuckets.push(defaultBuckets[scoreBuckets.length] || { label: '', count: 0 });
    }
    scoreBuckets = scoreBuckets.slice(0, 5);
  }

  return {
    rangeDays,
    kpis: {
      attemptsInRange: Math.floor(num(kpisRaw.attemptsInRange)),
      uniqueUsersInRange: Math.floor(num(kpisRaw.uniqueUsersInRange)),
      avgAccuracyPct,
      signupsInRange: Math.floor(num(kpisRaw.signupsInRange)),
    },
    labels: useLabels,
    attemptsPerDay,
    uniqueUsersPerDay,
    signupsPerDay,
    topTests,
    scoreBuckets,
    dataSource: 'api',
  };
}

type Props = { apiClient: ApiClient };

function analyticsLoadErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: unknown } };
  const data = e?.response?.data;
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const er = (data as { error?: unknown }).error;
    if (typeof er === 'string' && er.trim()) return er.trim();
  }
  const st = Number(e?.response?.status || 0);
  if (st === 404) {
    return 'Analytics API not found (404). The app will try dashboard summary next; redeploy the server for full analytics.';
  }
  if (st === 401) return 'Session expired. Please sign in again.';
  if (st === 403) return 'Admin access required.';
  if (st >= 500) return 'Server error while loading analytics. Check server logs.';
  return 'Failed to load analytics (network or unknown error).';
}

export function AdminAnalyticsDashboard({ apiClient }: Props) {
  const { pushToast } = useAdminToast();
  const [range, setRange] = useState<DashboardRange>('7d');
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const lineRef = useRef<HTMLCanvasElement>(null);
  const testsBarRef = useRef<HTMLCanvasElement>(null);
  const scoreBarRef = useRef<HTMLCanvasElement>(null);
  const lineChartRef = useRef<{ destroy: () => void } | null>(null);
  const testsChartRef = useRef<{ destroy: () => void } | null>(null);
  const scoreChartRef = useRef<{ destroy: () => void } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/analytics', { params: { range } });
      const rd = range === '7d' ? 7 : range === '30d' ? 30 : 90;
      setData(normalizeAdminAnalytics(res.data, rd));
    } catch (err: unknown) {
      const st = Number((err as { response?: { status?: number } }).response?.status || 0);
      if (st === 404) {
        try {
          const res2 = await apiClient.get('/admin/summary', { params: { range } });
          const summary = normalizeDashboardSummary(res2.data);
          setData(buildAnalyticsFromDashboardSummary(summary));
          /* Single on-page banner explains limited mode; avoid a second toast (felt like duplicate “errors”). */
        } catch (err2: unknown) {
          setData(null);
          pushToast('error', analyticsLoadErrorMessage(err2));
        }
      } else {
        setData(null);
        pushToast('error', analyticsLoadErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    if (!data || loading) return;
    const lineEl = lineRef.current;
    const testsEl = testsBarRef.current;
    const scoreEl = scoreBarRef.current;
    if (!lineEl || !testsEl || !scoreEl) return;

    lineChartRef.current?.destroy();
    testsChartRef.current?.destroy();
    scoreChartRef.current?.destroy();
    lineChartRef.current = null;
    testsChartRef.current = null;
    scoreChartRef.current = null;

    try {
      ensureChartJsRegistered();
      const labels = data.labels.length ? data.labels : ['—'];
      const n = Math.max(labels.length, 1);
      const pointR = n > 45 ? 0 : n > 20 ? 2 : 4;
      const isLimited = data.dataSource === 'summaryFallback';

      const attemptsDs = {
        label: 'Attempts / day',
        data: data.attemptsPerDay.length ? data.attemptsPerDay : [0],
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.06)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: pointR,
      };
      const uniqueDs = {
        label: 'Unique users / day',
        data: data.uniqueUsersPerDay.length ? data.uniqueUsersPerDay : [0],
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.04)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: pointR,
      };
      const signupsDs = {
        label: 'New signups / day',
        data: data.signupsPerDay.length ? data.signupsPerDay : [0],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.04)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: pointR,
      };
      const lineDatasets = isLimited ? [attemptsDs, signupsDs] : [attemptsDs, uniqueDs, signupsDs];

      lineChartRef.current = new Chart(lineEl, {
        type: 'line',
        data: {
          labels,
          datasets: lineDatasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 10, usePointStyle: true } },
            title: {
              display: true,
              text: isLimited
                ? 'Daily activity (UTC) — summary mode (no per-day unique users)'
                : 'Daily activity (UTC calendar days)',
              font: { size: 13, weight: 'bold' },
              color: '#475569',
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });

      const tt = data.topTests.filter((t) => t.title && t.title.toLowerCase() !== 'unknown');
      const showTests = tt.length ? tt : [{ title: 'No attempts in range', attemptsCount: 0, avgAccuracy: null }];
      testsChartRef.current = new Chart(testsEl, {
        type: 'bar',
        data: {
          labels: showTests.map((t) => (t.title.length > 42 ? `${t.title.slice(0, 40)}…` : t.title)),
          datasets: [
            {
              label: 'Attempts',
              data: showTests.map((t) => t.attemptsCount),
              backgroundColor: 'rgba(79, 70, 229, 0.75)',
              borderRadius: 6,
              maxBarThickness: 22,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Top tests by volume (window)',
              font: { size: 13, weight: 'bold' },
              color: '#475569',
            },
            tooltip: {
              callbacks: {
                afterLabel: (ctx) => {
                  const i = ctx.dataIndex;
                  const a = showTests[i]?.avgAccuracy;
                  return a == null ? '' : `Avg score: ${Math.round(a)}%`;
                },
              },
            },
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
            y: { grid: { display: false } },
          },
        },
      });

      const sb = data.scoreBuckets;
      scoreChartRef.current = new Chart(scoreEl, {
        type: 'bar',
        data: {
          labels: sb.map((b) => b.label),
          datasets: [
            {
              label: 'Attempts',
              data: sb.map((b) => b.count),
              backgroundColor: isLimited
                ? ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0']
                : ['#94a3b8', '#64748b', '#475569', '#334155', '#0f172a'],
              borderRadius: 8,
              maxBarThickness: 48,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: isLimited
                ? 'Score distribution — deploy API for this chart'
                : 'Score distribution (attempts with total > 0)',
              font: { size: 13, weight: 'bold' },
              color: '#475569',
            },
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });
    } catch (e) {
      console.error('admin_analytics_charts_failed', e);
    }

    return () => {
      lineChartRef.current?.destroy();
      lineChartRef.current = null;
      testsChartRef.current?.destroy();
      testsChartRef.current = null;
      scoreChartRef.current?.destroy();
      scoreChartRef.current = null;
    };
  }, [data, loading]);

  const monthYear = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (loading && !data) {
    return (
      <div className="dash-analytics">
        <div className="dash-loading">Loading analytics…</div>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="dash-analytics">
        <div className="dash-loading">
          Could not load analytics. Confirm the API is running the latest server build (GET /v1/admin/analytics).{' '}
          <button type="button" className="dash-refresh" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash-analytics">
        <div className="dash-loading">Loading analytics…</div>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="dash-analytics">
      <div className="dash-navbar">
        <div className="dash-brand">
          <i className="fas fa-chart-pie" aria-hidden="true" /> ANALYTICS
        </div>
        <div className="dash-nav-meta">
          <span>
            <i className="far fa-calendar" aria-hidden="true" /> {monthYear}
          </span>
          <button type="button" className="dash-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className="dash-avatar" title="Admin">
            <i className="fas fa-user" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="dash-container">
        <div className="dash-page-header">
          <div>
            <h1>Analytics &amp; Insights</h1>
          </div>
          <div className="dash-range-bar" role="group" aria-label="Date range">
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
          </div>
        </div>

        {data.dataSource === 'summaryFallback' ? (
          <div
            role="status"
            style={{
              marginBottom: 18,
              padding: '14px 18px',
              borderRadius: 14,
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              fontSize: '0.9rem',
              lineHeight: 1.5,
              color: '#78350f',
            }}
          >
            <strong>Limited mode (not a crash):</strong> production API is missing{' '}
            <code>GET /v1/admin/analytics</code> (404). Charts use the same payload as the Dashboard (
            <code>/admin/summary</code>). After you <strong>redeploy the Node server</strong> with the latest code, this
            banner disappears and you get score distribution + per-day unique users + full window metrics.
          </div>
        ) : null}

        <div className="dash-metrics-grid">
          <div className="dash-m-card">
            <div className="dash-m-label">Attempts ({data.rangeDays}d UTC)</div>
            <div className="dash-m-value">{kpis.attemptsInRange.toLocaleString('en-IN')}</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Unique users (window)</div>
            <div className="dash-m-value" style={{ color: '#0ea5e9' }}>
              {kpis.uniqueUsersInRange.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Avg accuracy %</div>
            <div className="dash-m-value">{kpis.avgAccuracyPct == null ? '—' : `${kpis.avgAccuracyPct}%`}</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">New signups ({data.rangeDays}d UTC)</div>
            <div className="dash-m-value" style={{ color: '#10b981' }}>
              {kpis.signupsInRange.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <div className="dash-main-grid">
          <div className="dash-card" style={{ gridColumn: '1 / -1' }}>
            <div className="dash-card-h">
              <i className="fas fa-wave-square" style={{ color: '#4f46e5' }} aria-hidden="true" /> Trends
            </div>
            <p className="dash-card-sub">
              {data.dataSource === 'summaryFallback'
                ? 'Attempts and new signups per UTC day (per-day unique-user line is hidden until the analytics API is deployed).'
                : 'Attempts, distinct test-takers, and account signups per UTC day.'}
            </p>
            <div className="dash-chart-box" style={{ minHeight: 320 }}>
              <canvas ref={lineRef} />
            </div>
          </div>
        </div>

        <div className="dash-main-grid">
          <div className="dash-card">
            <div className="dash-chart-box" style={{ minHeight: 360 }}>
              <canvas ref={testsBarRef} />
            </div>
          </div>
          <div className="dash-card">
            <div className="dash-chart-box" style={{ minHeight: 360 }}>
              <canvas ref={scoreBarRef} />
            </div>
          </div>
        </div>

        <div className="dash-card dash-table-card">
          <div className="dash-card-h">
            <i className="fas fa-list" style={{ color: '#64748b' }} aria-hidden="true" /> Top tests (table)
          </div>
          <table className="dash-top-tests-table">
            <thead>
              <tr>
                <th>TEST</th>
                <th>ATTEMPTS</th>
                <th>AVG %</th>
              </tr>
            </thead>
            <tbody>
              {!data.topTests.length ? (
                <tr>
                  <td colSpan={3} style={{ color: '#64748b' }}>
                    No data in this range.
                  </td>
                </tr>
              ) : (
                data.topTests.map((row, idx) => (
                  <tr key={`${row.title}-${idx}`}>
                    <td>{row.title || '—'}</td>
                    <td>{row.attemptsCount.toLocaleString('en-IN')}</td>
                    <td>{row.avgAccuracy == null ? '—' : `${Math.round(row.avgAccuracy)}%`}</td>
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
