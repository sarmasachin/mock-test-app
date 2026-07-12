import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminToast } from '../adminToast';
import { usePermissionGuard } from '../hooks/usePermissionGuard';
import { INDIA_STATE_OPTIONS } from '../lib/indianStateVisualCatalog';
import {
  applySectionRowOrder,
  buildWizardCategoryDraft,
  collectWizardWarnings,
  groupStateRowsBySection,
  mapExamCategoriesFromApi,
  mapSectionTemplatesFromApi,
  mapTestsFromApi,
  mergeCategoryRow,
  slugFromTitle,
  toggleRowFeatured,
  wizardHasBlockingErrors,
  type AdminTestPick,
  type ExamCategoryRow,
  type SectionTemplate,
  type WizardInput,
} from '../lib/stateExamWizard';
import { StateExamSectionTemplatesEditor } from '../components/StateExamSectionTemplatesEditor';
import { StateExamReorderPanel } from '../components/StateExamReorderPanel';
import {
  AddQuestionsNowBanner,
  type QuestionBuilderShortcutTarget,
} from '../components/AddQuestionsNowBanner';
import { suggestSectionSlugForWizard } from '../lib/stateExamTestCreateHelpers';
import { useAdminRbac } from '../adminRbacContext';

type ApiClient = {
  get: (url: string, config?: any) => Promise<any>;
  patch: (url: string, data?: any, config?: any) => Promise<any>;
  post: (url: string, data?: any, config?: any) => Promise<any>;
};

