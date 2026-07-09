import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import type { DailyQuizAdminStatsData, DailyQuizAnswerReviewPrefill } from './dailyQuizTypes';

let chartJsRegistered = false;
function ensureChartJsRegistered() {
  if (chartJsRegistered) return;
  Chart.register(...registerables);
  chartJsRegistered = true;
}

type Props = {
  data: DailyQuizAdminStatsData;
  loading: boolean;
  onOpenAnswerReview: (prefill: DailyQuizAnswerReviewPrefill) => void;
};

export function DailyQuizOverviewPanel({ data, loading, onOpenAnswerReview }: Props) {
  const lineRef = useRef<HTMLCanvasElement>(null);
  const donutRef = useRef<HTMLCanvasElement>(null);
  const lineChartRef = useRef<{ destroy: () => void } | null>(null);
  const donutChartRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (loading) return;
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
      console.error('daily_quiz_overview_charts_failed', e);
    }

    return () => {
      lineChartRef.current?.destroy();
      lineChartRef.current = null;
      donutChartRef.current?.destroy();
      donutChartRef.current = null;
    };
  }, [data, loading]);

  return (
    <>
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
        <p className="dq-recent-hint">Click a row to open Answer Review for that attempt.</p>
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
                <tr
                  key={`${row.quizDay}-${row.student}-${idx}`}
                  className="dq-recent-row"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onOpenAnswerReview({
                      studentQ: row.student,
                      quizDay: row.quizDay,
                      questionQ: row.questionPrompt,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenAnswerReview({
                        studentQ: row.student,
                        quizDay: row.quizDay,
                        questionQ: row.questionPrompt,
                      });
                    }
                  }}
                  title="Open in Answer Review"
                  style={{ cursor: 'pointer' }}
                >
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
    </>
  );
}
