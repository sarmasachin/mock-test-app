import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAdminDialog } from '../adminDialog';
import { useAdminToast } from '../adminToast';

type ApiClient = {
  get: (url: string, config?: any) => Promise<any>;
  patch: (url: string, data?: any, config?: any) => Promise<any>;
  post: (url: string, data?: any, config?: any) => Promise<any>;
};

type PollItem = {
  id: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  durationMinutes: number;
  enabled: boolean;
  createdAt: string;
};
type PollSettings = { showHomePopup: boolean; items: PollItem[] };
type PushItem = {
  id: string;
  title: string;
  message: string;
  target: 'all' | 'new_users' | 'active_users';
  /** Canonical value sent to API / FCM (derived from preset + custom when saving). */
  deepLink: string;
  /** Quick pick — must be empty if custom deep link is used (same rule as new row form). */
  deepLinkPreset: string;
  deepLinkCustom: string;
  scheduledAt: string;
  enabled: boolean;
  status: 'draft' | 'sent';
  resendCount: number;
  lastSentAt: string;
  createdAt: string;
};
type PushSettings = { items: PushItem[] };

/** Values accepted by app `openByPushRoute` (Android MainBottomNavHost). */
const PUSH_DEEP_LINK_PRESETS: { value: string; label: string }[] = [
  { value: '', label: '— None —' },
  { value: 'poll', label: 'Poll' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'menu_quiz', label: 'Daily Quiz' },
  { value: 'job_alert', label: 'Job alerts' },
  { value: 'exam_alert', label: 'Exam alerts' },
  { value: 'news', label: 'News tab' },
  { value: 'tests', label: 'Tests tab' },
  { value: 'home', label: 'Home tab' },
];

const PUSH_PRESET_VALUE_SET = new Set(PUSH_DEEP_LINK_PRESETS.map((o) => o.value).filter(Boolean));

function splitSavedDeepLink(saved: string): { preset: string; custom: string } {
  const s = String(saved || '').trim();
  if (!s) return { preset: '', custom: '' };
  if (PUSH_PRESET_VALUE_SET.has(s)) return { preset: s, custom: '' };
  return { preset: '', custom: s };
}

/** Custom wins if non-empty; else preset. Both non-empty → conflict (caller shows warning). */
function mergePushDeepLink(preset: string, custom: string): { ok: true; deepLink: string } | { ok: false } {
  const p = preset.trim();
  const c = custom.trim();
  if (p && c) return { ok: false };
  if (c) return { ok: true, deepLink: c };
  if (p) return { ok: true, deepLink: p };
  return { ok: true, deepLink: '' };
}

type PushItemApiRow = Omit<PushItem, 'deepLinkPreset' | 'deepLinkCustom'> & { deepLink: string };

function stripPushItemForApi(item: PushItem): PushItemApiRow | null {
  const merged = mergePushDeepLink(item.deepLinkPreset, item.deepLinkCustom);
  if (!merged.ok) return null;
  const { deepLinkPreset: _p, deepLinkCustom: _c, ...rest } = item;
  return { ...rest, deepLink: merged.deepLink };
}

const PUSH_DEEPLINK_CONFLICT_MSG =
  'Quick destination aur Custom deep link dono set hain — koi ek clear karein (sirf ek use ho sakta hai).';
type SubmitApplicationContent = {
  title: string;
  benefitsTitle: string;
  submitButtonLabel: string;
  successMessage: string;
  bulletItems: string[];
};
type InstructionContent = {
  pageTitle: string;
  cardTitle: string;
  startButtonLabel: string;
  submitDialogBrand: string;
  submitDialogTitle: string;
  submitDialogSubtitle: string;
  postSubmitCardTitle: string;
  postSubmitCardReadyTitle: string;
  postSubmitCardDateLabel: string;
  postSubmitCardPendingMessage: string;
  postSubmitCardReadyMessage: string;
  postSubmitCardButtonLabel: string;
  postSubmitCardLines: string[];
  questionNavigationMode: 'sequential' | 'free';
  items: string[];
};
type ShareContentSettings = {
  title: string;
  body: string;
};

