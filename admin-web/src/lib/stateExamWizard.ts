/**
 * Client helpers for State Exam Manager wizard (Phase 2).
 * Mirrors server stateExamDynamicSpec rules for preview before save.
 */

import { resolveIndianStateSlug, type IndianStateVisualRow } from './indianStateVisualCatalog';

export type SectionTemplate = {
  slug: string;
  titleHi: string;
  titleEn: string;
  sortOrder: number;
};

export const DEFAULT_SECTION_TEMPLATES: SectionTemplate[] = [
  { slug: 'gk', titleHi: 'सामान्य ज्ञान', titleEn: 'General Knowledge', sortOrder: 10 },
  { slug: 'admin', titleHi: 'प्रशासनिक सेवाएँ', titleEn: 'Administrative Services', sortOrder: 20 },
  { slug: 'police', titleHi: 'पुलिस भर्ती', titleEn: 'Police Recruitment', sortOrder: 30 },
  { slug: 'teaching', titleHi: 'शिक्षक भर्ती', titleEn: 'Teaching Recruitment', sortOrder: 40 },
  { slug: 'revenue', titleHi: 'राजस्व / पटवारी', titleEn: 'Revenue / Patwari', sortOrder: 50 },
  { slug: 'medical', titleHi: 'स्वास्थ्य / मेडिकल', titleEn: 'Health / Medical', sortOrder: 60 },
  { slug: 'technical', titleHi: 'तकनीकी / इंजीनियरिंग', titleEn: 'Technical / Engineering', sortOrder: 70 },
  { slug: 'judiciary', titleHi: 'न्यायिक सेवा', titleEn: 'Judiciary', sortOrder: 80 },
  { slug: 'forest', titleHi: 'वन / पर्यावरण', titleEn: 'Forest / Environment', sortOrder: 90 },
  { slug: 'transport', titleHi: 'परिवहन', titleEn: 'Transport', sortOrder: 95 },
  { slug: 'other', titleHi: 'अन्य परीक्षाएँ', titleEn: 'Other Exams', sortOrder: 99 },
];

export type ExamCategoryRow = {
  id: string;
  level1: string;
  level2: string;
  level3: string;
  iconKey: string;
  enabled: boolean;
  sectionSlug?: string;
  sectionTitle?: string;
  sectionSortOrder?: number;
  itemSortOrder?: number;
  featured?: boolean;
  linkedTestId?: string | null;
};

export type AdminTestPick = {
  id: string;
  title: string;
  subcategory: string;
  is_published: boolean;
};

export type WizardInput = {
  state: IndianStateVisualRow;
  sectionSlug: string;
  examName: string;
  featured: boolean;
  itemSortOrder: number;
  testMode: 'existing' | 'new';
  selectedTestId: string;
  createTest: boolean;
};

