import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import '../dashboardAnalytics.css';

let chartJsRegistered = false;
function ensureChartJsRegistered() {
  if (chartJsRegistered) return;
  Chart.register(...registerables);
  chartJsRegistered = true;
}

export type DashboardTopTest = {
  title: string;
  attemptsCount: number;
  avgAccuracy: number | null;
  lastAttemptAt: string | null;
};

export type AdminDashboardSummary = {
  users: number;
  attempts: number;
  tests: number;
  articles: number;
  attemptsToday: number;
  activeRecent: number;
  platformHealthPct: number;
  /** Selected window for charts (7, 30, or 90 UTC calendar days ending today). */
  rangeDays: number;
  userGrowth7d: { labels: string[]; values: number[] };
  /** Same length as userGrowth7d.labels — attempts completed per UTC calendar day. */
  attemptsPerDay: number[];
  deviceSplit: { mobile: number; desktop: number; other: number; source: string };
  hourlyHeatmap: Array<{ count: number; tier: 'peak' | 'mid' | 'low' }>;
  trendingTopics: string[];
  topTests: DashboardTopTest[];
  funnel: {
    opened: number;
    started: number;
    completed: number;
    percents: { opened: number; started: number; completed: number };
    dropoffPct: number;
  };
  activityFeed: Array<{
    student: string;
    topic: string;
    accuracyPct: number;
    completedAt: string;
    device: string;
  }>;
};

function defaultGrowthDays(days: number): { labels: string[]; values: number[]; attempts: number[] } {
  const n = Math.max(1, Math.min(120, Math.floor(days)));
  const labels: string[] = [];
  const values: number[] = [];
  const attempts: number[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
    values.push(0);
    attempts.push(0);
  }
  return { labels, values, attempts };
}