export function PollSettingsTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const POLLS_PER_PAGE = 20;
  const [settings, setSettings] = useState<PollSettings>({ showHomePopup: true, items: [] });
  const [newItem, setNewItem] = useState({ question: '', options: ['', '', '', ''], allowMultiple: false, durationMinutes: '1440' });
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.pollSettings || {};
      const itemsRaw = Array.isArray(s.items) ? s.items : s.question ? [s] : [];
      setSettings({
        showHomePopup: s.showHomePopup !== false,
        items: itemsRaw.map((x: any, idx: number) => ({
          id: String(x.id || `poll-${idx + 1}`),
          question: String(x.question || ''),
          options: Array.isArray(x.options) ? x.options.map((v: any) => String(v)) : [],
          allowMultiple: Boolean(x.allowMultiple),
          durationMinutes: Number(x.durationMinutes || 1440),
          enabled: x.enabled !== false,
          createdAt: String(x.createdAt || new Date().toISOString()),
        })),
      });
      setPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load poll settings');
    }
  }

  /** Single path to DB + local state (avoids “Add Poll” only updating React state with no PATCH). */
  async function persistPollSettings(next: PollSettings, successText: string) {
    try {
      setSaving(true);
      await apiClient.patch('/admin/settings', { pollSettings: next });
      setSettings(next);
      pushToast('success', successText);
      return true;
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save poll settings');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    await persistPollSettings(settings, 'Poll settings saved.');
  }

  /* Tab unmounts when leaving this menu (App.tsx); remount must reload from API or list looks empty. */
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when tab remounts only
  }, []);

  function normalizeOptions(list: string[]) {
    return list.map((x) => x.trim()).filter(Boolean);
  }
  async function addPoll() {
    const question = newItem.question.trim();
    if (!question) {
      pushToast('error', 'Poll question is required');
      return;
    }
    const options = normalizeOptions(newItem.options);
    if (options.length < 2) {
      pushToast('error', 'At least 2 poll options are required');
      return;
    }
    if (options.length > 8) {
      pushToast('error', 'Maximum 8 poll options are allowed');
      return;
    }
    const next: PollSettings = {
      ...settings,
      items: [
        ...settings.items,
        {
          id: `poll-${Date.now()}`,
          question,
          options,
          allowMultiple: newItem.allowMultiple,
          durationMinutes: Number(newItem.durationMinutes || '1440'),
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const ok = await persistPollSettings(next, 'Poll added and saved.');
    if (ok) {
      setNewItem({ question: '', options: ['', '', '', ''], allowMultiple: false, durationMinutes: '1440' });
    }
  }
  function setNewOptionAt(index: number, value: string) {
    setNewItem((p) => ({ ...p, options: p.options.map((x, i) => (i === index ? value : x)) }));
  }
  function addNewOptionField() {
    setNewItem((p) => (p.options.length >= 8 ? p : { ...p, options: [...p.options, ''] }));
  }
  function removeNewOptionField(index: number) {
    setNewItem((p) => {
      if (p.options.length <= 2) return p;
      return { ...p, options: p.options.filter((_, i) => i !== index) };
    });
  }
  function addExistingOption(itemId: string) {
    setSettings((p) => ({
      ...p,
      items: p.items.map((x) => (x.id === itemId ? { ...x, options: x.options.length >= 8 ? x.options : [...x.options, ''] } : x)),
    }));
  }
  function updateExistingOption(itemId: string, optionIndex: number, value: string) {
    setSettings((p) => ({
      ...p,
      items: p.items.map((x) =>
        x.id === itemId ? { ...x, options: x.options.map((opt, idx) => (idx === optionIndex ? value : opt)) } : x,
      ),
    }));
  }
  function removeExistingOption(itemId: string, optionIndex: number) {
    setSettings((p) => ({
      ...p,
      items: p.items.map((x) =>
        x.id === itemId && x.options.length > 2
          ? { ...x, options: x.options.filter((_, idx) => idx !== optionIndex) }
          : x,
      ),
    }));
  }
  async function saveSinglePoll(item: PollItem) {
    const normalized = normalizeOptions(item.options);
    if (normalized.length < 2) {
      pushToast('error', 'Each poll must have at least 2 options');
      return;
    }
    if (normalized.length > 8) {
      pushToast('error', 'Each poll can have maximum 8 options');
      return;
    }
    const next = {
      ...settings,
      items: settings.items.map((x) => (x.id === item.id ? { ...x, options: normalized } : x)),
    };
    await persistPollSettings(next, 'Poll saved.');
  }

  async function removePoll(itemId: string) {
    const next = { ...settings, items: settings.items.filter((x) => x.id !== itemId) };
    await persistPollSettings(next, 'Poll removed.');
  }
  const totalPages = Math.max(1, Math.ceil(settings.items.length / POLLS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.items.slice((safePage - 1) * POLLS_PER_PAGE, (safePage - 1) * POLLS_PER_PAGE + POLLS_PER_PAGE), [settings.items, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Poll Settings</h3></div>
      <div className="inline-form" style={{ marginBottom: 8 }}>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.showHomePopup !== false}
            onChange={(e) => setSettings((p) => ({ ...p, showHomePopup: e.target.checked }))}
          />
          Show premium poll popup on app home
        </label>
      </div>
      <div className="panel-card" style={{ marginBottom: 10, padding: 12 }}>
        <div className="inline-form">
          <textarea
            value={newItem.question}
            onChange={(e) => setNewItem((p) => ({ ...p, question: e.target.value }))}
            placeholder="Poll question"
            rows={2}
            style={{ minWidth: 340, flex: '1 1 340px', resize: 'vertical' }}
          />
          <input
            value={newItem.durationMinutes}
            onChange={(e) => setNewItem((p) => ({ ...p, durationMinutes: e.target.value }))}
            placeholder="Duration minutes"
            type="number"
            min={1}
            style={{ width: 120, minWidth: 120, flex: '0 0 120px', height: 36, padding: '6px 10px' }}
          />
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {newItem.options.map((opt, idx) => (
            <div key={`new-opt-${idx}`} className="inline-form">
              <input value={opt} onChange={(e) => setNewOptionAt(idx, e.target.value)} placeholder={`Option ${idx + 1}`} />
              <button type="button" className="ghost" onClick={() => removeNewOptionField(idx)} disabled={newItem.options.length <= 2}>
                Remove
              </button>
            </div>
          ))}
          <div className="inline-form" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="ghost" onClick={addNewOptionField} disabled={newItem.options.length >= 8}>+ Add Option</button>
          </div>
        </div>
        <div className="inline-form" style={{ marginTop: 8 }}>
        <label className="check-wrap"><input type="checkbox" checked={newItem.allowMultiple} onChange={(e) => setNewItem((p) => ({ ...p, allowMultiple: e.target.checked }))} />Multiple</label>
          <button type="button" onClick={() => void addPoll()} disabled={saving}>
            Add Poll
          </button>
        </div>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 2fr 120px 110px 90px 90px' }}><span>Question</span><span>Options (Dynamic)</span><span>Duration (min)</span><span>Multiple</span><span>Update</span><span>Delete</span></div>
        {visibleItems.map((item) => (
          <div key={item.id} className="row" style={{ gridTemplateColumns: '2fr 2fr 120px 110px 90px 90px' }}>
            <textarea
              value={item.question}
              onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, question: e.target.value } : x)) }))}
              rows={2}
              style={{ resize: 'vertical' }}
            />
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {item.options.map((opt, optIdx) => (
                <div key={`${item.id}-opt-${optIdx}`} className="inline-form">
                  <input value={opt} onChange={(e) => updateExistingOption(item.id, optIdx, e.target.value)} placeholder={`Option ${optIdx + 1}`} />
                  <button type="button" className="ghost" onClick={() => removeExistingOption(item.id, optIdx)} disabled={item.options.length <= 2}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" style={{ gridColumn: '1 / -1' }} onClick={() => addExistingOption(item.id)} disabled={item.options.length >= 8}>
                + Add Option
              </button>
            </div>
            <input
              type="number"
              min={1}
              value={item.durationMinutes}
              onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, durationMinutes: Number(e.target.value || '1') } : x)) }))}
              style={{ width: 100, minWidth: 100, justifySelf: 'start', alignSelf: 'center', height: 34, padding: '6px 8px' }}
            />
            <label className="check-wrap"><input type="checkbox" checked={item.allowMultiple} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, allowMultiple: e.target.checked } : x)) }))} />yes</label>
            <button type="button" onClick={() => void saveSinglePoll(item)} disabled={saving}>Save</button>
            <button type="button" className="danger" onClick={() => void removePoll(item.id)} disabled={saving}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Poll Settings'}</button></div>
    </section>
  );
}

