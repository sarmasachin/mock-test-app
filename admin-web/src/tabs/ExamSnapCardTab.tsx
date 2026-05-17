import { useEffect, useMemo, useState } from 'react';
import type { AxiosInstance } from 'axios';
import {
  type ExamSnapCardData,
  buildExamSnapCardSrcDoc,
  defaultExamSnapCard,
  mergeExamSnapCardFromServer,
} from '../lib/examSnapCardHtml';
import { useAdminToast } from '../adminToast';

type Props = { apiClient: AxiosInstance; isSuperAdmin: boolean };

const FIELD_ROWS: { key: keyof ExamSnapCardData; label: string }[] = [
  { key: 'registrationLeft', label: 'Top bar — left' },
  { key: 'registrationRight', label: 'Top bar — right' },
  { key: 'sessionInfo', label: 'Session line' },
  { key: 'examTitle', label: 'Exam title' },
  { key: 'conductingBody', label: 'Conducting body' },
  { key: 'courseLabel', label: 'Box — courses label' },
  { key: 'courseValue', label: 'Box — courses value' },
  { key: 'eligLabel', label: 'Box — eligibility label' },
  { key: 'eligValue', label: 'Box — eligibility value' },
  { key: 'examModeLabel', label: 'Box — exam mode label' },
  { key: 'examModeValue', label: 'Box — exam mode value' },
  { key: 'feeLabel', label: 'Box — fee label' },
  { key: 'feeValue', label: 'Box — fee value' },
  { key: 'examDateLabel', label: 'Blue bar — date label' },
  { key: 'examDateValue', label: 'Blue bar — date value' },
  { key: 'universitiesLabel', label: 'Highlight — left label' },
  { key: 'universitiesValue', label: 'Highlight — left value' },
  { key: 'markingLabel', label: 'Highlight — right label' },
  { key: 'markingValue', label: 'Highlight — right value' },
  { key: 'patternLabel', label: 'Pattern label' },
  { key: 'patternValue', label: 'Pattern text' },
  { key: 'brandName', label: 'Footer — brand' },
  { key: 'brandSubtitle', label: 'Footer — subtitle' },
  { key: 'qrImageUrl', label: 'QR image URL (https only)' },
];

export function ExamSnapCardTab({ apiClient, isSuperAdmin }: Props) {
  const { pushToast } = useAdminToast();
  const [card, setCard] = useState<ExamSnapCardData>(() => defaultExamSnapCard());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const srcDoc = useMemo(() => buildExamSnapCardSrcDoc(card), [card]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/admin/settings');
        const raw = res.data?.settings?.examSnapCard;
        if (!cancelled) setCard(mergeExamSnapCardFromServer(raw));
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { error?: string } } };
        pushToast('error', ax?.response?.data?.error || 'Failed to load card settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiClient, pushToast]);

  function setField<K extends keyof ExamSnapCardData>(key: K, value: string) {
    setCard((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    if (!isSuperAdmin) {
      pushToast('error', 'Super admin required to save settings.');
      return;
    }
    setSaving(true);
    try {
      const examSnapCard = JSON.parse(JSON.stringify(card)) as ExamSnapCardData;
      await apiClient.patch('/admin/settings', JSON.stringify({ examSnapCard }), {
        headers: { 'Content-Type': 'application/json' },
      });
      pushToast('success', 'Card saved.');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      pushToast('error', ax?.response?.data?.error || ax?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setCard(defaultExamSnapCard());
    pushToast('success', 'Form reset to defaults (Save to persist).');
  }

  return (
    <section
      className={`panel-card exam-snap-card-tab${editorOpen ? ' exam-snap-card-tab--editor-open' : ' exam-snap-card-tab--collapsed-only'}`}
    >
      <div className="exam-snap-top-row">
        <div className="panel-head exam-snap-panel-head">
          <h3>Exam snap card</h3>
        </div>
        <button
          type="button"
          className="exam-snap-preview-fab"
          onClick={() => setEditorOpen((open) => !open)}
          aria-expanded={editorOpen}
          aria-controls={editorOpen ? 'exam-snap-editor-panel' : undefined}
          title={editorOpen ? 'Poora block band karein' : 'Poora block kholen (form + preview)'}
        >
          <span className="exam-snap-preview-fab-icon" aria-hidden>
            {editorOpen ? (
              <svg className="exam-snap-fab-svg" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M6 12h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="exam-snap-fab-svg" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </span>
        </button>
      </div>
      {editorOpen ? (
        <div className="exam-snap-card-body exam-snap-card-body--open">
          <div className="exam-snap-editor-panel" id="exam-snap-editor-panel">
            <div className="exam-snap-card-layout exam-snap-card-layout--with-preview">
              <div className="exam-snap-card-form">
                {loading ? (
                  <p className="muted">Loading…</p>
                ) : (
                  <div className="exam-snap-card-fields">
                    {FIELD_ROWS.map(({ key, label }) => (
                      <label key={key} className="exam-snap-field">
                        <span>{label}</span>
                        <input
                          value={card[key]}
                          onChange={(e) => setField(key, e.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="exam-snap-card-preview-wrap" id="exam-snap-preview-panel">
                <h4 className="exam-snap-preview-title">Preview</h4>
                <div className="exam-snap-card-preview-frame">
                  <iframe title="Exam snap card preview" sandbox="allow-same-origin" srcDoc={srcDoc} className="exam-snap-card-iframe" />
                </div>
              </div>
            </div>
            <footer className="exam-snap-editor-actions">
              <div className="inline-form exam-snap-editor-actions-inner">
                <button type="button" className="ghost" onClick={resetDefaults} disabled={loading}>
                  Reset to defaults
                </button>
                <button type="button" onClick={() => void save()} disabled={loading || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