function normalizeSlugPart(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function slugFromTitle(title: string): string {
  return normalizeSlugPart(title).slice(0, 60) || `test-${Date.now()}`;
}

/** Mirror server suggestSectionSlugFromLevel3 — wizard + All Tests smart section pick. */
export function suggestSectionSlugFromLevel3(level3: string): string {
  const key = String(level3 || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ');

  if (!key) return 'other';
  if (key.includes('gk') || key.includes('general knowledge') || key.includes('history') || key.includes('geography')) {
    return 'gk';
  }
  if (key.includes('police') || key.includes('constable') || key.includes('si ') || key.endsWith(' si')) {
    return 'police';
  }
  if (
    key.includes('tet') ||
    key.includes('tgt') ||
    key.includes('pgt') ||
    key.includes('teacher') ||
    key.includes('lecturer') ||
    key.includes('jbt') ||
    key.includes('ntt')
  ) {
    return 'teaching';
  }
  if (key.includes('patwari') || key.includes('revenue') || key.includes('tehsildar') || key.includes('naib')) {
    return 'revenue';
  }
  if (key.includes('medical') || key.includes('nurse') || key.includes('anm') || key.includes('mo ')) {
    return 'medical';
  }
  if (key.includes('je ') || key.includes('junior engineer') || key.includes('lineman') || key.includes('technical')) {
    return 'technical';
  }
  if (key.includes('judicial') || key.includes('court') || key.includes('judge')) {
    return 'judiciary';
  }
  if (key.includes('forest') || key.includes('acf') || key.includes('guard')) {
    return 'forest';
  }
  if (key.includes('conductor') || key.includes('transport') || key.includes('hrtc')) {
    return 'transport';
  }
  if (key.includes('hpas') || key.includes('sdm') || key.includes('dsp') || key.includes('administrative')) {
    return 'admin';
  }
  if (key.includes('bank') || key.includes('ibps') || key.includes('sbi')) {
    return 'banking';
  }
  if (key.includes('railway') || key.includes('rrb') || key.includes('ntpc')) {
    return 'railway';
  }
  if (key.includes('ssc') || key.includes('cgl') || key.includes('chsl')) {
    return 'ssc';
  }
  return 'other';
}

export function resolveSectionSlugForSync(
  level3: string,
  sections: SectionTemplate[] = DEFAULT_SECTION_TEMPLATES,
): string {
  const suggested = suggestSectionSlugFromLevel3(level3);
  if (sections.some((row) => row.slug === suggested)) return suggested;
  return sections.some((row) => row.slug === 'other') ? 'other' : sections[0]?.slug || 'other';
}

/** Section template slug from English title (matches server normalize). */
export function slugFromSectionTitle(title: string): string {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function validateSectionTemplateDraft(
  draft: Pick<SectionTemplate, 'slug' | 'titleHi' | 'titleEn' | 'sortOrder'>,
  existing: SectionTemplate[],
  editingSlug?: string,
): string | null {
  const slug = slugFromSectionTitle(draft.slug || draft.titleEn);
  const titleHi = draft.titleHi.trim();
  const titleEn = draft.titleEn.trim();
  if (!slug) return 'Section slug is required (use an English title).';
  if (!titleHi && !titleEn) return 'Hindi or English title is required.';
  const duplicate = existing.find((row) => row.slug === slug && row.slug !== editingSlug);
  if (duplicate) return `Section slug "${slug}" already exists.`;
  if (!Number.isFinite(Number(draft.sortOrder))) return 'Sort order must be a number.';
  return null;
}

export function addSectionTemplate(
  existing: SectionTemplate[],
  draft: { titleHi: string; titleEn: string; sortOrder: number },
): { items: SectionTemplate[]; error?: string } {
  const slug = slugFromSectionTitle(draft.titleEn || draft.titleHi);
  const next: SectionTemplate = {
    slug,
    titleHi: draft.titleHi.trim() || draft.titleEn.trim(),
    titleEn: draft.titleEn.trim() || draft.titleHi.trim() || slug,
    sortOrder: Math.max(0, Math.min(999, Math.trunc(Number(draft.sortOrder) || 99))),
  };
  const error = validateSectionTemplateDraft(next, existing);
  if (error) return { items: existing, error };
  return { items: [...existing, next].sort((a, b) => a.sortOrder - b.sortOrder) };
}

export function updateSectionTemplate(
  existing: SectionTemplate[],
  slug: string,
  patch: Partial<Pick<SectionTemplate, 'titleHi' | 'titleEn' | 'sortOrder'>>,
): { items: SectionTemplate[]; error?: string } {
  const idx = existing.findIndex((row) => row.slug === slug);
  if (idx < 0) return { items: existing, error: 'Section not found.' };
  const prev = existing[idx];
  const next: SectionTemplate = {
    ...prev,
    titleHi: patch.titleHi != null ? patch.titleHi.trim() : prev.titleHi,
    titleEn: patch.titleEn != null ? patch.titleEn.trim() : prev.titleEn,
    sortOrder:
      patch.sortOrder != null
        ? Math.max(0, Math.min(999, Math.trunc(Number(patch.sortOrder) || prev.sortOrder)))
        : prev.sortOrder,
  };
  const error = validateSectionTemplateDraft(next, existing, slug);
  if (error) return { items: existing, error };
  const items = existing.map((row, i) => (i === idx ? next : row));
  return { items: items.sort((a, b) => a.sortOrder - b.sortOrder) };
}

export function removeSectionTemplate(
  existing: SectionTemplate[],
  slug: string,
): { items: SectionTemplate[]; error?: string } {
  if (slug === 'other') return { items: existing, error: 'Cannot remove the "other" section.' };
  if (existing.length <= 1) return { items: existing, error: 'At least one section must remain.' };
  const items = existing.filter((row) => row.slug !== slug);
  if (items.length === existing.length) return { items: existing, error: 'Section not found.' };
  return { items };
}

export function countCategoriesUsingSection(
  categories: ExamCategoryRow[],
  sectionSlug: string,
): number {
  const slug = sectionSlug.trim();
  return categories.filter((row) => row.enabled && (row.sectionSlug || 'other') === slug).length;
}

export function buildIconKeyPreview(stateName: string, examName: string): string {
  const stateSlug = resolveIndianStateSlug(stateName);
  const testSlug = normalizeSlugPart(examName);
  if (!stateSlug || !testSlug) return '';
  return `${stateSlug}:${testSlug}`;
}

export function resolveSectionTemplate(
  slug: string,
  templates: SectionTemplate[] = DEFAULT_SECTION_TEMPLATES,
): SectionTemplate {
  return templates.find((t) => t.slug === slug) || templates.find((t) => t.slug === 'other')!;
}

export function buildWizardCategoryDraft(
  input: WizardInput,
  templates: SectionTemplate[] = DEFAULT_SECTION_TEMPLATES,
): ExamCategoryRow {
  const level3 = input.examName.trim();
  const section = resolveSectionTemplate(input.sectionSlug, templates);
  const iconKey = buildIconKeyPreview(input.state.english, level3);
  return {
    id: `exam-cat-wizard-${Date.now()}`,
    level1: 'State',
    level2: input.state.english,
    level3,
    iconKey,
    enabled: true,
    sectionSlug: section.slug,
    sectionTitle: section.titleHi || section.titleEn,
    sectionSortOrder: section.sortOrder,
    itemSortOrder: Math.max(1, Math.min(9999, input.itemSortOrder || 1)),
    featured: input.featured,
    linkedTestId: input.testMode === 'existing' && input.selectedTestId ? input.selectedTestId : null,
  };
}

export type WizardWarning = {
  level: 'error' | 'warn' | 'info';
  message: string;
};

export function collectWizardWarnings(
  input: WizardInput,
  existingCategories: ExamCategoryRow[],
  tests: AdminTestPick[],
): WizardWarning[] {
  const warnings: WizardWarning[] = [];
  const examName = input.examName.trim();
  const stateName = input.state.english;

  if (!examName) {
    warnings.push({ level: 'error', message: 'Exam name (Level 3) is required.' });
    return warnings;
  }
  if (!input.sectionSlug) {
    warnings.push({ level: 'error', message: 'Pick a section (Police, Teaching, Medical, …).' });
  }

  const stateSlug = resolveIndianStateSlug(stateName);
  const iconKey = buildIconKeyPreview(stateName, examName);
  const level3Lower = examName.toLowerCase();

  for (const row of existingCategories) {
    if (!row.enabled) continue;
    if (resolveIndianStateSlug(row.level2) !== stateSlug) continue;
    if (row.level3.trim().toLowerCase() === level3Lower) {
      warnings.push({
        level: 'warn',
        message: `This state already has "${row.level3}" — save will update that row if same name.`,
      });
    }
    if (iconKey && row.iconKey.trim().toLowerCase() === iconKey.toLowerCase() && row.level3.trim().toLowerCase() !== level3Lower) {
      warnings.push({
        level: 'error',
        message: `iconKey collision with existing "${row.level3}". Change the exam name slightly.`,
      });
    }
  }

  if (input.testMode === 'existing') {
    if (!input.selectedTestId) {
      warnings.push({ level: 'error', message: 'Select an existing test or switch to create new test.' });
    } else {
      const test = tests.find((t) => t.id === input.selectedTestId);
      if (test) {
        const sub = test.subcategory.trim();
        if (sub && sub.toLowerCase() !== level3Lower) {
          warnings.push({
            level: 'warn',
            message: `Test subcategory is "${sub}" but exam name is "${examName}". Save will update subcategory to match.`,
          });
        }
        if (!test.is_published) {
          warnings.push({
            level: 'info',
            message: 'Selected test is not published yet — publish it so users can apply.',
          });
        }
      }
    }
  } else if (input.createTest) {
    const dupTest = tests.find(
      (t) => t.title.trim().toLowerCase() === level3Lower || t.subcategory.trim().toLowerCase() === level3Lower,
    );
    if (dupTest) {
      warnings.push({
        level: 'warn',
        message: `A test "${dupTest.title}" already exists — consider linking it instead of creating duplicate.`,
      });
    }
  } else {
    warnings.push({
      level: 'info',
      message: 'Only exam circle will be saved. Create the test in All Tests tab or enable "Create test".',
    });
  }

  return warnings;
}

export function wizardHasBlockingErrors(warnings: WizardWarning[]): boolean {
  return warnings.some((w) => w.level === 'error');
}

export function mapSectionTemplatesFromApi(raw: unknown): SectionTemplate[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { items?: unknown }).items)) {
    return DEFAULT_SECTION_TEMPLATES;
  }
  const items = (raw as { items: unknown[] }).items
    .map((item: unknown) => {
      const x = item as Record<string, unknown>;
      const slug = String(x.slug || '').trim();
      if (!slug) return null;
      return {
        slug,
        titleHi: String(x.titleHi || x.title_hi || '').trim(),
        titleEn: String(x.titleEn || x.title_en || slug).trim(),
        sortOrder: Number.isFinite(Number(x.sortOrder ?? x.sort_order))
          ? Number(x.sortOrder ?? x.sort_order)
          : 99,
      };
    })
    .filter(Boolean) as SectionTemplate[];
  return items.length ? items.sort((a, b) => a.sortOrder - b.sortOrder) : DEFAULT_SECTION_TEMPLATES;
}

