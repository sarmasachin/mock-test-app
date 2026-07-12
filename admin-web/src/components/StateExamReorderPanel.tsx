import { useMemo, useState } from 'react';
import type { ExamCategoryRow, SectionTemplate } from '../lib/stateExamWizard';
import { groupStateRowsBySection } from '../lib/stateExamWizard';
import { INDIA_STATE_OPTIONS } from '../lib/indianStateVisualCatalog';

type StateExamReorderPanelProps = {
  categories: ExamCategoryRow[];
  sections: SectionTemplate[];
  stateSlug: string;
  onStateSlugChange: (slug: string) => void;
  saving: boolean;
  dragRowId: string | null;
  onDragRowIdChange: (id: string | null) => void;
  onReorderSection: (sectionKey: string, orderedIds: string[]) => void;
  onToggleFeaturedRow: (rowId: string) => void;
  onMoveRow: (sectionKey: string, rowId: string, direction: -1 | 1) => void;
};

function countRowsForState(categories: ExamCategoryRow[], stateEnglish: string): number {
  const groups = groupStateRowsBySection(categories, stateEnglish, []);
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}

export function StateExamReorderPanel({
  categories,
  sections,
  stateSlug,
  onStateSlugChange,
  saving,
  dragRowId,
  onDragRowIdChange,
  onReorderSection,
  onToggleFeaturedRow,
  onMoveRow,
}: StateExamReorderPanelProps) {
  const [search, setSearch] = useState('');

  const selectedState =
    INDIA_STATE_OPTIONS.find((s) => s.slug === stateSlug) || INDIA_STATE_OPTIONS[0];

  const stateStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const state of INDIA_STATE_OPTIONS) {
      const n = countRowsForState(categories, state.english);
      if (n > 0) counts.set(state.slug, n);
    }
    return INDIA_STATE_OPTIONS.filter((s) => (counts.get(s.slug) || 0) > 0).map((s) => ({
      ...s,
      count: counts.get(s.slug) || 0,
    }));
  }, [categories]);

  const sectionGroups = useMemo(
    () => groupStateRowsBySection(categories, selectedState.english, sections),
    [categories, selectedState.english, sections],
  );

  const totalInState = sectionGroups.reduce((sum, g) => sum + g.items.length, 0);
  const searchQ = search.trim().toLowerCase();
  const showSearch = totalInState > 8;

  const filteredGroups = useMemo(() => {
    if (!searchQ) return sectionGroups;
    return sectionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((row) => row.level3.toLowerCase().includes(searchQ)),
      }))
      .filter((group) => group.items.length > 0);
  }, [sectionGroups, searchQ]);

  return (
    <div className="state-exam-reorder-inline">
      <label className="all-tests-field state-exam-reorder-state-field">
        <span>State (reorder list)</span>
        <select value={stateSlug} onChange={(e) => onStateSlugChange(e.target.value)}>
          {INDIA_STATE_OPTIONS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.english} ({s.hindi})
            </option>
          ))}
        </select>
      </label>

      {stateStats.length > 1 ? (
        <div className="state-exam-state-chips" aria-label="States with exams">
          {stateStats.map((state) => (
            <button
              key={state.slug}
              type="button"
              className={`state-exam-state-chip${state.slug === stateSlug ? ' is-active' : ''}`}
              onClick={() => onStateSlugChange(state.slug)}
            >
              {state.english}
              <span className="state-exam-state-chip-count">{state.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="state-exam-reorder-title-row">
        <h4>
          {selectedState.english} — drag reorder ({totalInState})
        </h4>
        {showSearch ? (
          <input
            type="search"
            className="state-exam-reorder-search state-exam-reorder-search--inline"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exam…"
            aria-label={`Search exams in ${selectedState.english}`}
          />
        ) : null}
      </div>

      {filteredGroups.length === 0 ? (
        <p className="muted">
          {searchQ
            ? `No match for "${search.trim()}".`
            : `No exams for ${selectedState.english} yet — add one from the form.`}
        </p>
      ) : (
        <div className="state-exam-reorder-groups">
          {filteredGroups.map((group) => (
            <div key={group.sectionSlug} className="state-exam-reorder-section">
              <h5>
                {group.sectionTitle}
                <span className="muted"> ({group.items.length})</span>
              </h5>
              <ul className="state-exam-reorder-list">
                {group.items.map((row, idx) => (
                  <li
                    key={row.id}
                    className={`state-exam-reorder-item${dragRowId === row.id ? ' is-dragging' : ''}`}
                    draggable={!saving}
                    onDragStart={() => onDragRowIdChange(row.id)}
                    onDragEnd={() => onDragRowIdChange(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragRowId || dragRowId === row.id) return;
                      const ids = group.items.map((r) => r.id);
                      const from = ids.indexOf(dragRowId);
                      const to = idx;
                      if (from < 0) return;
                      const nextIds = [...ids];
                      nextIds.splice(from, 1);
                      nextIds.splice(to, 0, dragRowId);
                      onDragRowIdChange(null);
                      onReorderSection(group.sectionSlug, nextIds);
                    }}
                  >
                    <span className="state-exam-drag-handle" title="Drag to reorder">
                      ⋮⋮
                    </span>
                    <span className="state-exam-reorder-label">
                      {row.featured ? '⭐ ' : ''}
                      {row.level3}
                    </span>
                    <span className="state-exam-reorder-actions">
                      <button
                        type="button"
                        className="state-exam-mini-btn"
                        disabled={saving || idx === 0}
                        onClick={() => onMoveRow(group.sectionSlug, row.id, -1)}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="state-exam-mini-btn"
                        disabled={saving || idx === group.items.length - 1}
                        onClick={() => onMoveRow(group.sectionSlug, row.id, 1)}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`state-exam-mini-btn${row.featured ? ' is-featured' : ''}`}
                        disabled={saving}
                        onClick={() => onToggleFeaturedRow(row.id)}
                        title="Toggle featured"
                      >
                        ★
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="muted state-exam-footnote">
        Drag or ↑↓ within each section. ★ = featured. Bihar / Punjab = same screen, change state above.
      </p>
    </div>
  );
}
