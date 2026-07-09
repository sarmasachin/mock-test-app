export type AdminScheduleBaseline = {
  testId: string;
  title: string;
  enrolledCount: number;
  examDate: string;
  slotLabel: string;
  dynamicDateEnabled: boolean;
  dateCycleDays: number;
  durationMinutes: number;
  isPublished: boolean;
  lastCycleStartedAt: string | null;
};

export type AdminCycleRow = {
  exam_date?: string | null;
  slot_label?: string | null;
  dynamic_date_enabled?: boolean;
  date_cycle_days?: number | string;
  duration_minutes?: number | string;
  is_published?: boolean;
  last_cycle_started_at?: string | null;
};

export function hasAdminScheduleFieldsChanged(
  beforeRow: AdminCycleRow | null | undefined,
  afterRow: AdminCycleRow | null | undefined,
): boolean;

export function hasPreviousCatalogCycleEnded(
  beforeRow: AdminCycleRow | null | undefined,
  nowMs?: number,
): boolean;

export function shouldRenewCycleOnAdminEdit(
  beforeRow: AdminCycleRow | null | undefined,
  afterRow: AdminCycleRow | null | undefined,
  nowMs?: number,
): boolean;

export function baselineToCycleRow(baseline: AdminScheduleBaseline): AdminCycleRow;

export function previewRescheduleCycleRenewal(
  baseline: AdminScheduleBaseline | null | undefined,
  draft: {
    examDate: string;
    slotLabel: string;
    dynamicDateEnabled: boolean;
    dateCycleDays: number;
    durationMinutes: number;
    isPublished: boolean;
  },
  nowMs?: number,
): boolean;

export function buildRescheduleConfirmDialog(input: {
  testTitle?: string;
  enrolledCount?: number;
}): {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

export function buildRescheduleInlineNotice(): string;
