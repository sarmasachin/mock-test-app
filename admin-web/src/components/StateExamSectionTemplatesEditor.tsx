import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAdminDialog } from '../adminDialog';
import { usePermissionGuard } from '../hooks/usePermissionGuard';
import {
  DEFAULT_SECTION_TEMPLATES,
  addSectionTemplate,
  countCategoriesUsingSection,
  removeSectionTemplate,
  slugFromSectionTitle,
  updateSectionTemplate,
  type ExamCategoryRow,
  type SectionTemplate,
} from '../lib/stateExamWizard';

type ApiClient = {
  patch: (url: string, data?: unknown, config?: unknown) => Promise<{ data?: unknown }>;
};

type Props = {
  apiClient: ApiClient;
  sections: SectionTemplate[];
  categories: ExamCategoryRow[];
  onSaved: (next: SectionTemplate[]) => void;
  disabled?: boolean;
};

export function StateExamSectionTemplatesEditor({
  apiClient,
  sections,
  categories,
  onSaved,
  disabled = false,
}: Props) {
  const { confirm } = useAdminDialog();
  const guard = usePermissionGuard();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTitleHi, setNewTitleHi] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(55);
  const [localError, setLocalError] = useState('');

  const newSlugPreview = useMemo(
    () => slugFromSectionTitle(newTitleEn || newTitleHi),
    [newTitleEn, newTitleHi],
  );

  async function persistTemplates(nextSections: SectionTemplate[]) {
    if (!guard('tab_exam_categories')) return;
    setSaving(true);
    setLocalError('');
    try {
      const res = await apiClient.patch('/admin/settings', {
        stateExamSectionTemplates: { items: nextSections },
      });
      const fromServer = (
        res.data as { settings?: { stateExamSectionTemplates?: { items?: unknown } } }
      )?.settings?.stateExamSectionTemplates?.items;
      const mapped =
        Array.isArray(fromServer) && fromServer.length
          ? fromServer.map((row: Record<string, unknown>) => ({
              slug: String(row.slug || ''),
              titleHi: String(row.titleHi || row.title_hi || ''),
              titleEn: String(row.titleEn || row.title_en || ''),
              sortOrder: Number(row.sortOrder ?? row.sort_order ?? 99),
            }))
          : nextSections;
      onSaved(mapped.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        'Failed to save sections';
      setLocalError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function onAddSection(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const result = addSectionTemplate(sections, {
      titleHi: newTitleHi,
      titleEn: newTitleEn,
      sortOrder: newSortOrder,
    });
    if (result.error) {
      setLocalError(result.error);
      return;
    }
    try {
      await persistTemplates(result.items);
      setNewTitleHi('');
      setNewTitleEn('');
      setNewSortOrder(55);
      setLocalError('');
    } catch {
      // error shown via localError
    }
  }

  async function onUpdateSection(slug: string, patch: Partial<Pick<SectionTemplate, 'titleHi' | 'titleEn' | 'sortOrder'>>) {
    if (disabled) return;
    const result = updateSectionTemplate(sections, slug, patch);
    if (result.error) {
      setLocalError(result.error);
      return;
    }
    try {
      await persistTemplates(result.items);
      setLocalError('');
    } catch {
      // error shown via localError
    }
  }

  async function onDeleteSection(slug: string) {
    if (disabled) return;
    const inUse = countCategoriesUsingSection(categories, slug);
    const section = sections.find((s) => s.slug === slug);
    const label = section?.titleEn || section?.titleHi || slug;
    const ok = await confirm({
      title: inUse ? `Remove section "${label}"?` : `Delete section "${label}"?`,
      message: inUse
        ? `${inUse} exam circle(s) still use this section. They will stay linked by slug "${slug}" until you move them. Continue?`
        : 'This section will disappear from all section dropdowns.',
      confirmLabel: inUse ? 'Remove anyway' : 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    const result = removeSectionTemplate(sections, slug);
    if (result.error) {
      setLocalError(result.error);
      return;
    }
    try {
      await persistTemplates(result.items);
      setLocalError('');
    } catch {
      // error shown via localError
    }
  }

  async function onRestoreDefaults() {
    if (disabled) return;
    const ok = await confirm({
      title: 'Restore default sections?',
      message:
        'This replaces your custom section list with the built-in 11 defaults (GK, Police, Teaching, …). Existing exam circles are not deleted.',
      confirmLabel: 'Restore defaults',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await persistTemplates(DEFAULT_SECTION_TEMPLATES.map((row) => ({ ...row })));
      setLocalError('');
    } catch {
      // error shown via localError
    }
  }

  return (
    <div className="state-exam-sections-editor">
      <button
        type="button"
        className="state-exam-sections-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} Manage section dropdown ({sections.length})
      </button>

      {open ? (
        <div className="state-exam-sections-body">
          <p className="muted">
            Add your own sections (Banking, Railway, SSC, …). They appear in State Exam Manager and All Tests sync.
          </p>

          <form className="state-exam-sections-add-form" onSubmit={onAddSection}>
            <label className="all-tests-field">
              <span>Title (Hindi)</span>
              <input
                value={newTitleHi}
                onChange={(e) => setNewTitleHi(e.target.value)}
                placeholder="e.g. बैंकिंग"
                maxLength={120}
                disabled={disabled || saving}
              />
            </label>
            <label className="all-tests-field">
              <span>Title (English)</span>
              <input
                value={newTitleEn}
                onChange={(e) => setNewTitleEn(e.target.value)}
                placeholder="e.g. Banking"
                maxLength={120}
                disabled={disabled || saving}
              />
            </label>
            <label className="all-tests-field state-exam-order-field">
              <span>Order</span>
              <input
                type="number"
                min={0}
                max={999}
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value) || 0)}
                disabled={disabled || saving}
              />
            </label>
            <div className="state-exam-sections-add-meta">
              <span className="muted">
                Slug: <code>{newSlugPreview || '—'}</code>
              </span>
              <button type="submit" disabled={disabled || saving || (!newTitleHi.trim() && !newTitleEn.trim())}>
                {saving ? 'Saving…' : 'Add section'}
              </button>
            </div>
          </form>

          {localError ? <p className="state-exam-sections-error">{localError}</p> : null}

          <ul className="state-exam-sections-list">
            {sections.map((section) => (
              <SectionRowEditor
                key={section.slug}
                section={section}
                inUseCount={countCategoriesUsingSection(categories, section.slug)}
                disabled={disabled || saving}
                onSave={(patch) => void onUpdateSection(section.slug, patch)}
                onDelete={() => void onDeleteSection(section.slug)}
              />
            ))}
          </ul>

          <div className="state-exam-sections-footer">
            <button type="button" className="state-exam-mini-btn" disabled={disabled || saving} onClick={() => void onRestoreDefaults()}>
              Restore 11 defaults
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionRowEditor({
  section,
  inUseCount,
  disabled,
  onSave,
  onDelete,
}: {
  section: SectionTemplate;
  inUseCount: number;
  disabled: boolean;
  onSave: (patch: Partial<Pick<SectionTemplate, 'titleHi' | 'titleEn' | 'sortOrder'>>) => void;
  onDelete: () => void;
}) {
  const [titleHi, setTitleHi] = useState(section.titleHi);
  const [titleEn, setTitleEn] = useState(section.titleEn);
  const [sortOrder, setSortOrder] = useState(section.sortOrder);
  const dirty =
    titleHi !== section.titleHi || titleEn !== section.titleEn || sortOrder !== section.sortOrder;

  useEffect(() => {
    setTitleHi(section.titleHi);
    setTitleEn(section.titleEn);
    setSortOrder(section.sortOrder);
  }, [section.slug, section.titleHi, section.titleEn, section.sortOrder]);

  return (
    <li className="state-exam-sections-row">
      <div className="state-exam-sections-row-fields">
        <input
          value={titleHi}
          onChange={(e) => setTitleHi(e.target.value)}
          placeholder="Hindi title"
          disabled={disabled}
          maxLength={120}
        />
        <input
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="English title"
          disabled={disabled}
          maxLength={120}
        />
        <input
          type="number"
          min={0}
          max={999}
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          disabled={disabled}
          title="Sort order"
        />
      </div>
      <div className="state-exam-sections-row-meta">
        <code>{section.slug}</code>
        {inUseCount > 0 ? <span className="muted">({inUseCount} exams)</span> : null}
        {dirty ? (
          <button
            type="button"
            className="state-exam-mini-btn"
            disabled={disabled}
            onClick={() => onSave({ titleHi, titleEn, sortOrder })}
          >
            Save
          </button>
        ) : null}
        {section.slug !== 'other' ? (
          <button type="button" className="state-exam-mini-btn" disabled={disabled} onClick={onDelete} title="Delete section">
            ✕
          </button>
        ) : null}
      </div>
    </li>
  );
}