export function mapExamCategoriesFromApi(raw: unknown): ExamCategoryRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any, idx: number) => ({
    id: String(x?.id || `exam-cat-${idx + 1}`),
    level1: String(x?.level1 || ''),
    level2: String(x?.level2 || ''),
    level3: String(x?.level3 || ''),
    iconKey: String(x?.iconKey || ''),
    enabled: x?.enabled !== false,
    sectionSlug: x?.sectionSlug != null ? String(x.sectionSlug) : undefined,
    sectionTitle: x?.sectionTitle != null ? String(x.sectionTitle) : undefined,
    sectionSortOrder:
      x?.sectionSortOrder != null && Number.isFinite(Number(x.sectionSortOrder))
        ? Number(x.sectionSortOrder)
        : undefined,
    itemSortOrder:
      x?.itemSortOrder != null && Number.isFinite(Number(x.itemSortOrder))
        ? Number(x.itemSortOrder)
        : undefined,
    featured: x?.featured === true,
    linkedTestId: x?.linkedTestId != null ? String(x.linkedTestId) : null,
  }));
}

export function mapTestsFromApi(raw: unknown): AdminTestPick[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({
      id: String(x?.id || ''),
      title: String(x?.title || '').trim(),
      subcategory: String(x?.subcategory || '').trim(),
      is_published: x?.is_published !== false,
    }))
    .filter((t) => t.id && t.title);
}

