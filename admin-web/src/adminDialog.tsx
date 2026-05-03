import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type AdminConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling for destructive confirms */
  variant?: 'default' | 'danger';
};

export type AdminPromptOptions = {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** If true, OK returns null when trimmed value is empty */
  required?: boolean;
  multiline?: boolean;
  rows?: number;
};

type ConfirmJob = { type: 'confirm'; opts: AdminConfirmOptions; resolve: (v: boolean) => void };
type PromptJob = { type: 'prompt'; opts: AdminPromptOptions; resolve: (v: string | null) => void };
type DialogJob = ConfirmJob | PromptJob;

type AdminDialogContextValue = {
  confirm: (opts: AdminConfirmOptions) => Promise<boolean>;
  prompt: (opts: AdminPromptOptions) => Promise<string | null>;
};

const AdminDialogContext = createContext<AdminDialogContextValue | null>(null);

export function useAdminDialog(): AdminDialogContextValue {
  const ctx = useContext(AdminDialogContext);
  if (!ctx) {
    throw new Error('useAdminDialog must be used inside AdminDialogProvider');
  }
  return ctx;
}

export function AdminDialogProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<DialogJob[]>([]);
  const [active, setActive] = useState<DialogJob | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const titleId = useId();
  const descId = useId();
  const promptLineRef = useRef<HTMLInputElement>(null);
  const promptAreaRef = useRef<HTMLTextAreaElement>(null);

  const enqueue = useCallback((job: DialogJob) => {
    queueRef.current.push(job);
    setActive((cur) => (cur ? cur : queueRef.current.shift() ?? null));
  }, []);

  const confirm = useCallback(
    (opts: AdminConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        enqueue({ type: 'confirm', opts, resolve });
      }),
    [enqueue],
  );

  const prompt = useCallback(
    (opts: AdminPromptOptions) =>
      new Promise<string | null>((resolve) => {
        enqueue({ type: 'prompt', opts, resolve });
      }),
    [enqueue],
  );

  const finishConfirm = useCallback(
    (value: boolean) => {
      const job = active;
      if (!job || job.type !== 'confirm') return;
      job.resolve(value);
      setActive(null);
    },
    [active],
  );

  const finishPrompt = useCallback(
    (value: string | null) => {
      const job = active;
      if (!job || job.type !== 'prompt') return;
      job.resolve(value);
      setActive(null);
    },
    [active],
  );

  useLayoutEffect(() => {
    if (active !== null) return;
    const next = queueRef.current.shift();
    if (next) setActive(next);
  }, [active]);

  useEffect(() => {
    if (!active || active.type !== 'prompt') return;
    const def = String(active.opts.defaultValue ?? '');
    setPromptDraft(def);
  }, [active]);

  useEffect(() => {
    if (!active || active.type !== 'prompt') return;
    const t = window.setTimeout(() => {
      const el = active.opts.multiline ? promptAreaRef.current : promptLineRef.current;
      el?.focus();
      if (el && 'select' in el && typeof el.select === 'function') el.select();
    }, 50);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (active.type === 'confirm') finishConfirm(false);
        else finishPrompt(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finishConfirm, finishPrompt]);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  const portal =
    active && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="admin-dialog-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                if (active.type === 'confirm') finishConfirm(false);
                else finishPrompt(null);
              }
            }}
          >
            {active.type === 'confirm' ? (
              <div
                className={`admin-dialog-card admin-dialog-card--${active.opts.variant === 'danger' ? 'danger' : 'default'}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id={titleId} className="admin-dialog-title">
                  {active.opts.title}
                </h2>
                <p id={descId} className="admin-dialog-message">
                  {active.opts.message}
                </p>
                <div className="admin-dialog-actions">
                  <button type="button" className="admin-dialog-btn admin-dialog-btn--secondary" onClick={() => finishConfirm(false)}>
                    {active.opts.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className={
                      active.opts.variant === 'danger'
                        ? 'admin-dialog-btn admin-dialog-btn--danger'
                        : 'admin-dialog-btn admin-dialog-btn--primary'
                    }
                    onClick={() => finishConfirm(true)}
                  >
                    {active.opts.confirmLabel ?? 'OK'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="admin-dialog-card admin-dialog-card--default"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id={titleId} className="admin-dialog-title">
                  {active.opts.title}
                </h2>
                {active.opts.description ? (
                  <p className="admin-dialog-description">{active.opts.description}</p>
                ) : null}
                {active.opts.multiline ? (
                  <textarea
                    ref={promptAreaRef}
                    className="admin-dialog-input admin-dialog-input--multiline"
                    rows={active.opts.rows ?? 4}
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    placeholder={active.opts.placeholder}
                    aria-label={active.opts.title}
                  />
                ) : (
                  <input
                    ref={promptLineRef}
                    type="text"
                    className="admin-dialog-input"
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = promptDraft.trim();
                        if (active.opts.required && !trimmed) return;
                        finishPrompt(trimmed === '' ? null : trimmed);
                      }
                    }}
                    placeholder={active.opts.placeholder}
                    aria-label={active.opts.title}
                  />
                )}
                <div className="admin-dialog-actions">
                  <button type="button" className="admin-dialog-btn admin-dialog-btn--secondary" onClick={() => finishPrompt(null)}>
                    {active.opts.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className="admin-dialog-btn admin-dialog-btn--primary"
                    disabled={active.opts.required === true && !promptDraft.trim()}
                    onClick={() => {
                      const trimmed = promptDraft.trim();
                      if (active.opts.required && !trimmed) return;
                      finishPrompt(trimmed === '' ? null : trimmed);
                    }}
                  >
                    {active.opts.confirmLabel ?? 'OK'}
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <AdminDialogContext.Provider value={value}>
      {children}
      {portal}
    </AdminDialogContext.Provider>
  );
}
