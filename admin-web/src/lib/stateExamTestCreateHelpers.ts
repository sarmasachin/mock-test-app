import type { StateExamTestSyncValue } from '../components/StateExamTestSyncFields';
import { INDIA_STATE_OPTIONS } from './indianStateVisualCatalog';
import {
  resolveSectionSlugForSync,
  slugFromTitle,
  type SectionTemplate,
} from './stateExamWizard';

export type ScheduleFormSetters = {
  setDurationMinutes: (v: string) => void;
  setQuestionCount: (v: string) => void;
  setTotalMarks: (v: string) => void;
  setCapacityTotal: (v: string) => void;
  setAttemptsAllowed: (v: string) => void;
  setLanguageMode: (v: string) => void;
  setExamMode: (v: string) => void;
  setNegativeMarkingText: (v: string) => void;
  setTestTypeLabel: (v: string) => void;
  setIsPublished: (v: boolean) => void;
};

export type SmartTestCreateFlags = {
  slugManual: boolean;
  subcategoryManual: boolean;
  scheduleManual: boolean;
  sectionManual: boolean;
};

export function createSmartTestCreateFlags(): SmartTestCreateFlags {
  return { slugManual: false, subcategoryManual: false, scheduleManual: false, sectionManual: false };
}

export type StateExamDraftFormPatch = {
  durationMinutes?: string;
  questionCount?: string;
  totalMarks?: string;
  capacityTotal?: string;
  attemptsAllowed?: string;
  languageMode?: string;
  examMode?: string;
  negativeMarkingText?: string;
  testTypeLabel?: string;
  isPublished?: boolean;
};

export function resolveStateEnglishFromSync(sync: StateExamTestSyncValue): string {
  return INDIA_STATE_OPTIONS.find((s) => s.slug === sync.stateSlug)?.english || 'State';
}

export function buildStateExamDraftDefaults(_stateEnglish?: string): Required<StateExamDraftFormPatch> {
  return {
    durationMinutes: '60',
    questionCount: '1',
    totalMarks: '0',
    capacityTotal: '500',
    attemptsAllowed: '1',
    languageMode: 'Bilingual',
    examMode: 'Practice',
    negativeMarkingText: 'No',
    testTypeLabel: 'Full Mock',
    isPublished: false,
  };
}

export function resolveDynamicFluctuationOnPublishForSave(input: {
  sync: StateExamTestSyncValue;
  currentValue: boolean;
}): boolean {
  if (input.sync.enabled) return false;
  return input.currentValue !== false;
}

export function applyStateExamFluctuationDefaultToForm(sync: StateExamTestSyncValue, isEditing: boolean): boolean | null {
  if (!sync.enabled || isEditing) return null;
  return false;
}

export function buildStateExamMetaLine(stateEnglish: string): string {
  return `${stateEnglish} mock test`;
}

/** Fill schedule/capacity defaults for quick state-exam draft (All Tests tab). */
export function applyStateExamScheduleDefaults(input: {
  sync: StateExamTestSyncValue;
  flags: SmartTestCreateFlags;
  isEditing: boolean;
  current: StateExamDraftFormPatch;
}): StateExamDraftFormPatch | null {
  if (!input.sync.enabled || input.isEditing || input.flags.scheduleManual) return null;
  const stateEnglish = resolveStateEnglishFromSync(input.sync);
  const defaults = buildStateExamDraftDefaults(stateEnglish);
  const patch: StateExamDraftFormPatch = {};
  const pairs: Array<[keyof StateExamDraftFormPatch, string | boolean | undefined]> = [
    ['durationMinutes', input.current.durationMinutes],
    ['questionCount', input.current.questionCount],
    ['totalMarks', input.current.totalMarks],
    ['capacityTotal', input.current.capacityTotal],
    ['attemptsAllowed', input.current.attemptsAllowed],
    ['languageMode', input.current.languageMode],
    ['examMode', input.current.examMode],
    ['negativeMarkingText', input.current.negativeMarkingText],
    ['testTypeLabel', input.current.testTypeLabel],
    ['isPublished', input.current.isPublished],
  ];
  for (const [key, value] of pairs) {
    if (key === 'isPublished') {
      patch.isPublished = defaults.isPublished;
      continue;
    }
    const str = String(value ?? '').trim();
    if (!str) patch[key] = defaults[key] as string;
  }
  return Object.keys(patch).length ? patch : null;
}

