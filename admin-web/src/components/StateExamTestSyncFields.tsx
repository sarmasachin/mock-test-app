import { DEFAULT_SECTION_TEMPLATES, type SectionTemplate } from '../lib/stateExamWizard';
import { INDIA_STATE_OPTIONS } from '../lib/indianStateVisualCatalog';

export type { SectionTemplate };

export type StateExamTestSyncValue = {
  enabled: boolean;
  stateSlug: string;
  sectionSlug: string;
  featured: boolean;
  itemSortOrder: number;
};

export const DEFAULT_STATE_EXAM_TEST_SYNC: StateExamTestSyncValue = {
  enabled: false,
  stateSlug: 'hp',
  sectionSlug: 'other',
  featured: false,
  itemSortOrder: 1,
};

export function buildStateExamSyncApiPayload(
  sync: StateExamTestSyncValue,
): Record<string, unknown> | undefined {
  if (!sync.enabled) return undefined;
  const state = INDIA_STATE_OPTIONS.find((s) => s.slug === sync.stateSlug) || INDIA_STATE_OPTIONS[0];
  return {
    enabled: true,
    stateName: state.english,
    sectionSlug: sync.sectionSlug,
    featured: sync.featured,
    itemSortOrder: sync.itemSortOrder,
  };
}

type Props = {
  value: StateExamTestSyncValue;
  onChange: (next: StateExamTestSyncValue) => void;
  sections?: SectionTemplate[];
  disabled?: boolean;
};

export function StateExamTestSyncFields({
  value,
  onChange,
  sections = DEFAULT_SECTION_TEMPLATES,
  disabled = false,
}: Props) {
  return (
    <div className="state-exam-test-sync-panel">
      <label className="check-wrap">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Add / sync State exam circle (examCategories)
      </label>
      {value.enabled ? (
        <div className="state-exam-test-sync-fields">
          <label className="all-tests-field">
            <span>State</span>
            <select
              value={value.stateSlug}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, stateSlug: e.target.value })}
            >
              {INDIA_STATE_OPTIONS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.english}
                </option>
              ))}
            </select>
          </label>
          <label className="all-tests-field">
            <span>Section</span>
            <select
              value={value.sectionSlug}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, sectionSlug: e.target.value })}
            >
              {sections.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.titleHi} — {s.titleEn}
                </option>
              ))}
            </select>
          </label>
          <div className="state-exam-wizard-row">
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={value.featured}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, featured: e.target.checked })}
              />
              Featured
            </label>
            <label className="all-tests-field state-exam-order-field">
              <span>Order</span>
              <input
                type="number"
                min={1}
                max={9999}
                value={value.itemSortOrder}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, itemSortOrder: Number(e.target.value) || 1 })}
              />
            </label>
          </div>
          <p className="muted state-exam-footnote">
            With sync on: subcategory copies from title and section is auto-suggested (Police, Teaching, Patwari, …).
            Server links test ↔ exam circle on save.
          </p>
        </div>
      ) : null}
    </div>
  );
}