/** Safe for older `/admin/summary` payloads (only users/attempts/tests/articles). */
export function normalizeDashboardSummary(raw: unknown): AdminDashboardSummary {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  };

  let rangeDays = Math.floor(num(r.rangeDays));
  if (!rangeDays || rangeDays < 1) rangeDays = 7;
  if (rangeDays > 120) rangeDays = 120;

  let userGrowth7d: { labels: string[]; values: number[] };
  let attemptsPerDay: number[];
  const g = r.userGrowth7d;
  if (g && typeof g === 'object') {
    const go = g as Record<string, unknown>;
    const labels = Array.isArray(go.labels) ? go.labels.map((x) => String(x)) : [];
    const values = Array.isArray(go.values) ? go.values.map((x) => num(x)) : [];
    if (labels.length > 0 && values.length > 0) {
      const pairLen = Math.min(labels.length, values.length, 120);
      userGrowth7d = { labels: labels.slice(0, pairLen), values: values.slice(0, pairLen) };
      const rawAttempts = Array.isArray(r.attemptsPerDay)
        ? r.attemptsPerDay.map((x) => num(x))
        : [];
      attemptsPerDay = [];
      for (let i = 0; i < pairLen; i += 1) {
        attemptsPerDay.push(i < rawAttempts.length ? rawAttempts[i] : 0);
      }
      if (!r.rangeDays || !Number.isFinite(Number(r.rangeDays))) {
        rangeDays = Math.min(120, Math.max(rangeDays, pairLen));
      }
    } else {
      const d = defaultGrowthDays(rangeDays);
      userGrowth7d = { labels: d.labels, values: d.values };
      attemptsPerDay = d.attempts;
    }
  } else {
    const d = defaultGrowthDays(rangeDays);
    userGrowth7d = { labels: d.labels, values: d.values };
    attemptsPerDay = d.attempts;
  }

  let hourlyHeatmap: Array<{ count: number; tier: 'peak' | 'mid' | 'low' }>;
  if (Array.isArray(r.hourlyHeatmap) && r.hourlyHeatmap.length === 24) {
    hourlyHeatmap = r.hourlyHeatmap.map((cell: unknown) => {
      const c = cell && typeof cell === 'object' ? (cell as Record<string, unknown>) : {};
      const tier = c.tier === 'peak' || c.tier === 'mid' ? c.tier : 'low';
      return { count: num(c.count), tier };
    });
  } else {
    hourlyHeatmap = Array.from({ length: 24 }, () => ({ count: 0, tier: 'low' as const }));
  }

  const ds = r.deviceSplit && typeof r.deviceSplit === 'object' ? (r.deviceSplit as Record<string, unknown>) : {};
  const deviceSplit = {
    mobile: num(ds.mobile),
    desktop: num(ds.desktop),
    other: num(ds.other),
    source: typeof ds.source === 'string' ? ds.source : 'empty',
  };

  const trendingTopics = Array.isArray(r.trendingTopics)
    ? r.trendingTopics.map((x) => String(x).trim()).filter(Boolean)
    : [];

  let funnel: AdminDashboardSummary['funnel'];
  const f = r.funnel && typeof r.funnel === 'object' ? (r.funnel as Record<string, unknown>) : {};
  const opened = num(f.opened);
  const started = num(f.started);
  const completed = num(f.completed);
  if (opened + started + completed > 0) {
    const funnelMax = Math.max(opened, started, completed, 1);
    const perc = f.percents && typeof f.percents === 'object' ? (f.percents as Record<string, unknown>) : {};
    funnel = {
      opened,
      started,
      completed,
      percents: {
        opened: num(perc.opened, Math.round((100 * opened) / funnelMax)),
        started: num(perc.started, Math.round((100 * started) / funnelMax)),
        completed: num(perc.completed, Math.round((100 * completed) / funnelMax)),
      },
      dropoffPct: num(f.dropoffPct, opened > 0 ? Math.max(0, Math.min(100, Math.round(100 - (100 * completed) / opened))) : 0),
    };
  } else {
    funnel = {
      opened: 0,
      started: 0,
      completed: 0,
      percents: { opened: 0, started: 0, completed: 0 },
      dropoffPct: 0,
    };
  }

  const activityFeed: AdminDashboardSummary['activityFeed'] = Array.isArray(r.activityFeed)
    ? r.activityFeed.map((row: unknown) => {
        const x = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const iso = x.completedAt ? String(x.completedAt) : new Date(0).toISOString();
        return {
          student: String(x.student || '—'),
          topic: String(x.topic || '—'),
          accuracyPct: num(x.accuracyPct),
          completedAt: iso,
          device: String(x.device || '—'),
        };
      })
    : [];

  const topTests: AdminDashboardSummary['topTests'] = Array.isArray(r.topTests)
    ? r.topTests
        .map((row: unknown) => {
          const x = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
          const titleRaw = x.title ?? x.test_name ?? '';
          const title = String(titleRaw || '').trim().slice(0, 120);
          const attemptsCount = Math.floor(
            num(x.attemptsCount ?? x.attempts_count ?? x.count, 0),
          );
          const avgRaw = x.avgAccuracy ?? x.avg_accuracy;
          const avgAccuracy =
            avgRaw === null || avgRaw === undefined || avgRaw === ''
              ? null
              : Number.isFinite(Number(avgRaw))
                ? Number(avgRaw)
                : null;
          const lastRaw = x.lastAttemptAt ?? x.last_attempt_at;
          const lastAttemptAt =
            lastRaw === null || lastRaw === undefined || lastRaw === ''
              ? null
              : String(lastRaw);
          return { title, attemptsCount, avgAccuracy, lastAttemptAt };
        })
        .filter((t) => t.title && t.title.toLowerCase() !== 'unknown')
    : [];

  return {
    users: num(r.users),
    attempts: num(r.attempts),
    tests: num(r.tests),
    articles: num(r.articles),
    attemptsToday: num(r.attemptsToday),
    activeRecent: num(r.activeRecent),
    platformHealthPct: num(r.platformHealthPct, 100),
    rangeDays,
    userGrowth7d,
    attemptsPerDay,
    deviceSplit,
    hourlyHeatmap,
    trendingTopics,
    topTests,
    funnel,
    activityFeed,
  };
}

export type DashboardRange = '7d' | '30d' | '90d';