/** Merge empty required fields at submit so admin can save with only title + sync. */
export function resolveStateExamSubmitDefaults(input: {
  sync: StateExamTestSyncValue;
  isEditing: boolean;
  scheduleManual: boolean;
  values: StateExamDraftFormPatch & { metaLine?: string };
}): StateExamDraftFormPatch & { metaLine?: string } {
  if (!input.sync.enabled || input.isEditing) return input.values;
  const stateEnglish = resolveStateEnglishFromSync(input.sync);
  const defaults = buildStateExamDraftDefaults(stateEnglish);
  const out = { ...input.values };
  if (!String(out.durationMinutes ?? '').trim()) out.durationMinutes = defaults.durationMinutes;
  if (!String(out.questionCount ?? '').trim()) out.questionCount = defaults.questionCount;
  if (!String(out.totalMarks ?? '').trim()) out.totalMarks = defaults.totalMarks;
  if (!String(out.capacityTotal ?? '').trim()) out.capacityTotal = defaults.capacityTotal;
  if (!String(out.attemptsAllowed ?? '').trim()) out.attemptsAllowed = defaults.attemptsAllowed;
  if (!String(out.languageMode ?? '').trim()) out.languageMode = defaults.languageMode;
  if (!String(out.examMode ?? '').trim()) out.examMode = defaults.examMode;
  if (!String(out.negativeMarkingText ?? '').trim()) out.negativeMarkingText = defaults.negativeMarkingText;
  if (!String(out.testTypeLabel ?? '').trim()) out.testTypeLabel = defaults.testTypeLabel;
  if (!input.scheduleManual) out.isPublished = defaults.isPublished;
  if (!String(out.metaLine ?? '').trim()) out.metaLine = buildStateExamMetaLine(stateEnglish);
  return out;
}

export function suggestSectionSlugForWizard(
  examName: string,
  sections: SectionTemplate[],
  flags: SmartTestCreateFlags,
): string | null {
  if (!examName.trim() || flags.sectionManual) return null;
  return resolveSectionSlugForSync(examName, sections);
}

/** Auto-fill slug + subcategory + section when admin types title (new test flow). */
export function applySmartFieldsFromTitle(input: {
  title: string;
  sync: StateExamTestSyncValue;
  sections: SectionTemplate[];
  flags: SmartTestCreateFlags;
  isEditing: boolean;
}): { slug?: string; subcategory?: string; sync?: StateExamTestSyncValue } {
  const title = input.title.trim();
  const out: { slug?: string; subcategory?: string; sync?: StateExamTestSyncValue } = {};

  if (input.isEditing) return out;

  if (!input.flags.slugManual && title) {
    out.slug = slugFromTitle(title);
  }

  if (input.sync.enabled && !input.flags.subcategoryManual && title) {
    out.subcategory = title;
    out.sync = {
      ...input.sync,
      sectionSlug: resolveSectionSlugForSync(title, input.sections),
    };
  }

  return out;
}

function applySchedulePatch(setters: ScheduleFormSetters, patch: StateExamDraftFormPatch) {
  if (patch.durationMinutes != null) setters.setDurationMinutes(patch.durationMinutes);
  if (patch.questionCount != null) setters.setQuestionCount(patch.questionCount);
  if (patch.totalMarks != null) setters.setTotalMarks(patch.totalMarks);
  if (patch.capacityTotal != null) setters.setCapacityTotal(patch.capacityTotal);
  if (patch.attemptsAllowed != null) setters.setAttemptsAllowed(patch.attemptsAllowed);
  if (patch.languageMode != null) setters.setLanguageMode(patch.languageMode);
  if (patch.examMode != null) setters.setExamMode(patch.examMode);
  if (patch.negativeMarkingText != null) setters.setNegativeMarkingText(patch.negativeMarkingText);
  if (patch.testTypeLabel != null) setters.setTestTypeLabel(patch.testTypeLabel);
  if (patch.isPublished != null) setters.setIsPublished(patch.isPublished);
}

export function applyStateExamScheduleDefaultsToForm(
  input: Parameters<typeof applyStateExamScheduleDefaults>[0],
  setters: ScheduleFormSetters,
): void {
  const patch = applyStateExamScheduleDefaults(input);
  if (patch) applySchedulePatch(setters, patch);
}

/** When admin enables state exam sync on an existing draft form. */
export function applySmartFieldsOnSyncEnable(input: {
  title: string;
  subcategory: string;
  sync: StateExamTestSyncValue;
  sections: SectionTemplate[];
  flags: SmartTestCreateFlags;
}): { subcategory?: string; sync: StateExamTestSyncValue; flags: SmartTestCreateFlags } {
  const label = input.subcategory.trim() || input.title.trim();
  const nextSync: StateExamTestSyncValue = {
    ...input.sync,
    enabled: true,
    sectionSlug: resolveSectionSlugForSync(label, input.sections),
  };
  const nextFlags = { ...input.flags };
  let nextSubcategory: string | undefined;

  if (!input.flags.subcategoryManual && label) {
    nextSubcategory = label;
    nextFlags.subcategoryManual = false;
  }

  return { subcategory: nextSubcategory, sync: nextSync, flags: nextFlags };
}
