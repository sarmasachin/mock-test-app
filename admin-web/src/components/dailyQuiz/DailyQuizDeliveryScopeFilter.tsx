import {
  formatDailyQuizAnalyticsScopeLabel,
  type DailyQuizAnalyticsQuizScope,
} from './dailyQuizScopeUi';

type Props = {
  stateOptions: string[];
  quizScope: DailyQuizAnalyticsQuizScope;
  stateName: string;
  onQuizScopeChange: (quizScope: DailyQuizAnalyticsQuizScope) => void;
  onStateNameChange: (stateName: string) => void;
};

export function DailyQuizDeliveryScopeFilter({
  stateOptions,
  quizScope,
  stateName,
  onQuizScopeChange,
  onStateNameChange,
}: Props) {
  return (
    <div className="dq-delivery-scope-filter" aria-label="Quiz delivery scope filter">
      <label>
        Quiz scope
        <select
          value={quizScope}
          onChange={(e) => {
            const next = e.target.value as DailyQuizAnalyticsQuizScope;
            onQuizScopeChange(next);
            if (next !== 'state') onStateNameChange('');
          }}
          aria-label="Quiz delivery scope"
        >
          <option value="">All data (no filter)</option>
          <option value="all_india">All India quiz items</option>
          <option value="state">State-specific quiz items</option>
        </select>
      </label>
      {quizScope === 'state' ? (
        <label>
          State
          <select
            value={stateName}
            onChange={(e) => onStateNameChange(e.target.value)}
            aria-label="State for quiz scope filter"
          >
            <option value="">Select state…</option>
            {stateOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <span className="dq-delivery-scope-label">
        {formatDailyQuizAnalyticsScopeLabel({ quizScope, stateName })}
      </span>
    </div>
  );
}
