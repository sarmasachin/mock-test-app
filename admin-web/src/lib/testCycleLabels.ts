/**
 * Phase 6 — Admin labels for attempt duration vs exam cycle (mirrors server testCycleWindow modes).
 */

export const CYCLE_MODES = {
  SCHEDULED_WITH_CYCLE_DAYS: 'scheduled_with_cycle_days',
  SCHEDULED_SINGLE: 'scheduled_single',
  ROLLING_NO_EXAM_DATE: 'rolling_no_exam_date',
  MANUAL_NO_AUTO_CYCLE: 'manual_no_auto_cycle',
} as const;

export type CycleMode = (typeof CYCLE_MODES)[keyof typeof CYCLE_MODES];

export const ATTEMPT_DURATION_LABEL = 'Attempt duration (minutes)';
export const ATTEMPT_DURATION_TITLE =
  'How long each student has to finish once the exam starts. Does NOT control catalog republish or cycle rollover.';

export const DYNAMIC_DATE_LABEL = 'Dynamic date (repeat cycles)';
export const DYNAMIC_FLUCTUATION_TITLE =
  'Shuffles questions/options on republish — separate from cycle timing.';
export const STATE_EXAM_FLUCTUATION_HINT =
  'State exam tests keep shuffle off so your fixed question paper is not replaced on publish.';

export const NOTIFY_CYCLE_REPUBLISH_TITLE =
  'Push when the server auto-republishes after a cycle ends (exam finish or N-day rollover) plus the republish gap.';

export const CYCLE_REPUBLISH_GAP_TITLE =
  'Minutes after the planned cycle end (exam finish or N-day boundary) before auto-republish. Blank = server default (30 min).';

/** Mirror of server classifyCycleMode(row). */
export function classifyCycleModeInput(input: {
  examDate?: string;
  dynamicDateEnabled?: boolean;
  dateCycleDays?: number | string;
}): CycleMode {
  const examDate = String(input.examDate || '').trim();
  const dateOn = input.dynamicDateEnabled === true;
  const cycleDays = Math.max(0, Number(input.dateCycleDays || 0));
  if (examDate) {
    return dateOn && cycleDays > 0
      ? CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS
      : CYCLE_MODES.SCHEDULED_SINGLE;
  }
  if (dateOn && cycleDays > 0) return CYCLE_MODES.ROLLING_NO_EXAM_DATE;
  return CYCLE_MODES.MANUAL_NO_AUTO_CYCLE;
}

export function dateCycleDaysLabel(): string {
  return 'Repeat every (days)';
}

export function dateCycleDaysTitle(mode: CycleMode): string {
  switch (mode) {
    case CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS:
      return 'Exam date + dynamic date: rollover when the exam window ends (attempt duration), not every N days from publish alone. N days advances the displayed exam schedule between cycles.';
    case CYCLE_MODES.ROLLING_NO_EXAM_DATE:
      return 'No exam date: a new cycle starts N days after publish or last rollover.';
    case CYCLE_MODES.SCHEDULED_SINGLE:
      return 'Optional: enable Dynamic date and set days ≥ 1 to repeat on a schedule.';
    default:
      return 'Enable Dynamic date and set days ≥ 1 to repeat on a schedule.';
  }
}

export function dynamicDateTitle(): string {
  return 'Enables repeating exam cycles. Use with Repeat every (days). Does not change attempt duration.';
}

export function cycleModeHint(mode: CycleMode, dateCycleDays: number): string {
  const days = Math.max(0, Number(dateCycleDays) || 0);
  switch (mode) {
    case CYCLE_MODES.MANUAL_NO_AUTO_CYCLE:
      return 'Manual cycle — no automatic rollover while published. Apply stays open; use Republish now or unpublish manually. (Example: ff with Date off.)';
    case CYCLE_MODES.ROLLING_NO_EXAM_DATE:
      return `Rolling cycle — new apply window every ${days} day(s) from publish/rollover. No exam date required.`;
    case CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS:
      return `Scheduled + ${days}-day cycles — apply opens before exam; closes during exam; next cycle after exam ends (scheduler). Attempt length = duration field only — not the repeat interval.`;
    case CYCLE_MODES.SCHEDULED_SINGLE:
      return 'Single scheduled exam — rollover after exam window ends. Turn on Dynamic date + days to enable multi-cycle repeats.';
    default:
      return '';
  }
}

export function formatListAttemptLine(durationMinutes: number, questionCount: number): string {
  return `Attempt ${durationMinutes}m · ${questionCount} Q`;
}

export function formatListCycleLine(dynamicDateEnabled: boolean | undefined, dateCycleDays: number | undefined): string {
  if (!dynamicDateEnabled) return 'Cycle: manual';
  const days = Math.max(0, Number(dateCycleDays) || 0);
  return days > 0 ? `Cycle: every ${days}d` : 'Cycle: on (set days)';
}
