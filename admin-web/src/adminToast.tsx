import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type AdminToastKind = 'success' | 'error' | 'warning';

type ToastItem = {
  id: number;
  kind: AdminToastKind;
  message: string;
};

type AdminToastContextValue = {
  pushToast: (kind: AdminToastKind, message: string) => void;
  clearToasts: () => void;
};

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

const TOAST_MS: Record<AdminToastKind, number> = {
  success: 4500,
  warning: 5200,
  error: 6500,
};

export function useAdminToast(): AdminToastContextValue {
  const ctx = useContext(AdminToastContext);
  if (!ctx) {
    throw new Error('useAdminToast must be used inside AdminToastProvider');
  }
  return ctx;
}

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearToasts = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const pushToast = useCallback(
    (kind: AdminToastKind, message: string) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      clearTimer();
      setToast({ id: Date.now(), kind, message: trimmed });
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, TOAST_MS[kind]);
    },
    [clearTimer],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = useMemo(() => ({ pushToast, clearToasts }), [pushToast, clearToasts]);

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          className="admin-snackbar-wrap"
          aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
        >
          <div
            key={toast.id}
            className={`admin-snackbar admin-snackbar--${toast.kind}`}
            role="status"
          >
            <span className="admin-snackbar-icon" aria-hidden="true">
              {toast.kind === 'success' ? '✓' : toast.kind === 'warning' ? '⚠' : '!'}
            </span>
            <span className="admin-snackbar-text">{toast.message}</span>
            <button
              type="button"
              className="admin-snackbar-close"
              aria-label="Dismiss notification"
              onClick={() => clearToasts()}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </AdminToastContext.Provider>
  );
}
