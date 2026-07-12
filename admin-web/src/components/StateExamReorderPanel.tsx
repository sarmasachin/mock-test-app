import { useEffect, useMemo, useState } from 'react';
import type { ExamCategoryRow, SectionTemplate } from '../lib/stateExamWizard';
import { groupStateRowsBySection } from '../lib/stateExamWizard';
import { INDIA_STATE_OPTIONS } from '../lib/indianStateVisualCatalog';

export type StateExamSectionGroup = {
  sectionSlug: string;
  sectionTitle: string;
  items: ExamCategoryRow[];
};

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

function countStateRows(categories: ExamCategoryRow[], stateEnglish: string): number {
  const key = stateEnglish.trim().toLowerCase();
  return categories.filter(
    (c) => c.enabled && c.level2.trim().toLowerCase() === key,
  ).length;
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const selectedState =
    INDIA_STATE_OPTIONS.find((s) => s.slug === stateSlug) || INDIA_STATE_OPTIONS[0];

  const stateStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of categories) {
      if (!row.enabled || row.level1 !== 'State') continue;
      const name = row.level2.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return INDIA_STATE_OPTIONS.map((state) => ({
      slug: state.slug,
      english: state.english,
      hindi: state.hindi,
      count: counts.get(state.english) || 0,
    })).filter((s) => s.count > 0);
  }, [categories]);

  const sectionGroups = useMemo(
    () => groupStateRowsBySection(categories, selectedState.english, sections),
    [categories, selectedState.english, sections],
  );

  const searchQ = search.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!searchQ) return sectionGroups;
    return sectionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((row) => row.level3.toLowerCase().includes(searchQ)),
      }))
      .filter((group) => group.items.length > 0);
  }, [sectionGroups, searchQ]);

  const totalInState = countStateRows(categories, selectedState.english);

  useEffect(() => {
    setSearch('');
    const groups = groupStateRowsBySection(categories, selectedState.english, sections);
    const next: Record<string, boolean> = {};
    for (const group of groups) {
      next[group.sectionSlug] = group.items.length > 5;
    }
    setCollapsedSections(next);
    // Reset accordion only when switching state — not after each reorder save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateSlug]);

  function isSectionCollapsed(sectionSlug: string): boolean {
    if (searchQ) return false;
    return collapsedSections[sectionSlug] === true;
  }

  function toggleSectionCollapsed(sectionSlug: string) {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionSlug]: !prev[sectionSlug],
    }));
  }

  return (
    <div className="state-exam-reorder-panel">
      <div className="state-exam-reorder-head">
        <div>
          <h4>Manage exam order</h4>
          <p className="muted state-exam-reorder-subtitle">
            One state at a time — switch state below. Drag within a section or use ↑↓. Changes save
            instantly.
          </p>
        </div>
        <input
          type="search"
          className="state-exam-reorder-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search in ${selectedState.english}…`}
          aria-label="Search exams in selected state"
        />
      </div>

      {stateStats.length > 0 ? (
        <div className="state-exam-state-chips" role="tablist" aria-label="States with exams">
          {stateStats.map((state) => (
            <button
              key={state.slug}
              type="button"
              role="tab"
              aria-selected={state.slug === stateSlug}
              className={`state-exam-state-chip${state.slug === stateSlug ? ' is-active' : ''}`}
              onClick={() => onStateSlugChange(state.slug)}
            >
              {state.english}
              <span className="state-exam-state-chip-count">{state.count}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No state exams yet. Use Add exam to create the first circle.</p>
      )}

      <div className="state-exam-reorder-summary">
        <strong>{selectedState.english}</strong>
        <span className="muted">
          {totalInState} exam{totalInState === 1 ? '' : 's'} · {filteredGroups.length} section
          {filteredGroups.length === 1 ? '' : 's'}
          {searchQ ? ` · filtered` : ''}
        </span>
      </div>

      {filteredGroups.length === 0 ? (
        <p className="muted">
          {searchQ
            ? `No exams match "${search.trim()}" in ${selectedState.english}.`
            : `No exams for ${selectedState.english} yet.`}
        </p>
      ) : (
        <div className="state-exam-reorder-groups state-exam-reorder-groups--manage">
          {filteredGroups.map((group) => {
            const collapsed = isSectionCollapsed(group.sectionSlug);
            return (
              <div key={group.sectionSlug} className="state-exam-reorder-section">
                <button
                  type="button"
                  className="state-exam-reorder-section-toggle"
                  onClick={() => toggleSectionCollapsed(group.sectionSlug)}
                  aria-expanded={!collapsed}
                >
                  <span>
                    {group.sectionTitle}
                    <span className="muted"> ({group.items.length})</span>
                  </span>
                  <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                </button>
                {!collapsed ? (
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
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="muted state-exam-footnote">
        Tip: Bihar, Punjab, etc. each have their own list — switch state chip above. For bulk edits
        use <strong>Exam Categories</strong> tab.
      </p>
    </div>
  );
}
