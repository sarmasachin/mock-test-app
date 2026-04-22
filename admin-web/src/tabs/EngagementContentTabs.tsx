import { useMemo, useState } from 'react';

type ApiClient = {
  get: (url: string, config?: any) => Promise<any>;
  patch: (url: string, data?: any, config?: any) => Promise<any>;
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
type PollSettings = { items: PollItem[] };
type PushItem = {
  id: string;
  title: string;
  message: string;
  target: 'all' | 'new_users' | 'active_users';
  deepLink: string;
  scheduledAt: string;
  enabled: boolean;
  status: 'draft' | 'sent';
  resendCount: number;
  lastSentAt: string;
  createdAt: string;
};
type PushSettings = { items: PushItem[] };
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
  items: string[];
};

export function PollSettingsTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const POLLS_PER_PAGE = 20;
  const [settings, setSettings] = useState<PollSettings>({ items: [] });
  const [newItem, setNewItem] = useState({ question: '', options: '', allowMultiple: false, durationMinutes: '1440' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.pollSettings || {};
      const itemsRaw = Array.isArray(s.items) ? s.items : s.question ? [s] : [];
      setSettings({
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
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to load poll settings'); }
  }
  async function save() {
    try {
      setError('');
      setSaving(true);
      await apiClient.patch('/admin/settings', { pollSettings: settings });
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to save poll settings'); } finally { setSaving(false); }
  }
  function addPoll() {
    const question = newItem.question.trim();
    if (!question) return;
    const options = newItem.options.split(',').map((x) => x.trim()).filter(Boolean);
    setSettings((p) => ({ ...p, items: [...p.items, { id: `poll-${Date.now()}`, question, options, allowMultiple: newItem.allowMultiple, durationMinutes: Number(newItem.durationMinutes || '1440'), enabled: true, createdAt: new Date().toISOString() }] }));
    setNewItem({ question: '', options: '', allowMultiple: false, durationMinutes: '1440' });
  }
  const totalPages = Math.max(1, Math.ceil(settings.items.length / POLLS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.items.slice((safePage - 1) * POLLS_PER_PAGE, (safePage - 1) * POLLS_PER_PAGE + POLLS_PER_PAGE), [settings.items, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Poll Settings</h3></div>
      <div className="inline-form">
        <input value={newItem.question} onChange={(e) => setNewItem((p) => ({ ...p, question: e.target.value }))} placeholder="Poll question" />
        <input value={newItem.options} onChange={(e) => setNewItem((p) => ({ ...p, options: e.target.value }))} placeholder="Options comma separated" />
        <input value={newItem.durationMinutes} onChange={(e) => setNewItem((p) => ({ ...p, durationMinutes: e.target.value }))} placeholder="Duration minutes" type="number" min={1} />
        <label className="check-wrap"><input type="checkbox" checked={newItem.allowMultiple} onChange={(e) => setNewItem((p) => ({ ...p, allowMultiple: e.target.checked }))} />Multiple</label>
        <button type="button" onClick={addPoll}>Add Poll</button>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 2fr 120px 110px 90px 90px' }}><span>Question</span><span>Options</span><span>Duration (min)</span><span>Multiple</span><span>Update</span><span>Delete</span></div>
        {visibleItems.map((item) => (
          <div key={item.id} className="row" style={{ gridTemplateColumns: '2fr 2fr 120px 110px 90px 90px' }}>
            <input value={item.question} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, question: e.target.value } : x)) }))} />
            <input value={item.options.join(', ')} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, options: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) } : x)) }))} />
            <input type="number" min={1} value={item.durationMinutes} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, durationMinutes: Number(e.target.value || '1') } : x)) }))} />
            <label className="check-wrap"><input type="checkbox" checked={item.allowMultiple} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, allowMultiple: e.target.checked } : x)) }))} />yes</label>
            <button type="button" onClick={save}>Save</button>
            <button type="button" className="danger" onClick={() => setSettings((p) => ({ ...p, items: p.items.filter((x) => x.id !== item.id) }))}>Delete</button>
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Poll Settings'}</button></div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function PushNotificationSettingsTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const PUSH_PER_PAGE = 20;
  const [settings, setSettings] = useState<PushSettings>({ items: [] });
  const [newItem, setNewItem] = useState({ title: '', message: '', target: 'all' as PushItem['target'], deepLink: '', scheduledAt: '', enabled: true });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.pushNotificationSettings || {};
      const itemsRaw = Array.isArray(s.items) ? s.items : s.title || s.message ? [s] : [];
      setSettings({ items: itemsRaw.map((x: any, idx: number) => ({ id: String(x.id || `push-${idx + 1}`), title: String(x.title || ''), message: String(x.message || ''), target: ['all', 'new_users', 'active_users'].includes(String(x.target)) ? x.target : 'all', deepLink: String(x.deepLink || ''), scheduledAt: String(x.scheduledAt || ''), enabled: x.enabled !== false, status: x.status === 'sent' ? 'sent' : 'draft', resendCount: Number(x.resendCount || 0), lastSentAt: String(x.lastSentAt || ''), createdAt: String(x.createdAt || new Date().toISOString()) })) });
      setPage(1);
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to load push notification settings'); }
  }
  async function save() {
    try {
      setError('');
      setSaving(true);
      await apiClient.patch('/admin/settings', { pushNotificationSettings: settings });
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to save push notification settings'); } finally { setSaving(false); }
  }
  function addPush() {
    if (!newItem.title.trim() && !newItem.message.trim()) return;
    setSettings((p) => ({ ...p, items: [...p.items, { id: `push-${Date.now()}`, title: newItem.title.trim(), message: newItem.message.trim(), target: newItem.target, deepLink: newItem.deepLink.trim(), scheduledAt: newItem.scheduledAt.trim(), enabled: newItem.enabled, status: 'draft', resendCount: 0, lastSentAt: '', createdAt: new Date().toISOString() }] }));
    setNewItem({ title: '', message: '', target: 'all', deepLink: '', scheduledAt: '', enabled: true });
  }
  function resend(item: PushItem) {
    setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, status: 'sent', resendCount: (x.resendCount || 0) + 1, lastSentAt: new Date().toISOString() } : x)) }));
  }
  const totalPages = Math.max(1, Math.ceil(settings.items.length / PUSH_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.items.slice((safePage - 1) * PUSH_PER_PAGE, (safePage - 1) * PUSH_PER_PAGE + PUSH_PER_PAGE), [settings.items, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Push Notification Settings</h3></div>
      <div className="inline-form">
        <input value={newItem.title} onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))} placeholder="Notification title" />
        <input value={newItem.message} onChange={(e) => setNewItem((p) => ({ ...p, message: e.target.value }))} placeholder="Notification message" />
        <select value={newItem.target} onChange={(e) => setNewItem((p) => ({ ...p, target: e.target.value as PushItem['target'] }))}><option value="all">All users</option><option value="new_users">New users</option><option value="active_users">Active users</option></select>
        <input value={newItem.deepLink} onChange={(e) => setNewItem((p) => ({ ...p, deepLink: e.target.value }))} placeholder="Deep link (optional)" />
        <input value={newItem.scheduledAt} onChange={(e) => setNewItem((p) => ({ ...p, scheduledAt: e.target.value }))} placeholder="Schedule (ISO datetime optional)" />
        <label className="check-wrap"><input type="checkbox" checked={newItem.enabled} onChange={(e) => setNewItem((p) => ({ ...p, enabled: e.target.checked }))} />Enabled</label>
        <button type="button" onClick={addPush}>Add Push</button>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 2fr 120px 120px 90px 90px 90px 90px' }}><span>Title</span><span>Message</span><span>Target</span><span>Status</span><span>Resend</span><span>Update</span><span>Delete</span><span>Count</span></div>
        {visibleItems.map((item) => <div key={item.id} className="row" style={{ gridTemplateColumns: '1fr 2fr 120px 120px 90px 90px 90px 90px' }}><input value={item.title} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)) }))} /><input value={item.message} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, message: e.target.value } : x)) }))} /><select value={item.target} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, target: e.target.value as PushItem['target'] } : x)) }))}><option value="all">All users</option><option value="new_users">New users</option><option value="active_users">Active users</option></select><span>{item.status}</span><button type="button" className="ghost" onClick={() => resend(item)}>Resend</button><button type="button" onClick={save}>Save</button><button type="button" className="danger" onClick={() => setSettings((p) => ({ ...p, items: p.items.filter((x) => x.id !== item.id) }))}>Delete</button><span>{item.resendCount || 0}</span></div>)}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Push Settings'}</button></div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function SubmitApplicationContentTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const ITEMS_PER_PAGE = 20;
  const [settings, setSettings] = useState<SubmitApplicationContent>({ title: 'Apply', benefitsTitle: 'What you’ll get', submitButtonLabel: 'Submit Application', successMessage: 'Your application was submitted successfully.', bulletItems: ['Instant access after approval', 'Mock test practice & review', 'Score history in your profile'] });
  const [newBullet, setNewBullet] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.submitApplicationContent || {};
      setSettings({ title: String(s.title || 'Apply'), benefitsTitle: String(s.benefitsTitle || 'What you’ll get'), submitButtonLabel: String(s.submitButtonLabel || 'Submit Application'), successMessage: String(s.successMessage || 'Your application was submitted successfully.'), bulletItems: Array.isArray(s.bulletItems) ? s.bulletItems.map((x: any) => String(x)).filter(Boolean) : [] });
      setPage(1);
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to load submit application content'); }
  }
  async function save() {
    try {
      setError('');
      setSaving(true);
      await apiClient.patch('/admin/settings', { submitApplicationContent: settings });
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to save submit application content'); } finally { setSaving(false); }
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
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function InstructionContentTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const ITEMS_PER_PAGE = 20;
  const [settings, setSettings] = useState<InstructionContent>({ pageTitle: 'Instructions', cardTitle: 'Please read carefully', startButtonLabel: 'Start Test', items: ['Total questions: 10', 'Duration: 12 minutes', 'Each question has one correct answer', 'You can review before submitting'] });
  const [newLine, setNewLine] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.instructionContent || {};
      setSettings({ pageTitle: String(s.pageTitle || 'Instructions'), cardTitle: String(s.cardTitle || 'Please read carefully'), startButtonLabel: String(s.startButtonLabel || 'Start Test'), items: Array.isArray(s.items) ? s.items.map((x: any) => String(x)).filter(Boolean) : [] });
      setPage(1);
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to load instruction content'); }
  }
  async function save() {
    try {
      setError('');
      setSaving(true);
      await apiClient.patch('/admin/settings', { instructionContent: settings });
    } catch (err: any) { setError(err?.response?.data?.error || 'Failed to save instruction content'); } finally { setSaving(false); }
  }
  function addLine() { const text = newLine.trim(); if (!text) return; setSettings((p) => ({ ...p, items: [...p.items, text] })); setNewLine(''); }
  const totalPages = Math.max(1, Math.ceil(settings.items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => settings.items.slice((safePage - 1) * ITEMS_PER_PAGE, (safePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE), [settings.items, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Instruction Content</h3></div>
      <div className="settings-form">
        <input value={settings.pageTitle} onChange={(e) => setSettings((p) => ({ ...p, pageTitle: e.target.value }))} placeholder="Page title" />
        <input value={settings.cardTitle} onChange={(e) => setSettings((p) => ({ ...p, cardTitle: e.target.value }))} placeholder="Card title" />
        <input value={settings.startButtonLabel} onChange={(e) => setSettings((p) => ({ ...p, startButtonLabel: e.target.value }))} placeholder="Start button label" />
      </div>
      <div className="inline-form"><input value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="Add instruction line" /><button type="button" onClick={addLine}>Add Line</button></div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 90px 90px' }}><span>Instruction Text</span><span>Update</span><span>Delete</span></div>
        {visibleItems.map((item, idx) => { const absoluteIndex = (safePage - 1) * ITEMS_PER_PAGE + idx; return <div key={`${absoluteIndex}-${item}`} className="row" style={{ gridTemplateColumns: '2fr 90px 90px' }}><input value={item} onChange={(e) => setSettings((p) => ({ ...p, items: p.items.map((x, i) => (i === absoluteIndex ? e.target.value : x)) }))} /><button type="button" onClick={save}>Save</button><button type="button" className="danger" onClick={() => setSettings((p) => ({ ...p, items: p.items.filter((_, i) => i !== absoluteIndex) }))}>Delete</button></div>; })}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</button></div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