type Props = {
  data: AdminDashboardSummary | null;
  loading: boolean;
  onRefresh: () => void;
  range: DashboardRange;
  onRangeChange: (r: DashboardRange) => void;
};

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export function DashboardAnalytics({ data, loading, onRefresh, range, onRangeChange }: Props) {
  const growthRef = useRef<HTMLCanvasElement>(null);
  const deviceRef = useRef<HTMLCanvasElement>(null);
  const growthChartRef = useRef<{ destroy: () => void } | null>(null);
  const deviceChartRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (!data || loading) return;
    const gEl = growthRef.current;
    const dEl = deviceRef.current;
    if (!gEl || !dEl) return;

    growthChartRef.current?.destroy();
    deviceChartRef.current?.destroy();
    growthChartRef.current = null;
    deviceChartRef.current = null;

    try {
      ensureChartJsRegistered();
      const labels = Array.isArray(data.userGrowth7d?.labels) ? data.userGrowth7d.labels : [];
      const values = Array.isArray(data.userGrowth7d?.values) ? data.userGrowth7d.values : [];
      const attempts = Array.isArray(data.attemptsPerDay) ? data.attemptsPerDay : [];
      const n = Math.max(labels.length, 1);
      const pointR = n > 45 ? 0 : n > 20 ? 2 : 4;
      const growthLabels = labels.length ? labels : ['—'];
      const growthSignups = values.length ? values : [0];
      const growthAttempts: number[] = [];
      for (let i = 0; i < growthLabels.length; i += 1) {
        growthAttempts.push(i < attempts.length ? attempts[i] : 0);
      }
      growthChartRef.current = new Chart(gEl, {
        type: 'line',
        data: {
          labels: growthLabels,
          datasets: [
            {
              label: 'New signups',
              data: growthSignups,
              borderColor: '#4f46e5',
              backgroundColor: 'rgba(79, 70, 229, 0.06)',
              fill: true,
              tension: 0.35,
              borderWidth: 2,
              pointRadius: pointR,
            },
            {
              label: 'Attempts',
              data: growthAttempts,
              borderColor: '#0ea5e9',
              backgroundColor: 'rgba(14, 165, 233, 0.04)',
              fill: true,
              tension: 0.35,
              borderWidth: 2,
              pointRadius: pointR,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { boxWidth: 10, usePointStyle: true },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });

      const split = data.deviceSplit || { mobile: 0, desktop: 0, other: 0 };
      const { mobile, desktop, other } = split;
      const sum = mobile + desktop + other;
      const rangeLabel = `${data.rangeDays}d`;
      let dLabels = ['Mobile', 'Desktop', 'Other'];
      let dData = [mobile, desktop, other];
      let dColors = ['#4f46e5', '#94a3b8', '#cbd5e1'];
      if (sum === 0) {
        dLabels = [`No admin requests (${rangeLabel})`];
        dData = [1];
        dColors = ['#e2e8f0'];
      }

      deviceChartRef.current = new Chart(dEl, {
        type: 'doughnut',
        data: {
          labels: dLabels,
          datasets: [{ data: dData, backgroundColor: dColors, borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          cutout: '75%',
        },
      });
    } catch (e) {
      console.error('dashboard_charts_init_failed', e);
    }

    return () => {
      growthChartRef.current?.destroy();
      growthChartRef.current = null;
      deviceChartRef.current?.destroy();
      deviceChartRef.current = null;
    };
  }, [data, loading]);

  const monthYear = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (loading && !data) {
    return (
      <div className="dash-analytics">
        <div className="dash-loading">Loading dashboard…</div>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="dash-analytics">
        <div className="dash-loading">
          Could not load dashboard.{' '}
          <button type="button" className="dash-refresh" onClick={() => onRefresh()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash-analytics">
        <div className="dash-loading">Loading dashboard…</div>
      </div>
    );
  }

  const heatHours = Array.from({ length: 24 }, (_, h) => h);
  const topicsRaw = data.trendingTopics?.length ? data.trendingTopics : ['—'];
  const topics = topicsRaw.map((t) => String(t).trim()).filter(Boolean);
  const topicBadges = topics.length ? topics : ['—'];

  return (
    <div className="dash-analytics">
      <div className="dash-navbar">
        <div className="dash-brand">
          <i className="fas fa-bolt" aria-hidden="true" /> DASHBOARD
        </div>
        <div className="dash-nav-meta">
          <span>
            <i className="far fa-calendar" aria-hidden="true" /> {monthYear}
          </span>
          <button type="button" className="dash-refresh" onClick={() => onRefresh()}>
            Refresh
          </button>
          <div className="dash-avatar" title="Admin">
            <i className="fas fa-user" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="dash-container">
        <div className="dash-page-header">
          <div>
            <h1>Platform Overview</h1>
            <p className="dash-page-sub">
              Charts and breakdowns use UTC calendar days (last {data.rangeDays} days, including today).
            </p>
          </div>
          <div className="dash-range-bar" role="group" aria-label="Date range">
            {(['7d', '30d', '90d'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`dash-range-btn${range === key ? ' dash-range-btn-active' : ''}`}
                onClick={() => onRangeChange(key)}
                disabled={loading}
              >
                {key === '7d' ? '7 days' : key === '30d' ? '30 days' : '90 days'}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-metrics-grid">
          <div className="dash-m-card">
            <div className="dash-m-label">Total Users</div>
            <div className="dash-m-value">{data.users.toLocaleString('en-IN')}</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Tests Done Today (UTC)</div>
            <div className="dash-m-value">{data.attemptsToday.toLocaleString('en-IN')}</div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Active Now (~45m)</div>
            <div className="dash-m-value" style={{ color: '#10b981' }}>
              {data.activeRecent.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="dash-m-card">
            <div className="dash-m-label">Platform Health</div>
            <div className="dash-m-value">{data.platformHealthPct}%</div>
          </div>
        </div>

        <div className="dash-main-grid">
          <div className="dash-card">
            <div className="dash-card-h">
              <i className="fas fa-chart-line" style={{ color: '#4f46e5' }} aria-hidden="true" /> Growth (UTC days)
            </div>
            <p className="dash-card-sub">New user signups and completed test attempts per calendar day.</p>
            <div className="dash-chart-box">
              <canvas ref={growthRef} />
            </div>
          </div>
          <div className="dash-card">
            <div className="dash-card-h">
              <i className="fas fa-laptop" style={{ color: '#64748b' }} aria-hidden="true" /> Device Distribution
            </div>
            <div className="dash-chart-box">
              <canvas ref={deviceRef} />
            </div>
          </div>
        </div>

        <div className="dash-main-grid">
          <div className="dash-card">
            <div className="dash-card-h">
              <i className="fas fa-fire" style={{ color: '#f59e0b' }} aria-hidden="true" /> Peak Traffic (Hourly, UTC)
            </div>
            <div className="dash-heatmap">
              {heatHours.map((h) => {
                const cell = data.hourlyHeatmap[h] || { count: 0, tier: 'low' as const };
                const tierClass = cell.tier === 'peak' ? 'peak' : cell.tier === 'mid' ? 'mid' : '';
                return (
                  <div
                    key={h}
                    className={`dash-h-box ${tierClass}`.trim()}
                    title={`${formatHourLabel(h)}: ${cell.count} attempts`}
                  >
                    {formatHourLabel(h)}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 30 }}>
              <div className="dash-card-h" style={{ fontSize: 14 }}>
                Trending tests ({data.rangeDays}d)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {topicBadges.map((t, idx) => (
                  <span key={`${idx}-${t}`} className="dash-badge">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="dash-card">
            <div className="dash-card-h">
              <i className="fas fa-filter" style={{ color: '#4f46e5' }} aria-hidden="true" /> Test funnel ({data.rangeDays}d)
            </div>
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, marginBottom: 5, fontWeight: 600 }}>
                Attempts: {data.funnel.opened.toLocaleString('en-IN')}
              </p>
              <div className="dash-funnel-bar">
                <div className="dash-funnel-fill" style={{ width: `${data.funnel.percents.opened}%` }} />
              </div>
              <p style={{ fontSize: 13, marginBottom: 5, fontWeight: 600 }}>
                Unique users: {data.funnel.started.toLocaleString('en-IN')}
              </p>
              <div className="dash-funnel-bar">
                <div className="dash-funnel-fill" style={{ width: `${data.funnel.percents.started}%` }} />
              </div>
              <p style={{ fontSize: 13, marginBottom: 5, fontWeight: 600 }}>
                Strong finishes (≥50%): {data.funnel.completed.toLocaleString('en-IN')}
              </p>
              <div className="dash-funnel-bar">
                <div className="dash-funnel-fill" style={{ width: `${data.funnel.percents.completed}%` }} />
              </div>
            </div>
            <p className="dash-insight">
              *Insight: about {data.funnel.dropoffPct}% of attempts in the selected window scored below 50% accuracy.
            </p>
          </div>
        </div>

        <div className="dash-card dash-table-card">
          <div className="dash-card-h">
            <i className="fas fa-trophy" style={{ color: '#eab308' }} aria-hidden="true" /> Top tests ({data.rangeDays}d)
          </div>
          <p className="dash-card-sub">By number of completed attempts in the window. Average accuracy excludes empty scores.</p>
          <table className="dash-top-tests-table">
            <thead>
              <tr>
                <th>TEST</th>
                <th>ATTEMPTS</th>
                <th>AVG %</th>
                <th>LAST (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {!data.topTests?.length ? (
                <tr>
                  <td colSpan={4} style={{ color: '#64748b' }}>
                    No completed attempts in this range.
                  </td>
                </tr>
              ) : (
                data.topTests.map((row, idx) => (
                  <tr key={`${row.title}-${idx}`}>
                    <td>{row.title || '—'}</td>
                    <td>{row.attemptsCount.toLocaleString('en-IN')}</td>
                    <td>{row.avgAccuracy == null ? '—' : `${Math.round(row.avgAccuracy)}%`}</td>
                    <td>{formatDateShort(row.lastAttemptAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="dash-card dash-table-card">
          <div className="dash-card-h">Live Activity Feed</div>
          <table>
            <thead>
              <tr>
                <th>STUDENT</th>
                <th>TOPIC</th>
                <th>ACCURACY</th>
                <th>TIME</th>
                <th>DEVICE</th>
              </tr>
            </thead>
            <tbody>
              {data.activityFeed.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#64748b' }}>
                    No attempts yet.
                  </td>
                </tr>
              ) : (
                data.activityFeed.map((row, idx) => (
                  <tr key={`${row.student}-${row.completedAt}-${idx}`}>
                    <td>{row.student}</td>
                    <td>{row.topic}</td>
                    <td>{row.accuracyPct}%</td>
                    <td>{formatRelative(row.completedAt)}</td>
                    <td>{row.device}</td>
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