export function PushNotificationSettingsTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const PUSH_PER_PAGE = 20;
  const [settings, setSettings] = useState<PushSettings>({ items: [] });
  const [newItem, setNewItem] = useState({
    title: '',
    message: '',
    target: 'all' as PushItem['target'],
    deepLinkPreset: '',
    deepLinkCustom: '',
    scheduledAt: '',
    enabled: true,
  });
  const [page, setPage] = useState(1);
  const [sendResult, setSendResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [sendingId, setSendingId] = useState('');
  function formatDateTime(value: string) {
    const dt = new Date(value);
    if (!value || Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  }

  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.pushNotificationSettings || {};
      const itemsRaw = Array.isArray(s.items) ? s.items : s.title || s.message ? [s] : [];
      setSettings({
        items: itemsRaw.map((x: any, idx: number) => {
          const dl = String(x.deepLink || '').trim();
          const sp = splitSavedDeepLink(dl);
          return {
            id: String(x.id || `push-${idx + 1}`),
            title: String(x.title || ''),
            message: String(x.message || ''),
            target: ['all', 'new_users', 'active_users'].includes(String(x.target)) ? x.target : 'all',
            deepLink: dl,
            deepLinkPreset: sp.preset,
            deepLinkCustom: sp.custom,
            scheduledAt: String(x.scheduledAt || ''),
            enabled: x.enabled !== false,
            status: x.status === 'sent' ? 'sent' : 'draft',
            resendCount: Number(x.resendCount || 0),
            lastSentAt: String(x.lastSentAt || ''),
            createdAt: String(x.createdAt || new Date().toISOString()),
          };
        }),
      });
      setPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load push notification settings');
    }
  }

  /* App.tsx renders this tab only when `tab === 'pushNotificationSettings'`, so switching menus unmounts
   * this component → useState resets to `{ items: [] }`. Save still writes DB (PATCH); without load() on
   * mount the UI stayed empty until "Load". */
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reload when tab remounts, not every render
  }, []);
  async function save(nextSettings?: PushSettings, successText?: string) {
    try {
      setSaving(true);
      const payload = nextSettings || settings;
      const apiItems: PushItemApiRow[] = [];
      for (const it of payload.items) {
        const row = stripPushItemForApi(it);
        if (!row) {
          pushToast('warning', PUSH_DEEPLINK_CONFLICT_MSG);
          return false;
        }
        apiItems.push(row);
      }
      await apiClient.patch('/admin/settings', { pushNotificationSettings: { items: apiItems } });
      setSettings(payload);
      pushToast('success', successText || 'Push notification settings saved successfully.');
      return true;
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save push notification settings');
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function addPush() {
    const title = newItem.title.trim();
    const message = newItem.message.trim();
    if (!title || !message) {
      pushToast('error', 'Title and message are required.');
      return;
    }
    const mergedNew = mergePushDeepLink(newItem.deepLinkPreset, newItem.deepLinkCustom);
    if (!mergedNew.ok) {
      pushToast('warning', PUSH_DEEPLINK_CONFLICT_MSG);
      return;
    }
    try {
      setAdding(true);
      const sp = splitSavedDeepLink(mergedNew.deepLink);
      const next = {
        ...settings,
        items: [
          ...settings.items,
          {
            id: `push-${Date.now()}`,
            title,
            message,
            target: newItem.target,
            deepLink: mergedNew.deepLink,
            deepLinkPreset: sp.preset,
            deepLinkCustom: sp.custom,
            scheduledAt: newItem.scheduledAt.trim(),
            enabled: newItem.enabled,
            status: 'draft' as const,
            resendCount: 0,
            lastSentAt: '',
            createdAt: new Date().toISOString(),
          },
        ],
      };
      const ok = await save(next, 'Push item added and saved.');
      if (ok) {
        setNewItem({
          title: '',
          message: '',
          target: 'all',
          deepLinkPreset: '',
          deepLinkCustom: '',
          scheduledAt: '',
          enabled: true,
        });
      }
    } finally {
      setAdding(false);
    }
  }
  async function removePush(itemId: string) {
    const ok = await adminConfirm({
      title: 'Delete push item?',
      message: 'This notification template will be removed from the list and saved settings.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setDeletingId(itemId);
      const next = { ...settings, items: settings.items.filter((x) => x.id !== itemId) };
      await save(next, 'Push item deleted and saved.');
    } finally {
      setDeletingId('');
    }
  }
  async function sendNow(item: PushItem) {
    if (!item.title.trim() || !item.message.trim()) {
      pushToast('error', 'Title and message are required to send push');
      return;
    }
    const mergedSend = mergePushDeepLink(item.deepLinkPreset, item.deepLinkCustom);
    if (!mergedSend.ok) {
      pushToast('warning', PUSH_DEEPLINK_CONFLICT_MSG);
      return;
    }
    try {
      setSendResult('');
      setSendingId(item.id);
      const res = await apiClient.post('/admin/notifications/send', {
        title: item.title.trim(),
        message: item.message.trim(),
        target: item.target,
        deepLink: mergedSend.deepLink.trim(),
      });
      const sent = Number(res.data?.sent || 0);
      const failed = Number(res.data?.failed || 0);
      const total = Number(res.data?.total || sent + failed);
      const deactivated = Number(res.data?.deactivated || 0);
      const nextSendN = (item.resendCount || 0) + 1;
      let resultLine = `${total} device(s): ${sent} delivered, ${failed} failed. Send #${nextSendN} (= Resend count for this row).`;
      if (deactivated > 0) {
        resultLine += ` ${deactivated} invalid token(s) cleared.`;
      }
      setSendResult(resultLine);
      pushToast('success', resultLine);
      setSettings((p) => ({
        ...p,
        items: p.items.map((x) =>
          x.id === item.id
            ? { ...x, status: 'sent', resendCount: (x.resendCount || 0) + 1, lastSentAt: new Date().toISOString() }
            : x,
        ),
      }));
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to send push notification');
    } finally {
      setSendingId('');
    }
  }
  const totalPages = Math.max(1, Math.ceil(settings.items.length / PUSH_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.items.slice((safePage - 1) * PUSH_PER_PAGE, (safePage - 1) * PUSH_PER_PAGE + PUSH_PER_PAGE), [settings.items, safePage]);
  return (
    <section className="panel-card push-notification-panel">
      <div className="panel-head"><h3>Push Notification Settings</h3></div>
      <div className="inline-form push-settings-add-row">
        <input value={newItem.title} onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))} placeholder="Notification title" disabled={saving || adding} />
        <input value={newItem.message} onChange={(e) => setNewItem((p) => ({ ...p, message: e.target.value }))} placeholder="Notification message" disabled={saving || adding} />
        <select value={newItem.target} onChange={(e) => setNewItem((p) => ({ ...p, target: e.target.value as PushItem['target'] }))} disabled={saving || adding}><option value="all">All users</option><option value="new_users">New users</option><option value="active_users">Active users</option></select>
        <select value={newItem.deepLinkPreset} onChange={(e) => setNewItem((p) => ({ ...p, deepLinkPreset: e.target.value }))} disabled={saving || adding} aria-label="Open screen preset">
          {PUSH_DEEP_LINK_PRESETS.map((opt) => (
            <option key={opt.value || '__none__'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input value={newItem.deepLinkCustom} onChange={(e) => setNewItem((p) => ({ ...p, deepLinkCustom: e.target.value }))} placeholder="Custom deep link (optional)" disabled={saving || adding} />
        <input type="datetime-local" value={newItem.scheduledAt} onChange={(e) => setNewItem((p) => ({ ...p, scheduledAt: e.target.value }))} placeholder="Schedule (optional)" disabled={saving || adding} />
        <label className="check-wrap"><input type="checkbox" checked={newItem.enabled} onChange={(e) => setNewItem((p) => ({ ...p, enabled: e.target.checked }))} disabled={saving || adding} />Enabled</label>
        <button type="button" onClick={addPush} disabled={saving || adding}>{adding ? 'Adding...' : 'Add Push'}</button>
      </div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.88rem' }}>
        Quick screen aur Custom deep link dono optional hain. Dono ek saath bharenge to save/send par warning aayegi — sirf ek use karein.
      </p>
      <div className="list table">
        <div className="row row-head push-notification-grid-row">
          <span>Title</span>
          <span>Message</span>
          <span>Target</span>
          <span>Deep link</span>
          <span>Status</span>
          <span>Last Sent (IST)</span>
          <span>Resend</span>
          <span>Update</span>
          <span>Delete</span>
          <span>Resend Count</span>
          <span>Send Now</span>
        </div>
        {visibleItems.map((item) => (
          <div key={item.id} className="row push-notification-grid-row">
            <input value={item.title} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)) }))} disabled={saving || !!sendingId || !!deletingId} />
            <input value={item.message} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, message: e.target.value } : x)) }))} disabled={saving || !!sendingId || !!deletingId} />
            <select value={item.target} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, target: e.target.value as PushItem['target'] } : x)) }))} disabled={saving || !!sendingId || !!deletingId}>
              <option value="all">All users</option>
              <option value="new_users">New users</option>
              <option value="active_users">Active users</option>
            </select>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <select
                value={item.deepLinkPreset}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    items: p.items.map((x) => (x.id === item.id ? { ...x, deepLinkPreset: e.target.value } : x)),
                  }))
                }
                disabled={saving || !!sendingId || !!deletingId}
                aria-label={`Deep link preset ${item.id}`}
              >
                {PUSH_DEEP_LINK_PRESETS.map((opt) => (
                  <option key={opt.value || '__none__'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                value={item.deepLinkCustom}
                placeholder="Custom"
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    items: p.items.map((x) => (x.id === item.id ? { ...x, deepLinkCustom: e.target.value } : x)),
                  }))
                }
                disabled={saving || !!sendingId || !!deletingId}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </span>
            <span>{item.status}</span>
            <span>{formatDateTime(item.lastSentAt)}</span>
            <button type="button" className="ghost" onClick={() => sendNow(item)} disabled={saving || !!deletingId || !!sendingId}>{sendingId === item.id ? 'Sending...' : 'Resend'}</button>
            <button type="button" onClick={() => { void save(); }} disabled={saving || !!sendingId || !!deletingId}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="danger" onClick={() => removePush(item.id)} disabled={saving || !!sendingId || !!deletingId}>{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>
            <span>{item.resendCount || 0}</span>
            <button type="button" onClick={() => sendNow(item)} disabled={saving || !!deletingId || !!sendingId}>{sendingId === item.id ? 'Sending...' : 'Send'}</button>
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load} disabled={saving || adding || !!sendingId || !!deletingId}>Load</button><button type="button" onClick={() => { void save(); }} disabled={saving || adding || !!sendingId || !!deletingId}>{saving ? 'Saving...' : 'Save Push Settings'}</button></div>
      {sendResult ? <p className="muted">{sendResult}</p> : null}
    </section>
  );
}

