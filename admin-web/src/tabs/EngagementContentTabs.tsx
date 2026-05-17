import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  /** Quick pick - must be empty if custom deep link is used (same rule as new row form). */
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

type PushCampaignSummary = {
  id: string;
  title: string;
  target: string;
  deepLink: string;
  sentAt: string;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  deactivated: number;
  notOpened: number;
  deliveryRate: number;
  ctr: number;
};

type PushCampaignEventRow = {
  id: number;
  displayName: string;
  email: string;
  phone: string;
  platform: string;
  deviceModel: string;
  status: string;
  failCode: string;
  deliveredAt: string | null;
  openedAt: string | null;
  openDelayMinutes: number | null;
};

/** Values accepted by app `openByPushRoute` (Android MainBottomNavHost). */
const PUSH_DEEP_LINK_PRESETS: { value: string; label: string }[] = [
  { value: '', label: '- None -' },
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

/** Custom wins if non-empty; else preset. Both non-empty â†' conflict (caller shows warning). */
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
  'Quick destination aur Custom deep link dono set hain - koi ek clear karein (sirf ek use ho sakta hai).';

type PushFormValues = Pick<
  PushItem,
  'title' | 'message' | 'target' | 'deepLinkPreset' | 'deepLinkCustom' | 'scheduledAt' | 'enabled'
>;

function pushTargetLabel(target: PushItem['target']) {
  if (target === 'new_users') return 'New users';
  if (target === 'active_users') return 'Active users';
  return 'All users';
}

function pushDeepLinkSummary(item: Pick<PushItem, 'deepLinkPreset' | 'deepLinkCustom'>) {
  const merged = mergePushDeepLink(item.deepLinkPreset, item.deepLinkCustom);
  if (!merged.ok) return 'Fix deep link';
  if (!merged.deepLink) return '-';
  const preset = PUSH_DEEP_LINK_PRESETS.find((o) => o.value === merged.deepLink);
  return preset?.label || merged.deepLink;
}

function PushFieldsForm({
  values,
  onChange,
  disabled,
  idPrefix,
}: {
  values: PushFormValues;
  onChange: (patch: Partial<PushFormValues>) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <div className="push-form-grid">
      <label className="push-field push-field-span-2" htmlFor={`${idPrefix}-title`}>
        <span className="push-field-label">Notification title</span>
        <input
          id={`${idPrefix}-title`}
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Users ko dikhega"
          disabled={disabled}
        />
      </label>
      <label className="push-field push-field-span-2" htmlFor={`${idPrefix}-message`}>
        <span className="push-field-label">Notification message</span>
        <input
          id={`${idPrefix}-message`}
          value={values.message}
          onChange={(e) => onChange({ message: e.target.value })}
          placeholder="Short message body"
          disabled={disabled}
        />
      </label>
      <label className="push-field" htmlFor={`${idPrefix}-target`}>
        <span className="push-field-label">Kaun ko bhejna hai (target)</span>
        <select
          id={`${idPrefix}-target`}
          value={values.target}
          onChange={(e) => onChange({ target: e.target.value as PushItem['target'] })}
          disabled={disabled}
        >
          <option value="all">All users</option>
          <option value="new_users">New users</option>
          <option value="active_users">Active users</option>
        </select>
      </label>
      <label className="push-field" htmlFor={`${idPrefix}-preset`}>
        <span className="push-field-label">App me kaun sa screen khule (quick pick)</span>
        <select
          id={`${idPrefix}-preset`}
          value={values.deepLinkPreset}
          onChange={(e) => onChange({ deepLinkPreset: e.target.value })}
          disabled={disabled}
        >
          {PUSH_DEEP_LINK_PRESETS.map((opt) => (
            <option key={opt.value || '__none__'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="push-field push-field-span-2" htmlFor={`${idPrefix}-custom`}>
        <span className="push-field-label">Custom deep link (optional)</span>
        <input
          id={`${idPrefix}-custom`}
          value={values.deepLinkCustom}
          onChange={(e) => onChange({ deepLinkCustom: e.target.value })}
          placeholder="Sirf tab jab quick pick use na ho"
          disabled={disabled}
        />
      </label>
      <label className="push-field" htmlFor={`${idPrefix}-schedule`}>
        <span className="push-field-label">Schedule (optional)</span>
        <input
          id={`${idPrefix}-schedule`}
          type="datetime-local"
          value={values.scheduledAt}
          onChange={(e) => onChange({ scheduledAt: e.target.value })}
          disabled={disabled}
        />
      </label>
      <div className="push-field push-field-check">
        <span className="push-field-label">Enabled</span>
        <label className="check-wrap" htmlFor={`${idPrefix}-enabled`}>
          <input
            id={`${idPrefix}-enabled`}
            type="checkbox"
            checked={values.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            disabled={disabled}
          />
          List me active rakhein
        </label>
      </div>
    </div>
  );
}

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
type DigestShareContentSettings = { title: string; body: string };

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

  /** Single path to DB + local state (avoids "Add Poll" only updating React state with no PATCH). */
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandPanel, setExpandPanel] = useState<'edit' | 'status' | null>(null);
  const expandRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [sendResult, setSendResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [sendingId, setSendingId] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsCampaign, setStatsCampaign] = useState<PushCampaignSummary | null>(null);
  const [statsEvents, setStatsEvents] = useState<PushCampaignEventRow[]>([]);
  const [statsEventsTotal, setStatsEventsTotal] = useState(0);
  const [statsEventsPage, setStatsEventsPage] = useState(1);
  const [statsFilter, setStatsFilter] = useState<'all' | 'delivered' | 'failed' | 'opened' | 'not_opened'>('all');
  const [statsSearch, setStatsSearch] = useState('');
  const STATS_EVENTS_PER_PAGE = 50;
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
   * this component â†' useState resets to `{ items: [] }`. Save still writes DB (PATCH); without load() on
   * mount the UI stayed empty until "Load". */
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reload when tab remounts, not every render
  }, []);

  async function loadCampaignEvents(campaignId: string, page: number, filter: string, search: string) {
    const offset = (page - 1) * STATS_EVENTS_PER_PAGE;
    const res = await apiClient.get(`/admin/notifications/campaigns/${campaignId}/events`, {
      params: {
        status: filter === 'all' ? '' : filter,
        q: search.trim(),
        limit: STATS_EVENTS_PER_PAGE,
        offset,
      },
    });
    setStatsEvents(Array.isArray(res.data?.items) ? res.data.items : []);
    setStatsEventsTotal(Number(res.data?.total || 0));
  }

  async function openStatsForItem(item: PushItem) {
    try {
      setStatsLoading(true);
      setStatsOpen(true);
      setStatsEventsPage(1);
      setStatsFilter('all');
      setStatsSearch('');
      const res = await apiClient.get(`/admin/notifications/campaigns/latest/${encodeURIComponent(item.id)}`);
      const campaign = res.data?.campaign as PushCampaignSummary | null;
      if (!campaign?.id) {
        setStatsCampaign(null);
        setStatsEvents([]);
        setStatsEventsTotal(0);
        pushToast('warning', 'No send stats yet. Use Send / Resend first.');
        return;
      }
      setStatsCampaign(campaign);
      await loadCampaignEvents(campaign.id, 1, 'all', '');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load push stats');
      setStatsOpen(false);
    } finally {
      setStatsLoading(false);
    }
  }

  async function refreshStatsModal() {
    if (!statsCampaign?.id) return;
    try {
      setStatsLoading(true);
      const res = await apiClient.get(`/admin/notifications/campaigns/${statsCampaign.id}/stats`);
      setStatsCampaign(res.data?.campaign || statsCampaign);
      await loadCampaignEvents(statsCampaign.id, statsEventsPage, statsFilter, statsSearch);
    } finally {
      setStatsLoading(false);
    }
  }

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
        const newId = next.items[next.items.length - 1]?.id;
        if (newId) {
          setExpandedId(newId);
          setExpandPanel('edit');
        }
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
      const ok = await save(next, 'Push item deleted and saved.');
      if (ok && expandedId === itemId) {
        setExpandedId(null);
        setExpandPanel(null);
      }
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
        pushItemId: item.id,
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
      const delivered = sent > 0;
      pushToast(delivered ? 'success' : 'error', resultLine);
      setSettings((p) => ({
        ...p,
        items: p.items.map((x) =>
          x.id === item.id
            ? {
                ...x,
                status: delivered ? 'sent' : x.status,
                resendCount: delivered ? (x.resendCount || 0) + 1 : x.resendCount || 0,
                lastSentAt: delivered ? new Date().toISOString() : x.lastSentAt,
              }
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
  function toggleExpand(itemId: string, panel: 'edit' | 'status') {
    if (expandedId === itemId && expandPanel === panel) {
      setExpandedId(null);
      setExpandPanel(null);
      return;
    }
    setExpandedId(itemId);
    setExpandPanel(panel);
    requestAnimationFrame(() => {
      expandRowRefs.current[itemId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function updatePushItem(itemId: string, patch: Partial<PushItem>) {
    setSettings((p) => ({
      ...p,
      items: p.items.map((x) => (x.id === itemId ? { ...x, ...patch } : x)),
    }));
  }

  const rowBusy = saving || !!sendingId || !!deletingId;

  return (
    <section className="panel-card push-notification-panel">

      <div className="push-section push-section-add">
        <h4>1. Naya push add karein</h4>
        <p className="push-section-hint muted">Quick screen <em>ya</em> Custom deep link - dono ek saath nahi.</p>
        <PushFieldsForm
          idPrefix="push-new"
          values={newItem}
          onChange={(patch) => setNewItem((p) => ({ ...p, ...patch }))}
          disabled={saving || adding}
        />
        <div className="push-section-actions">
          <button type="button" onClick={addPush} disabled={saving || adding}>
            {adding ? 'Adding...' : 'Add to list'}
          </button>
        </div>
      </div>

      <div className="push-section push-section-list">
        <h4>2. Saved pushes</h4>
        <p className="push-section-hint muted">Status (▼) par click — detail usi row ke niche khulegi. Edit alag se form kholta hai.</p>
        {!visibleItems.length ? (
          <p className="muted">Abhi koi push saved nahi.</p>
        ) : (
          <div className="list table push-list-simple push-list-expandable">
            <div className="row row-head push-list-row push-notification-grid-row">
              <span>Title</span>
              <span>Target</span>
              <span>Screen / link</span>
              <span>Status</span>
              <span>Last sent</span>
              <span>Actions</span>
            </div>
            {visibleItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const showEdit = isExpanded && expandPanel === 'edit';
              const showStatus = isExpanded && expandPanel === 'status';
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    expandRowRefs.current[item.id] = el;
                  }}
                  className={`push-list-item-wrap${isExpanded ? ' is-expanded' : ''}`}
                >
                  <div
                    className={`row push-list-row push-notification-grid-row${isExpanded ? ' is-selected' : ''}`}
                    aria-expanded={isExpanded}
                  >
                    <span className="push-list-title" title={item.title}>
                      {item.title.trim() || '(no title)'}
                    </span>
                    <span>{pushTargetLabel(item.target)}</span>
                    <span className="muted">{pushDeepLinkSummary(item)}</span>
                    <button
                      type="button"
                      className={`push-status-toggle${showStatus ? ' is-active' : ''}`}
                      aria-expanded={showStatus}
                      aria-label={`Status ${item.status}, details`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!rowBusy) toggleExpand(item.id, 'status');
                      }}
                      disabled={rowBusy}
                    >
                      <span className="push-status-chip">{item.status}</span>
                      <span className="push-expand-chevron" aria-hidden>
                        {showStatus ? '▲' : '▼'}
                      </span>
                    </button>
                    <span>{formatDateTime(item.lastSentAt)}</span>
                    <div className="push-list-actions">
                      <button
                        type="button"
                        className={`ghost${showEdit ? ' is-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(item.id, 'edit');
                        }}
                        disabled={rowBusy}
                      >
                        {showEdit ? 'Close' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          void openStatsForItem(item);
                        }}
                        disabled={rowBusy || statsLoading}
                      >
                        Stats
                      </button>
                      <button type="button" onClick={() => sendNow(item)} disabled={rowBusy}>
                        {sendingId === item.id ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                  {showStatus ? (
                    <div className="push-row-expand push-row-expand-status">
                      <h5 className="push-expand-title">Status details</h5>
                      <div className="push-status-details">
                        <div className="push-detail-cell">
                          <span className="push-detail-label">Status</span>
                          <span>{item.status}</span>
                        </div>
                        <div className="push-detail-cell">
                          <span className="push-detail-label">Enabled</span>
                          <span>{item.enabled ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="push-detail-cell">
                          <span className="push-detail-label">Resend count</span>
                          <span>{item.resendCount || 0}</span>
                        </div>
                        <div className="push-detail-cell">
                          <span className="push-detail-label">Last sent (IST)</span>
                          <span>{formatDateTime(item.lastSentAt)}</span>
                        </div>
                        <div className="push-detail-cell">
                          <span className="push-detail-label">Scheduled</span>
                          <span>{item.scheduledAt ? formatDateTime(item.scheduledAt) : '-'}</span>
                        </div>
                        <div className="push-detail-cell push-detail-cell-wide">
                          <span className="push-detail-label">Deep link</span>
                          <span>{pushDeepLinkSummary(item)}</span>
                        </div>
                      </div>
                      <div className="push-section-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            void openStatsForItem(item);
                          }}
                          disabled={rowBusy || statsLoading}
                        >
                          Open delivery stats
                        </button>
                        <button type="button" className="ghost" onClick={() => toggleExpand(item.id, 'edit')} disabled={rowBusy}>
                          Edit this push
                        </button>
                        <button type="button" className="ghost" onClick={() => toggleExpand(item.id, 'status')} disabled={rowBusy}>
                          Close
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {showEdit ? (
                    <div className="push-row-expand push-row-expand-edit">
                      <h5 className="push-expand-title">Edit push</h5>
                      <PushFieldsForm
                        idPrefix={`push-edit-${item.id}`}
                        values={item}
                        onChange={(patch) => updatePushItem(item.id, patch)}
                        disabled={rowBusy}
                      />
                      <div className="push-section-actions">
                        <button type="button" onClick={() => { void save(); }} disabled={rowBusy}>
                          {saving ? 'Saving...' : 'Save changes'}
                        </button>
                        <button type="button" onClick={() => sendNow(item)} disabled={rowBusy}>
                          {sendingId === item.id ? 'Sending...' : 'Send push now'}
                        </button>
                        <button type="button" className="danger" onClick={() => removePush(item.id)} disabled={rowBusy}>
                          {deletingId === item.id ? 'Deleting...' : 'Delete'}
                        </button>
                        <button type="button" className="ghost" onClick={() => toggleExpand(item.id, 'edit')} disabled={rowBusy}>
                          Close
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load} disabled={saving || adding || !!sendingId || !!deletingId}>Load</button><button type="button" onClick={() => { void save(); }} disabled={saving || adding || !!sendingId || !!deletingId}>{saving ? 'Saving...' : 'Save Push Settings'}</button></div>
      {sendResult ? <p className="muted">{sendResult}</p> : null}
      {statsOpen ? (
        <div
          className="admin-dialog-overlay"
          style={{ zIndex: 1200 }}
          onClick={() => setStatsOpen(false)}
          role="presentation"
        >
          <div
            className="panel-card"
            style={{ maxWidth: 960, width: 'min(96vw, 960px)', maxHeight: '90vh', overflow: 'auto', margin: '4vh auto' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Push notification stats"
          >
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3>Push stats{statsCampaign?.title ? `: ${statsCampaign.title}` : ''}</h3>
              <button type="button" className="ghost" onClick={() => setStatsOpen(false)}>Close</button>
            </div>
            {statsLoading && !statsCampaign ? <p className="muted">Loading...</p> : null}
            {statsCampaign ? (
              <>
                <p className="muted" style={{ lineHeight: 1.6 }}>
                  <strong>Campaign:</strong> {statsCampaign.title}
                  <br />
                  Target: {statsCampaign.target} | Deep link: {statsCampaign.deepLink || '-'} | Sent: {formatDateTime(statsCampaign.sentAt)}
                  <br />
                  Sent: {statsCampaign.sent.toLocaleString('en-IN')} | Delivered: {statsCampaign.delivered.toLocaleString('en-IN')} ({statsCampaign.deliveryRate}%)
                  | Failed: {statsCampaign.failed.toLocaleString('en-IN')} | Opened: {statsCampaign.opened.toLocaleString('en-IN')} | CTR: {statsCampaign.ctr}%
                  | Not opened: {statsCampaign.notOpened.toLocaleString('en-IN')} | Deactivated tokens: {statsCampaign.deactivated.toLocaleString('en-IN')}
                </p>
                <div className="inline-form" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <select
                    value={statsFilter}
                    onChange={(e) => {
                      const v = e.target.value as typeof statsFilter;
                      setStatsFilter(v);
                      setStatsEventsPage(1);
                      if (statsCampaign?.id) void loadCampaignEvents(statsCampaign.id, 1, v, statsSearch);
                    }}
                  >
                    <option value="all">All</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="opened">Opened</option>
                    <option value="not_opened">Not opened</option>
                  </select>
                  <input
                    value={statsSearch}
                    onChange={(e) => setStatsSearch(e.target.value)}
                    placeholder="Search name / email / phone"
                    style={{ minWidth: 200 }}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      if (!statsCampaign?.id) return;
                      void loadCampaignEvents(statsCampaign.id, 1, statsFilter, statsSearch).then(() => setStatsEventsPage(1));
                    }}
                  >
                    Search
                  </button>
                  <button type="button" className="ghost" onClick={() => { void refreshStatsModal(); }} disabled={statsLoading}>
                    Refresh
                  </button>
                </div>
                <div className="list table">
                  <div className="row row-head" style={{ gridTemplateColumns: '1.2fr 1.2fr 1fr 90px 1fr 80px 80px 90px' }}>
                    <span>User</span>
                    <span>Contact</span>
                    <span>Device</span>
                    <span>OS</span>
                    <span>Status</span>
                    <span>Opened</span>
                    <span>Delay (min)</span>
                    <span>Fail</span>
                  </div>
                  {statsEvents.map((ev) => (
                    <div key={ev.id} className="row" style={{ gridTemplateColumns: '1.2fr 1.2fr 1fr 90px 1fr 80px 80px 90px', fontSize: '0.88rem' }}>
                      <span>{ev.displayName || '-'}</span>
                      <span>{ev.phone || ev.email || '-'}</span>
                      <span>{ev.deviceModel || '-'}</span>
                      <span>{ev.platform || '-'}</span>
                      <span>{ev.openedAt ? 'opened' : ev.status}</span>
                      <span>{ev.openedAt ? 'yes' : 'no'}</span>
                      <span>{ev.openDelayMinutes != null ? String(ev.openDelayMinutes) : ' - '}</span>
                      <span>{ev.failCode || '-'}</span>
                    </div>
                  ))}
                  {!statsEvents.length ? <p className="muted">No rows for this filter.</p> : null}
                </div>
                <div className="pagination-wrap">
                  <span>
                    Page {statsEventsPage} of {Math.max(1, Math.ceil(statsEventsTotal / STATS_EVENTS_PER_PAGE))} ({statsEventsTotal} rows)
                  </span>
                  <div className="inline-form pagination-controls">
                    <button
                      type="button"
                      className="ghost"
                      disabled={statsEventsPage <= 1 || statsLoading}
                      onClick={() => {
                        const p = Math.max(1, statsEventsPage - 1);
                        setStatsEventsPage(p);
                        if (statsCampaign?.id) void loadCampaignEvents(statsCampaign.id, p, statsFilter, statsSearch);
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={statsEventsPage >= Math.ceil(statsEventsTotal / STATS_EVENTS_PER_PAGE) || statsLoading}
                      onClick={() => {
                        const p = statsEventsPage + 1;
                        setStatsEventsPage(p);
                        if (statsCampaign?.id) void loadCampaignEvents(statsCampaign.id, p, statsFilter, statsSearch);
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">No campaign data yet. Send this push once, then open Stats again.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SubmitApplicationContentTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const ITEMS_PER_PAGE = 20;
  const [settings, setSettings] = useState<SubmitApplicationContent>({ title: 'Apply', benefitsTitle: "What you'll get", submitButtonLabel: 'Submit Application', successMessage: 'Your application was submitted successfully.', bulletItems: ['Instant access after approval', 'Mock test practice & review', 'Score history in your profile'] });
  const [newBullet, setNewBullet] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.submitApplicationContent || {};
      setSettings({ title: String(s.title || 'Apply'), benefitsTitle: String(s.benefitsTitle || "What you'll get"), submitButtonLabel: String(s.submitButtonLabel || 'Submit Application'), successMessage: String(s.successMessage || 'Your application was submitted successfully.'), bulletItems: Array.isArray(s.bulletItems) ? s.bulletItems.map((x: any) => String(x)).filter(Boolean) : [] });
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
  const [dailyDigestShare, setDailyDigestShare] = useState<DigestShareContentSettings>({
    title: 'Daily Digest',
    body: 'Try today\'s Daily Digest on Mock Test App!\nDate: {date}\n\n{question}\n\nDownload: {storeUrl}',
  });
  const [dailyQuizShare, setDailyQuizShare] = useState<DigestShareContentSettings>({
    title: 'Daily Quiz Result',
    body: 'My Daily Quiz result on {date}\n\n{question}\nScore: {score}\n\nDownload: {storeUrl}',
  });
  const [savingDailyShare, setSavingDailyShare] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.shareContent || {};
      const digestShare = res.data?.settings?.dailyDigestShareContent || {};
      const quizShare = res.data?.settings?.dailyQuizShareContent || {};
      setSettings({
        title: String(s.title || 'Share').trim().slice(0, 120) || 'Share',
        body:
          String(s.body || '').trim() ||
          'Check out MockTestApp for practice tests and alerts.\n{storeUrl}',
      });
      setDailyDigestShare({
        title: String(digestShare.title || 'Daily Digest').trim().slice(0, 120) || 'Daily Digest',
        body:
          String(digestShare.body || '').trim() ||
          'Try today\'s Daily Digest on Mock Test App!\nDate: {date}\n\n{question}\n\nDownload: {storeUrl}',
      });
      setDailyQuizShare({
        title: String(quizShare.title || 'Daily Quiz Result').trim().slice(0, 120) || 'Daily Quiz Result',
        body:
          String(quizShare.body || '').trim() ||
          'My Daily Quiz result on {date}\n\n{question}\nScore: {score}\n\nDownload: {storeUrl}',
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

  async function saveDailyShare() {
    try {
      const digestBody = String(dailyDigestShare.body || '').trim();
      const quizBody = String(dailyQuizShare.body || '').trim();
      if (!digestBody) {
        pushToast('error', 'Daily Digest share text is required.');
        return;
      }
      if (!quizBody) {
        pushToast('error', 'Daily Quiz share text is required.');
        return;
      }
      setSavingDailyShare(true);
      await apiClient.patch('/admin/settings', {
        dailyDigestShareContent: {
          title: String(dailyDigestShare.title || 'Daily Digest').trim().slice(0, 120) || 'Daily Digest',
          body: digestBody,
        },
        dailyQuizShareContent: {
          title: String(dailyQuizShare.title || 'Daily Quiz Result').trim().slice(0, 120) || 'Daily Quiz Result',
          body: quizBody,
        },
      });
      pushToast('success', 'Daily digest/quiz share text saved.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save daily share text');
    } finally {
      setSavingDailyShare(false);
    }
  }

  return (
    <>
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
          rows={14}
          className="share-textarea"
        />
        <div className="inline-form">
          <button type="button" className="ghost" onClick={load} disabled={saving || savingDailyShare}>Load</button>
          <button type="button" onClick={save} disabled={saving || savingDailyShare}>{saving ? 'Saving...' : 'Save Share Text'}</button>
        </div>
      </section>

      <section className="panel-card" style={{ marginTop: 12 }}>
        <div className="panel-head"><h3>Daily Digest & Daily Quiz Share Text</h3></div>
        <p className="muted" style={{ marginTop: 0 }}>
          Placeholders: <b>{'{date}'}</b>, <b>{'{question}'}</b>, <b>{'{storeUrl}'}</b>, <b>{'{score}'}</b>, <b>{'{result}'}</b>
        </p>
        <div className="settings-form">
          <input
            value={dailyDigestShare.title}
            onChange={(e) => setDailyDigestShare((p) => ({ ...p, title: e.target.value }))}
            placeholder="Daily Digest share subject/title"
            maxLength={120}
          />
        </div>
        <textarea
          value={dailyDigestShare.body}
          onChange={(e) => setDailyDigestShare((p) => ({ ...p, body: e.target.value }))}
          placeholder="Daily Digest share text"
          rows={6}
          className="share-textarea"
        />
        <div className="settings-form" style={{ marginTop: 10 }}>
          <input
            value={dailyQuizShare.title}
            onChange={(e) => setDailyQuizShare((p) => ({ ...p, title: e.target.value }))}
            placeholder="Daily Quiz result share subject/title"
            maxLength={120}
          />
        </div>
        <textarea
          value={dailyQuizShare.body}
          onChange={(e) => setDailyQuizShare((p) => ({ ...p, body: e.target.value }))}
          placeholder="Daily Quiz result share text"
          rows={6}
          className="share-textarea"
        />
        <div className="inline-form">
          <button type="button" className="ghost" onClick={load} disabled={saving || savingDailyShare}>
            Reload
          </button>
          <button type="button" onClick={saveDailyShare} disabled={saving || savingDailyShare}>
            {savingDailyShare ? 'Saving...' : 'Save Share Text'}
          </button>
        </div>
      </section>
    </>
  );
}