export function mergeCategoryRow(
  existing: ExamCategoryRow[],
  draft: ExamCategoryRow,
): ExamCategoryRow[] {
  const stateSlug = resolveIndianStateSlug(draft.level2);
  const level3Lower = draft.level3.trim().toLowerCase();
  const idx = existing.findIndex(
    (row) =>
      row.enabled &&
      resolveIndianStateSlug(row.level2) === stateSlug &&
      row.level3.trim().toLowerCase() === level3Lower,
  );
  if (idx >= 0) {
    const prev = existing[idx];
    return existing.map((row, i) =>
      i === idx
        ? {
            ...prev,
            ...draft,
            id: prev.id,
          }
        : row,
    );
  }
  return [draft, ...existing];
}

export function compareStateExamRows(a: ExamCategoryRow, b: ExamCategoryRow): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  const orderA = a.itemSortOrder ?? 999;
  const orderB = b.itemSortOrder ?? 999;
  if (orderA !== orderB) return orderA - orderB;
  return a.level3.localeCompare(b.level3, 'en', { sensitivity: 'base' });
}

export function rowsForStateSection(
  rows: ExamCategoryRow[],
  stateEnglish: string,
  sectionSlug: string,
): ExamCategoryRow[] {
  const stateSlug = resolveIndianStateSlug(stateEnglish);
  const sec = sectionSlug.trim();
  return rows
    .filter(
      (row) =>
        row.enabled &&
        resolveIndianStateSlug(row.level2) === stateSlug &&
        (row.sectionSlug || 'other') === sec,
    )
    .slice()
    .sort(compareStateExamRows);
}