export function SubmitApplicationContentTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const ITEMS_PER_PAGE = 20;
  const [settings, setSettings] = useState<SubmitApplicationContent>({ title: 'Apply', benefitsTitle: 'What you’ll get', submitButtonLabel: 'Submit Application', successMessage: 'Your application was submitted successfully.', bulletItems: ['Instant access after approval', 'Mock test practice & review', 'Score history in your profile'] });
  const [newBullet, setNewBullet] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.submitApplicationContent || {};
      setSettings({ title: String(s.title || 'Apply'), benefitsTitle: String(s.benefitsTitle || 'What you’ll get'), submitButtonLabel: String(s.submitButtonLabel || 'Submit Application'), successMessage: String(s.successMessage || 'Your application was submitted successfully.'), bulletItems: Array.isArray(s.bulletItems) ? s.bulletItems.map((x: any) => String(x)).filter(Boolean) : [] });
      setPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load submit application content');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function save() {
    try {
      setSaving(true);
      await apiClient.patch('/admin/settings', { submitApplicationContent: settings });
      pushToast('success', 'Submit application content saved.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save submit application content');
    } finally {
      setSaving(false);
    }
  }
  function addBullet() { const text = newBullet.trim(); if (!text) return; setSettings((p) => ({ ...p, bulletItems: [...p.bulletItems, text] })); setNewBullet(''); }
  const totalPages = Math.max(1, Math.ceil(settings.bulletItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.bulletItems.slice((safePage - 1) * ITEMS_PER_PAGE, (safePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE), [settings.bulletItems, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Submit Application Content</h3></div>
      <div className="settings-form">
        <input value={settings.title} onChange={(e) => setSettings((p) => ({ ...p, title: e.target.value }))} placeholder="Page title" />
        <input value={settings.benefitsTitle} onChange={(e) => setSettings((p) => ({ ...p, benefitsTitle: e.target.value }))} placeholder="Benefits heading" />
        <input value={settings.submitButtonLabel} onChange={(e) => setSettings((p) => ({ ...p, submitButtonLabel: e.target.value }))} placeholder="Submit button label" />
        <input value={settings.successMessage} onChange={(e) => setSettings((p) => ({ ...p, successMessage: e.target.value }))} placeholder="Success message after submit" />
      </div>
      <div className="inline-form"><input value={newBullet} onChange={(e) => setNewBullet(e.target.value)} placeholder="Add bullet text" /><button type="button" onClick={addBullet}>Add Text</button></div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 90px 90px' }}><span>Text</span><span>Update</span><span>Delete</span></div>
        {visibleItems.map((item, idx) => { const absoluteIndex = (safePage - 1) * ITEMS_PER_PAGE + idx; return <div key={`${absoluteIndex}-${item}`} className="row" style={{ gridTemplateColumns: '2fr 90px 90px' }}><input value={item} onChange={(e) => setSettings((p) => ({ ...p, bulletItems: p.bulletItems.map((x, i) => (i === absoluteIndex ? e.target.value : x)) }))} /><button type="button" onClick={save}>Save</button><button type="button" className="danger" onClick={() => setSettings((p) => ({ ...p, bulletItems: p.bulletItems.filter((_, i) => i !== absoluteIndex) }))}>Delete</button></div>; })}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</button></div>
    </section>
  );
}

export function InstructionContentTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const ITEMS_PER_PAGE = 20;
  const [openModule, setOpenModule] = useState<'instructions' | 'submitPopup' | 'postSubmitCard' | 'navigation' | 'instructionLines' | null>(null);
  const [settings, setSettings] = useState<InstructionContent>({
    pageTitle: 'Instructions',
    cardTitle: 'Please read carefully',
    startButtonLabel: 'Start Test',
    submitDialogBrand: 'Mockers',
    submitDialogTitle: 'Are you sure want to submit test',
    submitDialogSubtitle: "After submitting test you won't be able to re-attempt",
    postSubmitCardTitle: 'Result Pending',
    postSubmitCardReadyTitle: 'Result Ready',
    postSubmitCardDateLabel: 'Result date/time',
    postSubmitCardPendingMessage: 'Result will be available in',
    postSubmitCardReadyMessage: 'Result is now available.',
    postSubmitCardButtonLabel: 'Show Result',
    postSubmitCardLines: [],
    questionNavigationMode: 'sequential',
    items: ['Total questions: 10', 'Duration: 12 minutes', 'Each question has one correct answer', 'You can review before submitting'],
  });
  const [newLine, setNewLine] = useState('');
  const [newPostSubmitLine, setNewPostSubmitLine] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.instructionContent || {};
      setSettings({
        pageTitle: String(s.pageTitle || 'Instructions'),
        cardTitle: String(s.cardTitle || 'Please read carefully'),
        startButtonLabel: String(s.startButtonLabel || 'Start Test'),
        submitDialogBrand: String(s.submitDialogBrand || 'Mockers'),
        submitDialogTitle: String(s.submitDialogTitle || 'Are you sure want to submit test'),
        submitDialogSubtitle: String(s.submitDialogSubtitle || "After submitting test you won't be able to re-attempt"),
        postSubmitCardTitle: String(s.postSubmitCardTitle || 'Result Pending'),
        postSubmitCardReadyTitle: String(s.postSubmitCardReadyTitle || 'Result Ready'),
        postSubmitCardDateLabel: String(s.postSubmitCardDateLabel || 'Result date/time'),
        postSubmitCardPendingMessage: String(s.postSubmitCardPendingMessage || 'Result will be available in'),
        postSubmitCardReadyMessage: String(s.postSubmitCardReadyMessage || 'Result is now available.'),
        postSubmitCardButtonLabel: String(s.postSubmitCardButtonLabel || 'Show Result'),
        postSubmitCardLines: Array.isArray(s.postSubmitCardLines) ? s.postSubmitCardLines.map((x: any) => String(x)).filter(Boolean) : [],
        questionNavigationMode: String(s.questionNavigationMode || 'sequential') === 'free' ? 'free' : 'sequential',
        items: Array.isArray(s.items) ? s.items.map((x: any) => String(x)).filter(Boolean) : [],
      });
      setPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load instruction content');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function save() {
    try {
      setSaving(true);
      await apiClient.patch('/admin/settings', { instructionContent: settings });
      pushToast('success', 'Instruction content saved.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save instruction content');
    } finally {
      setSaving(false);
    }
  }
  function addLine() { const text = newLine.trim(); if (!text) return; setSettings((p) => ({ ...p, items: [...p.items, text] })); setNewLine(''); }
  function addPostSubmitLine() { const text = newPostSubmitLine.trim(); if (!text) return; setSettings((p) => ({ ...p, postSubmitCardLines: [...p.postSubmitCardLines, text] })); setNewPostSubmitLine(''); }
  const totalPages = Math.max(1, Math.ceil(settings.items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.items.slice((safePage - 1) * ITEMS_PER_PAGE, (safePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE), [settings.items, safePage]);
  const postSubmitTotalPages = Math.max(1, Math.ceil(settings.postSubmitCardLines.length / ITEMS_PER_PAGE));
  const postSubmitSafePage = Math.min(page, postSubmitTotalPages);
  const visiblePostSubmitItems = useMemo(
    () => settings.postSubmitCardLines.slice((postSubmitSafePage - 1) * ITEMS_PER_PAGE, (postSubmitSafePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE),
    [settings.postSubmitCardLines, postSubmitSafePage],
  );
  const sectionToggleStyle: CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 10,
    fontSize: 26,
    fontWeight: 800,
    lineHeight: '36px',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Instruction Content</h3></div>
      <div className="list table">
        <div className="row" style={{ gridTemplateColumns: '1fr 48px' }}>
          <span><strong>Instructions Screen Text</strong></span>
          <button type="button" style={sectionToggleStyle} onClick={() => setOpenModule((p) => (p === 'instructions' ? null : 'instructions'))}>
            {openModule === 'instructions' ? '-' : '+'}
          </button>
        </div>
      </div>
      {openModule === 'instructions' && (
        <div className="settings-form">
          <input value={settings.pageTitle} onChange={(e) => setSettings((p) => ({ ...p, pageTitle: e.target.value }))} placeholder="Instructions page title" />
          <input value={settings.cardTitle} onChange={(e) => setSettings((p) => ({ ...p, cardTitle: e.target.value }))} placeholder="Instructions card heading" />
          <input value={settings.startButtonLabel} onChange={(e) => setSettings((p) => ({ ...p, startButtonLabel: e.target.value }))} placeholder="Instructions start button label" />
        </div>
      )}

      <div className="list table">
        <div className="row" style={{ gridTemplateColumns: '1fr 48px' }}>
          <span><strong>Submit Popup Text (Quiz Submit Dialog)</strong></span>
          <button type="button" style={sectionToggleStyle} onClick={() => setOpenModule((p) => (p === 'submitPopup' ? null : 'submitPopup'))}>
            {openModule === 'submitPopup' ? '-' : '+'}
          </button>
        </div>
      </div>
      {openModule === 'submitPopup' && (
        <div className="settings-form">
          <input value={settings.submitDialogBrand} onChange={(e) => setSettings((p) => ({ ...p, submitDialogBrand: e.target.value }))} placeholder="Popup brand text (e.g. Mockers)" />
          <input value={settings.submitDialogTitle} onChange={(e) => setSettings((p) => ({ ...p, submitDialogTitle: e.target.value }))} placeholder="Popup main title (Are you sure...)" />
          <input value={settings.submitDialogSubtitle} onChange={(e) => setSettings((p) => ({ ...p, submitDialogSubtitle: e.target.value }))} placeholder="Popup subtitle (After submitting...)" />
        </div>
      )}

      <div className="list table">
        <div className="row" style={{ gridTemplateColumns: '1fr 48px' }}>
          <span><strong>Post Submit Home Card Text</strong></span>
          <button type="button" style={sectionToggleStyle} onClick={() => setOpenModule((p) => (p === 'postSubmitCard' ? null : 'postSubmitCard'))}>
            {openModule === 'postSubmitCard' ? '-' : '+'}
          </button>
        </div>
      </div>
      {openModule === 'postSubmitCard' && (
        <>
          <div className="settings-form">
            <input value={settings.postSubmitCardTitle} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardTitle: e.target.value }))} placeholder="Pending title (e.g. Result Pending)" />
            <input value={settings.postSubmitCardReadyTitle} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardReadyTitle: e.target.value }))} placeholder="Ready title (e.g. Result Ready)" />
            <input value={settings.postSubmitCardDateLabel} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardDateLabel: e.target.value }))} placeholder="Date label (e.g. Result date/time)" />
            <input value={settings.postSubmitCardPendingMessage} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardPendingMessage: e.target.value }))} placeholder="Pending message" />
            <input value={settings.postSubmitCardReadyMessage} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardReadyMessage: e.target.value }))} placeholder="Ready message" />
            <input value={settings.postSubmitCardButtonLabel} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardButtonLabel: e.target.value }))} placeholder="Result button label" />
          </div>
          <div className="inline-form"><input value={newPostSubmitLine} onChange={(e) => setNewPostSubmitLine(e.target.value)} placeholder="Add extra line in home result card" /><button type="button" onClick={addPostSubmitLine}>Add Line</button></div>
          <div className="list table">
            <div className="row row-head" style={{ gridTemplateColumns: '2fr 90px 90px' }}><span>Card Line Text</span><span>Update</span><span>Delete</span></div>
            {visiblePostSubmitItems.map((item, idx) => { const absoluteIndex = (postSubmitSafePage - 1) * ITEMS_PER_PAGE + idx; return <div key={`${absoluteIndex}-${item}`} className="row" style={{ gridTemplateColumns: '2fr 90px 90px' }}><input value={item} onChange={(e) => setSettings((p) => ({ ...p, postSubmitCardLines: p.postSubmitCardLines.map((x, i) => (i === absoluteIndex ? e.target.value : x)) }))} /><button type="button" onClick={save}>Save</button><button type="button" className="danger" onClick={() => setSettings((p) => ({ ...p, postSubmitCardLines: p.postSubmitCardLines.filter((_, i) => i !== absoluteIndex) }))}>Delete</button></div>; })}
          </div>
          <div className="pagination-wrap"><span>Page {postSubmitSafePage} of {postSubmitTotalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={postSubmitSafePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(postSubmitTotalPages, p + 1))} disabled={postSubmitSafePage === postSubmitTotalPages}>Next</button></div></div>
        </>
      )}

      <div className="list table">
        <div className="row" style={{ gridTemplateColumns: '1fr 48px' }}>
          <span><strong>Question Navigation Mode</strong></span>
          <button type="button" style={sectionToggleStyle} onClick={() => setOpenModule((p) => (p === 'navigation' ? null : 'navigation'))}>
            {openModule === 'navigation' ? '-' : '+'}
          </button>
        </div>
      </div>
      {openModule === 'navigation' && (
        <div className="settings-form">
          <select
            value={settings.questionNavigationMode}
            onChange={(e) => setSettings((p) => ({ ...p, questionNavigationMode: e.target.value as 'sequential' | 'free' }))}
          >
            <option value="sequential">One-by-one (lock next questions)</option>
            <option value="free">Open all questions at once</option>
          </select>
        </div>
      )}

      <div className="list table">
        <div className="row" style={{ gridTemplateColumns: '1fr 48px' }}>
          <span><strong>Instruction Lines List</strong></span>
          <button type="button" style={sectionToggleStyle} onClick={() => setOpenModule((p) => (p === 'instructionLines' ? null : 'instructionLines'))}>
            {openModule === 'instructionLines' ? '-' : '+'}
          </button>
        </div>
      </div>
      {openModule === 'instructionLines' && (
        <>
          <div className="inline-form"><input value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="Add instruction line" /><button type="button" onClick={addLine}>Add Line</button></div>
          <div className="list table">
            <div className="row row-head" style={{ gridTemplateColumns: '2fr 90px 90px' }}><span>Instruction Text</span><span>Update</span><span>Delete</span></div>
            {visibleItems.map((item, idx) => { const absoluteIndex = (safePage - 1) * ITEMS_PER_PAGE + idx; return <div key={`${absoluteIndex}-${item}`} className="row" style={{ gridTemplateColumns: '2fr 90px 90px' }}><input value={item} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x, i) => (i === absoluteIndex ? e.target.value : x)) }))} /><button type="button" onClick={save}>Save</button><button type="button" className="danger" onClick={() => setSettings((p) => ({ ...p, items: p.items.filter((_, i) => i !== absoluteIndex) }))}>Delete</button></div>; })}
          </div>
          <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
        </>
      )}
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</button></div>
    </section>
  );
}