export function StateExamManagerTabImpl({
  apiClient,
  onOpenQuestionBuilder,
}: {
  apiClient: ApiClient;
  onOpenQuestionBuilder?: (testId: string) => void;
}) {
  const { pushToast } = useAdminToast();
  const guard = usePermissionGuard();
  const rbac = useAdminRbac();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<ExamCategoryRow[]>([]);
  const [tests, setTests] = useState<AdminTestPick[]>([]);
  const [sections, setSections] = useState<SectionTemplate[]>([]);

  const [stateSlug, setStateSlug] = useState('hp');
  const [sectionSlug, setSectionSlug] = useState('teaching');
  const [examName, setExamName] = useState('');
  const [featured, setFeatured] = useState(false);
  const [itemSortOrder, setItemSortOrder] = useState(1);
  const [testMode, setTestMode] = useState<'existing' | 'new'>('existing');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [createTest, setCreateTest] = useState(true);
  const [managerMode, setManagerMode] = useState<'add' | 'manage'>('add');
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [questionBuilderShortcut, setQuestionBuilderShortcut] =
    useState<QuestionBuilderShortcutTarget | null>(null);
  const sectionManualRef = useRef(false);

  const selectedState = useMemo(
    () => INDIA_STATE_OPTIONS.find((s) => s.slug === stateSlug) || INDIA_STATE_OPTIONS[0],
    [stateSlug],
  );

  const wizardInput: WizardInput = useMemo(
    () => ({
      state: selectedState,
      sectionSlug,
      examName,
      featured,
      itemSortOrder,
      testMode,
      selectedTestId,
      createTest,
    }),
    [selectedState, sectionSlug, examName, featured, itemSortOrder, testMode, selectedTestId, createTest],
  );

  const warnings = useMemo(
    () => collectWizardWarnings(wizardInput, categories, tests),
    [wizardInput, categories, tests],
  );

  const previewDraft = useMemo(() => {
    if (!examName.trim()) return null;
    try {
      return buildWizardCategoryDraft(wizardInput, sections);
    } catch {
      return null;
    }
  }, [wizardInput, sections, examName]);

  const stateExamCount = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.enabled &&
          c.level1 === 'State' &&
          c.level2.trim().toLowerCase() === selectedState.english.toLowerCase(),
      ).length,
    [categories, selectedState.english],
  );

  const totalStateExamCount = useMemo(
    () => categories.filter((c) => c.enabled && c.level1 === 'State').length,
    [categories],
  );

  useEffect(() => {
    if (!sections.some((s) => s.slug === sectionSlug)) {
      setSectionSlug(sections[0]?.slug || 'other');
    }
  }, [sections, sectionSlug]);

  useEffect(() => {
    const suggested = suggestSectionSlugForWizard(examName, sections, {
      slugManual: false,
      subcategoryManual: false,
      scheduleManual: false,
      sectionManual: sectionManualRef.current,
    });
    if (suggested) setSectionSlug(suggested);
  }, [examName, sections]);

  function resetWizardForm() {
    setExamName('');
    setSelectedTestId('');
    setFeatured(false);
    setItemSortOrder(1);
    void load();
  }

  function offerQuestionBuilderShortcut(testId: string, testTitle: string) {
    const id = String(testId || '').trim();
    const title = String(testTitle || '').trim();
    if (!id || !title || !onOpenQuestionBuilder || !rbac.canEditQuestions) return;
    setQuestionBuilderShortcut({ testId: id, testTitle: title });
  }

  function openQuestionBuilderShortcut(testId: string) {
    if (!onOpenQuestionBuilder || !rbac.canEditQuestions) return;
    onOpenQuestionBuilder(testId);
    setQuestionBuilderShortcut(null);
  }

  async function persistCategories(nextItems: ExamCategoryRow[], successMessage?: string) {
    if (!guard('tab_exam_categories')) return;
    setSaving(true);
    try {
      const saveRes = await apiClient.patch('/admin/settings', {
        examCategories: { items: nextItems },
      });
      const fromServer = (saveRes.data as { settings?: { examCategories?: { items?: unknown } } })?.settings
        ?.examCategories?.items;
      setCategories(mapExamCategoriesFromApi(fromServer || nextItems));
      if (successMessage) pushToast('success', successMessage);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        'Failed to save exam order';
      pushToast('error', msg);
    } finally {
      setSaving(false);
    }
  }

  async function onReorderSection(sectionKey: string, orderedIds: string[]) {
    const next = applySectionRowOrder(categories, selectedState.english, sectionKey, orderedIds);
    await persistCategories(next, 'Exam order saved.');
  }

  async function onToggleFeaturedRow(rowId: string) {
    const next = toggleRowFeatured(categories, rowId);
    await persistCategories(next, 'Featured flag updated.');
  }

  function moveRowInSection(sectionKey: string, rowId: string, direction: -1 | 1) {
    const group = groupStateRowsBySection(categories, selectedState.english, sections).find(
      (g) => g.sectionSlug === sectionKey,
    );
    if (!group) return;
    const ids = group.items.map((r) => r.id);
    const idx = ids.indexOf(rowId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= ids.length) return;
    const nextIds = [...ids];
    const [removed] = nextIds.splice(idx, 1);
    nextIds.splice(target, 0, removed);
    void onReorderSection(sectionKey, nextIds);
  }

  async function load() {
    setLoading(true);
    try {
      const [settingsRes, testsRes] = await Promise.all([
        apiClient.get('/admin/settings'),
        apiClient.get('/admin/tests'),
      ]);
      const settings = (settingsRes.data as { settings?: Record<string, unknown> })?.settings || {};
      setCategories(mapExamCategoriesFromApi((settings.examCategories as { items?: unknown })?.items));
      setSections(mapSectionTemplatesFromApi(settings.stateExamSectionTemplates));
      const testItems = (testsRes.data as { items?: unknown })?.items;
      setTests(mapTestsFromApi(testItems));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to load wizard data';
      pushToast('error', msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickTest(testId: string) {
    setSelectedTestId(testId);
    const t = tests.find((x) => x.id === testId);
    if (t) {
      setExamName(t.subcategory.trim() || t.title);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!guard('tab_exam_categories')) return;
    if (wizardHasBlockingErrors(warnings)) {
      pushToast('error', 'Fix errors in the form before saving.');
      return;
    }

    const level3 = examName.trim();
    if (!level3) {
      pushToast('error', 'Exam name is required.');
      return;
    }

    setSaving(true);
    setQuestionBuilderShortcut(null);
    try {
      let linkedTestId = testMode === 'existing' ? selectedTestId : '';

      if (testMode === 'new' && createTest) {
        const slug = slugFromTitle(level3);
        const createRes = await apiClient.post('/admin/tests', {
          title: level3,
          subcategory: level3,
          slug,
          metaLine: `${selectedState.english} mock test`,
          durationMinutes: 60,
          questionCount: 1,
          testKind: 'mock',
          isPublished: false,
          dynamicFluctuationOnPublish: false,
          stateExamSync: {
            enabled: true,
            stateName: selectedState.english,
            sectionSlug,
            featured,
            itemSortOrder,
          },
        });
        linkedTestId = String((createRes.data as { item?: { id?: string } })?.item?.id || '');
        if (!linkedTestId) {
          throw new Error('Test created but id missing in response');
        }
        const stubInserted =
          (createRes.data as { draftStubQuestion?: { inserted?: boolean } })?.draftStubQuestion?.inserted ===
          true;
        const stubHint = stubInserted
          ? ' A sample draft question was added — edit it in Question Builder before publish.'
          : '';
        const synced = (createRes.data as { examCategorySync?: { synced?: boolean } })?.examCategorySync
          ?.synced;
        if (synced) {
          pushToast(
            'success',
            `Test + state exam circle saved for ${selectedState.english}.${stubHint}`,
          );
          offerQuestionBuilderShortcut(linkedTestId, level3);
          resetWizardForm();
          return;
        }
        pushToast('success', `Draft test created.${stubHint} Publish only after adding real published questions.`);
      } else if (testMode === 'existing' && selectedTestId) {
        const test = tests.find((t) => t.id === selectedTestId);
        if (test && test.subcategory.trim().toLowerCase() !== level3.toLowerCase()) {
          await apiClient.patch(`/admin/tests/${selectedTestId}`, {
            subcategory: level3,
            title: test.title.trim() || level3,
          });
          pushToast('warning', 'Test subcategory updated to match exam name.');
        }
        linkedTestId = selectedTestId;
      }

      const draft = buildWizardCategoryDraft(
        { ...wizardInput, selectedTestId: linkedTestId, testMode: linkedTestId ? 'existing' : testMode },
        sections,
      );
      draft.linkedTestId = linkedTestId || null;

      const nextItems = mergeCategoryRow(categories, draft);
      const saveRes = await apiClient.patch('/admin/settings', {
        examCategories: { items: nextItems },
      });
      const fromServer = (saveRes.data as { settings?: { examCategories?: { items?: unknown } } })?.settings
        ?.examCategories?.items;
      setCategories(mapExamCategoriesFromApi(fromServer || nextItems));
      pushToast('success', `Saved "${level3}" for ${selectedState.english}.`);
      if (linkedTestId) {
        offerQuestionBuilderShortcut(linkedTestId, level3);
      }
      resetWizardForm();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        'Failed to save state exam';
      pushToast('error', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-card state-exam-manager-panel">
      <div className="panel-head">
        <h3>State Exam Manager</h3>
        <p className="muted">
          Add state exam circles without remembering Level 1/2/3 rules. Pick state → section → test → Save.
        </p>
      </div>

      {loading ? (
        <p className="muted">Loading states, sections, and tests…</p>
      ) : (
        <>
          {questionBuilderShortcut ? (
            <AddQuestionsNowBanner
              target={questionBuilderShortcut}
              onAddQuestions={openQuestionBuilderShortcut}
              onDismiss={() => setQuestionBuilderShortcut(null)}
              disabled={saving || !rbac.canEditQuestions}
            />
          ) : null}

          <div className="state-exam-manager-tabs" role="tablist" aria-label="State exam manager mode">
            <button
              type="button"
              role="tab"
              aria-selected={managerMode === 'add'}
              className={`state-exam-manager-tab${managerMode === 'add' ? ' is-active' : ''}`}
              onClick={() => setManagerMode('add')}
            >
              Add exam
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={managerMode === 'manage'}
              className={`state-exam-manager-tab${managerMode === 'manage' ? ' is-active' : ''}`}
              onClick={() => setManagerMode('manage')}
            >
              Manage order
              {totalStateExamCount > 0 ? (
                <span className="state-exam-manager-tab-badge">{totalStateExamCount}</span>
              ) : null}
            </button>
          </div>

          {managerMode === 'manage' ? (
            <StateExamReorderPanel
              categories={categories}
              sections={sections}
              stateSlug={stateSlug}
              onStateSlugChange={setStateSlug}
              saving={saving}
              dragRowId={dragRowId}
              onDragRowIdChange={setDragRowId}
              onReorderSection={onReorderSection}
              onToggleFeaturedRow={(rowId) => void onToggleFeaturedRow(rowId)}
              onMoveRow={moveRowInSection}
            />
          ) : (
          <div className="state-exam-manager-grid">
          <form className="state-exam-wizard-form" onSubmit={onSubmit}>
            <label className="all-tests-field">
              <span>State</span>
              <select value={stateSlug} onChange={(e) => setStateSlug(e.target.value)} required>
                {INDIA_STATE_OPTIONS.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.english} ({s.hindi})
                  </option>
                ))}
              </select>
            </label>

            <label className="all-tests-field">
              <span>Section</span>
              <select
                value={sectionSlug}
                onChange={(e) => {
                  sectionManualRef.current = true;
                  setSectionSlug(e.target.value);
                }}
                required
              >
                {sections.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.titleHi} — {s.titleEn}
                  </option>
                ))}
              </select>
            </label>

            <label className="all-tests-field">
              <span>Test link</span>
              <select value={testMode} onChange={(e) => setTestMode(e.target.value as 'existing' | 'new')}>
                <option value="existing">Use existing test</option>
                <option value="new">Create new test</option>
              </select>
            </label>

            {testMode === 'existing' ? (
              <label className="all-tests-field">
                <span>Existing test</span>
                <select
                  value={selectedTestId}
                  onChange={(e) => onPickTest(e.target.value)}
                  required={testMode === 'existing'}
                >
                  <option value="">— Select test —</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.subcategory && t.subcategory !== t.title ? ` [${t.subcategory}]` : ''}
                      {t.is_published ? '' : ' (draft)'}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="check-wrap state-exam-check">
                <input
                  type="checkbox"
                  checked={createTest}
                  onChange={(e) => setCreateTest(e.target.checked)}
                />
                Create draft test in All Tests (same title + subcategory)
              </label>
            )}

            <label className="all-tests-field">
              <span>Exam name (Level 3 / circle label)</span>
              <input
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g. HP Math Teacher, Bihar Police Constable"
                required
                maxLength={80}
              />
            </label>

            <div className="state-exam-wizard-row">
              <label className="check-wrap">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                Featured (show first in section)
              </label>
              <label className="all-tests-field state-exam-order-field">
                <span>Order</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={itemSortOrder}
                  onChange={(e) => setItemSortOrder(Number(e.target.value) || 1)}
                />
              </label>
            </div>

            <button type="submit" disabled={saving || wizardHasBlockingErrors(warnings)}>
              {saving ? 'Saving…' : 'Save state exam circle'}
            </button>
          </form>

          <aside className="state-exam-wizard-aside">
            <h4>Preview</h4>
            {previewDraft ? (
              <ul className="state-exam-preview-list">
                <li>
                  <strong>State</strong> {previewDraft.level2}
                </li>
                <li>
                  <strong>Section</strong> {previewDraft.sectionTitle} ({previewDraft.sectionSlug})
                </li>
                <li>
                  <strong>Circle name</strong> {previewDraft.level3}
                </li>
                <li>
                  <strong>iconKey</strong> <code>{previewDraft.iconKey || '—'}</code>
                </li>
                <li>
                  <strong>Featured</strong> {previewDraft.featured ? 'Yes' : 'No'}
                </li>
                <li>
                  <strong>Order</strong> {previewDraft.itemSortOrder}
                </li>
              </ul>
            ) : (
              <p className="muted">Enter exam name to see preview.</p>
            )}

            <h4>Checks</h4>
            {warnings.length === 0 ? (
              <p className="state-exam-ok">Ready to save.</p>
            ) : (
              <ul className="state-exam-warnings">
                {warnings.map((w, i) => (
                  <li key={`${w.level}-${i}`} className={`warn-${w.level}`}>
                    {w.message}
                  </li>
                ))}
              </ul>
            )}

            {stateExamCount > 0 ? (
              <p className="muted state-exam-footnote">
                {selectedState.english} has {stateExamCount} exam{stateExamCount === 1 ? '' : 's'}. Open{' '}
                <button
                  type="button"
                  className="state-exam-inline-link"
                  onClick={() => setManagerMode('manage')}
                >
                  Manage order
                </button>{' '}
                to drag-reorder or toggle featured.
              </p>
            ) : (
              <p className="muted state-exam-footnote">
                After save, use <strong>Manage order</strong> tab to reorder circles in the app.
              </p>
            )}
          </aside>
        </div>
          )}
        </>
      )}

      {!loading ? (
        <StateExamSectionTemplatesEditor
          apiClient={apiClient}
          sections={sections}
          categories={categories}
          disabled={saving}
          onSaved={(next) => {
            setSections(next);
            if (!next.some((s) => s.slug === sectionSlug)) {
              setSectionSlug(next[0]?.slug || 'other');
            }
            pushToast('success', 'Section dropdown updated.');
          }}
        />
      ) : null}
    </section>
  );
}