export function groupStateRowsBySection(
  rows: ExamCategoryRow[],
  stateEnglish: string,
  templates: SectionTemplate[] = DEFAULT_SECTION_TEMPLATES,
): Array<{ sectionSlug: string; sectionTitle: string; items: ExamCategoryRow[] }> {
  const stateSlug = resolveIndianStateSlug(stateEnglish);
  const grouped = new Map<string, ExamCategoryRow[]>();
  for (const row of rows) {
    if (!row.enabled || resolveIndianStateSlug(row.level2) !== stateSlug) continue;
    const slug = row.sectionSlug?.trim() || 'other';
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(row);
  }
  return [...grouped.entries()]
    .map(([sectionSlug, items]) => {
      const sorted = items.slice().sort(compareStateExamRows);
      const title =
        sorted[0]?.sectionTitle?.trim() ||
        resolveSectionTemplate(sectionSlug, templates).titleHi ||
        sectionSlug;
      return { sectionSlug, sectionTitle: title, items: sorted };
    })
    .sort((a, b) => {
      const orderA = resolveSectionTemplate(a.sectionSlug, templates).sortOrder;
      const orderB = resolveSectionTemplate(b.sectionSlug, templates).sortOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.sectionTitle.localeCompare(b.sectionTitle, 'en', { sensitivity: 'base' });
    });
}

/** Reassign itemSortOrder 1..n inside one section after drag reorder. */
export function applySectionRowOrder(
  allRows: ExamCategoryRow[],
  stateEnglish: string,
  sectionSlug: string,
  orderedIds: string[],
): ExamCategoryRow[] {
  const orderMap = new Map<string, number>();
  orderedIds.forEach((id, index) => orderMap.set(id, index + 1));
  const stateSlug = resolveIndianStateSlug(stateEnglish);
  const sec = sectionSlug.trim();
  return allRows.map((row) => {
    if (!row.enabled || resolveIndianStateSlug(row.level2) !== stateSlug) return row;
    if ((row.sectionSlug || 'other') !== sec) return row;
    const nextOrder = orderMap.get(row.id);
    if (nextOrder == null) return row;
    return { ...row, itemSortOrder: nextOrder };
  });
}

export function toggleRowFeatured(allRows: ExamCategoryRow[], rowId: string): ExamCategoryRow[] {
  return allRows.map((row) => (row.id === rowId ? { ...row, featured: !row.featured } : row));
}
