export type QuestionBuilderShortcutTarget = {
  testId: string;
  testTitle: string;
};

type AddQuestionsNowBannerProps = {
  target: QuestionBuilderShortcutTarget;
  onAddQuestions: (testId: string) => void;
  onDismiss?: () => void;
  disabled?: boolean;
};

export function AddQuestionsNowBanner({
  target,
  onAddQuestions,
  onDismiss,
  disabled = false,
}: AddQuestionsNowBannerProps) {
  return (
    <div className="add-questions-now-banner" role="status">
      <p className="add-questions-now-text">
        <strong>{target.testTitle}</strong> is ready. Open Question Builder to add, import, or edit
        questions before publish.
      </p>
      <div className="add-questions-now-actions">
        <button type="button" onClick={() => onAddQuestions(target.testId)} disabled={disabled}>
          Add questions now
        </button>
        {onDismiss ? (
          <button type="button" className="ghost" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