export function ShareContentTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const [settings, setSettings] = useState<ShareContentSettings>({
    title: 'Share',
    body: 'Check out MockTestApp for practice tests and alerts.\n{storeUrl}',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.shareContent || {};
      setSettings({
        title: String(s.title || 'Share').trim().slice(0, 120) || 'Share',
        body:
          String(s.body || '').trim() ||
          'Check out MockTestApp for practice tests and alerts.\n{storeUrl}',
      });
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load share text');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    try {
      const body = String(settings.body || '').trim();
      if (!body) {
        pushToast('error', 'Share text is required.');
        return;
      }
      setSaving(true);
      await apiClient.patch('/admin/settings', {
        shareContent: {
          title: String(settings.title || 'Share').trim() || 'Share',
          body,
        },
      });
      pushToast('success', 'Share text saved.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save share text');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Share Text</h3></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Is text ko app ke Share action me use kiya jayega. <b>{'{storeUrl}'}</b> placeholder auto Play Store link se replace hoga.
      </p>
      <div className="settings-form">
        <input
          value={settings.title}
          onChange={(e) => setSettings((p) => ({ ...p, title: e.target.value }))}
          placeholder="Title (optional)"
          maxLength={120}
        />
      </div>
      <textarea
        value={settings.body}
        onChange={(e) => setSettings((p) => ({ ...p, body: e.target.value }))}
        placeholder="Share text"
        rows={8}
      />
      <div className="inline-form">
        <button type="button" className="ghost" onClick={load} disabled={saving}>Load</button>
        <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Share Text'}</button>
      </div>
    </section>
  );
}
