import { FormEvent, useMemo, useState } from 'react';

type TestItemLite = { id: string; title: string };
type ArticleItemLite = { id: string; headline: string };
type UserReportItem = {
  id: string;
  email: string;
  display_name: string;
  attempts_count: number;
  is_banned: boolean;
  ban_reason: string;
  last_attempt_at: string | null;
};
type InsightTopTest = { test_name: string; attempts_count: number };
type InsightGrowth = { month_key: string; users_count: number };
type NotificationScheduleItem = {
  id: string;
  title: string;
  message: string;
  target: 'all' | 'new_users' | 'active_users';
  segmentKey: string;
  scheduleAt: string;
  repeatType: 'none' | 'daily' | 'weekly' | 'monthly';
  dayOfWeek: number;
  dayOfMonth: number;
  repeatUntil: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
  sentAt: string;
};
type PublishScheduleItem = {
  id: string;
  entityType: 'test' | 'article';
  entityId: string;
  scheduleAt: string;
  notifyOnPublish: boolean;
  status: 'scheduled' | 'cancelled' | 'published';
};
type ExamCategoryItem = {
  id: string;
  level1: string;
  level2: string;
  level3: string;
  iconKey: string;
  enabled: boolean;
};
type ExamCategoryIconOption = {
  id: string;
  value: string;
  label: string;
};

const DEFAULT_EXAM_CATEGORY_ICON_OPTIONS: ExamCategoryIconOption[] = [
  { id: 'default', value: '', label: 'Default (star)' },
  { id: 'math', value: 'math', label: 'Math' },
  { id: 'reasoning', value: 'reasoning', label: 'Reasoning' },
  { id: 'english', value: 'english', label: 'English' },
  { id: 'gk', value: 'gk', label: 'GK / General' },
  { id: 'science', value: 'science', label: 'Science' },
  { id: 'computer', value: 'computer', label: 'Computer / Tech' },
  { id: 'history', value: 'history', label: 'History' },
  { id: 'law', value: 'law', label: 'Law / Legal' },
  { id: 'book', value: 'book', label: 'Book / Study' },
  { id: 'school', value: 'school', label: 'School / Exam' },
  { id: 'exam', value: 'exam', label: 'Exam' },
];

type ApiClient = {
  get: (url: string, config?: any) => Promise<any>;
  patch: (url: string, data?: any, config?: any) => Promise<any>;
  post: (url: string, data?: any, config?: any) => Promise<any>;
};

export function AnalyticsInsightsTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const [topTests, setTopTests] = useState<InsightTopTest[]>([]);
  const [growth, setGrowth] = useState<InsightGrowth[]>([]);
  const [months, setMonths] = useState('12');
  const [error, setError] = useState('');
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/insights', { params: { months: Number(months || '12') } });
      setTopTests(res.data?.mostAttemptedTests || []);
      setGrowth(res.data?.userGrowth || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load insights');
    }
  }
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Analytics & Insights</h3></div>
      <div className="inline-form">
        <input value={months} onChange={(e) => setMonths(e.target.value)} type="number" min={3} max={24} placeholder="Months" />
        <button type="button" onClick={load}>Load Insights</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 1fr' }}><span>Most Attempted Test</span><span>Attempts</span></div>
        {topTests.map((x) => <div key={x.test_name} className="row" style={{ gridTemplateColumns: '2fr 1fr' }}><span>{x.test_name}</span><span>{x.attempts_count}</span></div>)}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr' }}><span>User Growth Month</span><span>New Users</span></div>
        {growth.map((x) => <div key={x.month_key} className="row" style={{ gridTemplateColumns: '1fr 1fr' }}><span>{x.month_key}</span><span>{x.users_count}</span></div>)}
      </div>
    </section>
  );
}

export function NotificationSchedulingTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<NotificationScheduleItem[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<NotificationScheduleItem['target']>('all');
  const [segmentKey, setSegmentKey] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [repeatType, setRepeatType] = useState<NotificationScheduleItem['repeatType']>('none');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.notificationScheduling;
      const mapped = Array.isArray(s?.items) ? s.items.map((x: any, idx: number) => ({
        id: String(x.id || `schedule-${idx + 1}`),
        title: String(x.title || ''),
        message: String(x.message || ''),
        target: ['all', 'new_users', 'active_users'].includes(String(x.target)) ? x.target : 'all',
        segmentKey: String(x.segmentKey || ''),
        scheduleAt: String(x.scheduleAt || ''),
        repeatType: ['none', 'daily', 'weekly', 'monthly'].includes(String(x.repeatType)) ? x.repeatType : 'none',
        dayOfWeek: Number(x.dayOfWeek || 1),
        dayOfMonth: Number(x.dayOfMonth || 1),
        repeatUntil: String(x.repeatUntil || ''),
        status: ['scheduled', 'sent', 'failed', 'cancelled'].includes(String(x.status)) ? x.status : 'scheduled',
        createdAt: String(x.createdAt || ''),
        sentAt: String(x.sentAt || ''),
      })) : [];
      setItems(mapped);
      setPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load notification scheduling');
    }
  }

  async function saveAll(nextItems: NotificationScheduleItem[]) {
    try {
      setError('');
      setSaving(true);
      const res = await apiClient.patch('/admin/settings', { notificationScheduling: { items: nextItems } });
      setItems(res.data?.settings?.notificationScheduling?.items || nextItems);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save notification scheduling');
    } finally {
      setSaving(false);
    }
  }

  function addSchedule(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const cleanScheduleAt = scheduleAt.trim();
    if (!cleanTitle || !cleanMessage || !cleanScheduleAt) {
      setError('Title, message and schedule time are required');
      return;
    }
    const next: NotificationScheduleItem[] = [{
      id: `schedule-${Date.now()}`,
      title: cleanTitle,
      message: cleanMessage,
      target,
      segmentKey: segmentKey.trim(),
      scheduleAt: cleanScheduleAt,
      repeatType,
      dayOfWeek: Number(dayOfWeek || '1'),
      dayOfMonth: Number(dayOfMonth || '1'),
      repeatUntil: repeatUntil.trim(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      sentAt: '',
    }, ...items];
    setItems(next);
    setTitle(''); setMessage(''); setTarget('all'); setSegmentKey(''); setScheduleAt(''); setRepeatType('none'); setDayOfWeek('1'); setDayOfMonth('1'); setRepeatUntil('');
    setPage(1);
    saveAll(next);
  }

  function markStatus(item: NotificationScheduleItem, status: NotificationScheduleItem['status']) {
    const next = items.map((x) => (x.id === item.id ? { ...x, status, sentAt: status === 'sent' ? new Date().toISOString() : x.sentAt } : x));
    setItems(next);
    saveAll(next);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => items.slice((safePage - 1) * ITEMS_PER_PAGE, (safePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE), [items, safePage]);

  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Notification Scheduling</h3></div>
      <form onSubmit={addSchedule} className="inline-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Alert title" />
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Alert message" />
        <select value={target} onChange={(e) => setTarget(e.target.value as NotificationScheduleItem['target'])}><option value="all">All users</option><option value="new_users">New users</option><option value="active_users">Active users</option></select>
        <input value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)} placeholder="Segment key (e.g. Patwari)" />
        <input value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} placeholder="Schedule datetime (ISO)" />
        <select value={repeatType} onChange={(e) => setRepeatType(e.target.value as NotificationScheduleItem['repeatType'])}><option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
        {repeatType === 'weekly' && <input value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} type="number" min={0} max={6} placeholder="Day of week (0-6)" />}
        {repeatType === 'monthly' && <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} type="number" min={1} max={31} placeholder="Day of month (1-31)" />}
        {repeatType !== 'none' && <input value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} placeholder="Repeat until (ISO optional)" />}
        <button type="submit">Schedule Alert</button>
      </form>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={() => saveAll(items)} disabled={saving}>{saving ? 'Saving...' : 'Save Queue'}</button></div>
      {error && <p className="error">{error}</p>}
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1.1fr 120px 130px 120px 120px 90px 90px 90px' }}><span>Title</span><span>Message</span><span>Target</span><span>Schedule</span><span>Repeat</span><span>Status</span><span>Send</span><span>Retry</span><span>Cancel</span></div>
        {pagedItems.map((item) => <div key={item.id} className="row" style={{ gridTemplateColumns: '1fr 1.1fr 120px 130px 120px 120px 90px 90px 90px' }}><span>{item.title}</span><span>{item.message}</span><span>{item.segmentKey ? `${item.target} • ${item.segmentKey}` : item.target}</span><span>{item.scheduleAt}</span><span>{item.repeatType === 'none' ? 'No' : item.repeatType === 'weekly' ? `Weekly (${item.dayOfWeek})` : item.repeatType === 'monthly' ? `Monthly (${item.dayOfMonth})` : 'Daily'}</span><span>{item.status}</span><button type="button" className="ghost" onClick={() => markStatus(item, 'sent')}>Send</button><button type="button" className="ghost" onClick={() => markStatus(item, 'scheduled')}>Retry</button><button type="button" className="danger" onClick={() => markStatus(item, 'cancelled')}>Cancel</button></div>)}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
    </section>
  );
}

export function PublishSchedulingTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<PublishScheduleItem[]>([]);
  const [tests, setTests] = useState<TestItemLite[]>([]);
  const [articles, setArticles] = useState<ArticleItemLite[]>([]);
  const [entityType, setEntityType] = useState<'test' | 'article'>('test');
  const [entityId, setEntityId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  async function load() {
    try {
      setError('');
      const [schRes, testRes, articleRes] = await Promise.all([apiClient.get('/admin/publish-scheduling'), apiClient.get('/admin/tests'), apiClient.get('/admin/articles')]);
      setItems(schRes.data?.items || []);
      setTests(testRes.data?.items || []);
      setArticles(articleRes.data?.items || []);
      setPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load publish scheduling');
    }
  }
  async function addSchedule(e: FormEvent) {
    e.preventDefault();
    if (!entityId || !scheduleAt.trim()) {
      setError('Select item and schedule time');
      return;
    }
    try {
      setError('');
      await apiClient.post('/admin/publish-scheduling', { entityType, entityId, scheduleAt: scheduleAt.trim(), notifyOnPublish });
      setEntityId('');
      setScheduleAt('');
      setNotifyOnPublish(true);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to schedule publish');
    }
  }
  async function changeStatus(id: string, status: 'scheduled' | 'cancelled') {
    try {
      setError('');
      await apiClient.patch(`/admin/publish-scheduling/${id}`, { status });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update schedule status');
    }
  }
  const sourceList = entityType === 'test' ? tests : articles;
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => items.slice((safePage - 1) * ITEMS_PER_PAGE, (safePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE), [items, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Publish Scheduling</h3></div>
      <form onSubmit={addSchedule} className="inline-form">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value as 'test' | 'article')}><option value="test">Test</option><option value="article">News Article</option></select>
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
          <option value="">Select {entityType}</option>
          {entityType === 'test'
            ? (sourceList as TestItemLite[]).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))
            : (sourceList as ArticleItemLite[]).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.headline}
                </option>
              ))}
        </select>
        <input value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} placeholder="Schedule datetime (ISO)" />
        <label className="check-wrap"><input type="checkbox" checked={notifyOnPublish} onChange={(e) => setNotifyOnPublish(e.target.checked)} />notify on publish</label>
        <button type="submit">Schedule Publish</button>
      </form>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button></div>
      {error && <p className="error">{error}</p>}
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '120px 1fr 150px 110px 110px 100px' }}><span>Type</span><span>Entity ID</span><span>Schedule At</span><span>Status</span><span>Notify</span><span>Action</span></div>
        {pagedItems.map((item) => <div key={item.id} className="row" style={{ gridTemplateColumns: '120px 1fr 150px 110px 110px 100px' }}><span>{item.entityType}</span><span>{item.entityId}</span><span>{item.scheduleAt}</span><span>{item.status}</span><span>{item.notifyOnPublish ? 'Yes' : 'No'}</span>{item.status === 'scheduled' ? <button type="button" className="danger" onClick={() => changeStatus(item.id, 'cancelled')}>Cancel</button> : <button type="button" className="ghost" onClick={() => changeStatus(item.id, 'scheduled')}>Re-Schedule</button>}</div>)}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
    </section>
  );
}

export function ExamCategoriesTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<ExamCategoryItem[]>([]);
  const [iconOptions, setIconOptions] = useState<ExamCategoryIconOption[]>(DEFAULT_EXAM_CATEGORY_ICON_OPTIONS);
  const [newIconValue, setNewIconValue] = useState('');
  const [newIconLabel, setNewIconLabel] = useState('');
  const [newLevel1, setNewLevel1] = useState('');
  const [newLevel2, setNewLevel2] = useState('');
  const [newLevel3, setNewLevel3] = useState('');
  const [newIconKey, setNewIconKey] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showIconManager, setShowIconManager] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const s = res.data?.settings?.examCategories;
      const iconSetting = res.data?.settings?.examCategoryIconOptions;
      const mappedIcons = Array.isArray(iconSetting?.items)
        ? iconSetting.items
            .map((x: any, idx: number) => ({
              id: String(x.id || `exam-icon-${idx + 1}`),
              value: String(x.value || '').trim().toLowerCase(),
              label: String(x.label || '').trim(),
            }))
            .filter((x: ExamCategoryIconOption) => x.value || x.label)
        : [];
      setIconOptions(mappedIcons.length ? mappedIcons : DEFAULT_EXAM_CATEGORY_ICON_OPTIONS);
      const mapped = Array.isArray(s?.items)
        ? s.items.map((x: any, idx: number) => ({
            id: String(x.id || `exam-cat-${idx + 1}`),
            level1: String(x.level1 || ''),
            level2: String(x.level2 || ''),
            level3: String(x.level3 || ''),
            iconKey: String(x.iconKey || ''),
            enabled: x.enabled !== false,
          }))
        : [];
      setItems(mapped);
      setPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load exam categories');
    }
  }
  async function saveAll(nextItems: ExamCategoryItem[]) {
    try {
      setError('');
      setSaving(true);
      const payload = {
        examCategories: { items: nextItems },
        examCategoryIconOptions: { items: iconOptions },
      };
      const res = await apiClient.patch('/admin/settings', payload);
      setItems(res.data?.settings?.examCategories?.items || nextItems);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save exam categories');
    } finally {
      setSaving(false);
    }
  }

  async function saveIconOptions(nextOptions: ExamCategoryIconOption[]) {
    try {
      setError('');
      setSaving(true);
      const res = await apiClient.patch('/admin/settings', { examCategoryIconOptions: { items: nextOptions } });
      const fromServer = Array.isArray(res.data?.settings?.examCategoryIconOptions?.items)
        ? res.data.settings.examCategoryIconOptions.items
        : nextOptions;
      setIconOptions(
        fromServer
          .map((x: any, idx: number) => ({
            id: String(x.id || `exam-icon-${idx + 1}`),
            value: String(x.value || '').trim().toLowerCase(),
            label: String(x.label || '').trim(),
          }))
          .filter((x: ExamCategoryIconOption) => x.value || x.label),
      );
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save icon options');
    } finally {
      setSaving(false);
    }
  }

  function addIconOption(e: FormEvent) {
    e.preventDefault();
    const value = newIconValue.trim().toLowerCase();
    const label = newIconLabel.trim();
    if (!value || !label) {
      setError('Icon value and label are required');
      return;
    }
    if (iconOptions.some((x) => x.value === value)) {
      setError('This icon value already exists');
      return;
    }
    const next = [...iconOptions, { id: `exam-icon-${Date.now()}`, value, label }];
    setIconOptions(next);
    setNewIconValue('');
    setNewIconLabel('');
    saveIconOptions(next);
  }
  function addItem(e: FormEvent) {
    e.preventDefault();
    const level1 = newLevel1.trim();
    const level2 = newLevel2.trim();
    const level3 = newLevel3.trim();
    const iconKey = newIconKey.trim();
    if (!level1 || !level2 || !level3) {
      setError('All hierarchy levels are required');
      return;
    }
    const next = [{ id: `exam-cat-${Date.now()}`, level1, level2, level3, iconKey, enabled: newEnabled }, ...items];
    saveAll(next);
    setNewLevel1('');
    setNewLevel2('');
    setNewLevel3('');
    setNewIconKey('');
    setNewEnabled(true);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => items.slice((safePage - 1) * ITEMS_PER_PAGE, (safePage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE), [items, safePage]);
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>Exam Categories Hierarchy</h3></div>
      <form onSubmit={addItem} className="inline-form">
        <input value={newLevel1} onChange={(e) => setNewLevel1(e.target.value)} placeholder="Level 1 (e.g. State Exams)" />
        <input value={newLevel2} onChange={(e) => setNewLevel2(e.target.value)} placeholder="Level 2 (e.g. MP Govt)" />
        <input value={newLevel3} onChange={(e) => setNewLevel3(e.target.value)} placeholder="Level 3 (e.g. Patwari)" />
        <select value={newIconKey} onChange={(e) => setNewIconKey(e.target.value)}>
          {iconOptions.map((opt) => (
            <option key={opt.id} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="check-wrap"><input type="checkbox" checked={newEnabled} onChange={(e) => setNewEnabled(e.target.checked)} />enabled</label>
        <button type="submit">Add Hierarchy</button>
      </form>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={() => saveAll(items)} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</button></div>
      {error && <p className="error">{error}</p>}
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 120px 90px 90px' }}><span>Level 1</span><span>Level 2</span><span>Level 3</span><span>Icon Key</span><span>Enabled</span><span>Update</span><span>Delete</span></div>
        {visibleItems.map((item) => (
          <div key={item.id} className="row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 120px 90px 90px' }}>
            <input value={item.level1} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, level1: e.target.value } : x)))} />
            <input value={item.level2} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, level2: e.target.value } : x)))} />
            <input value={item.level3} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, level3: e.target.value } : x)))} />
            <select value={item.iconKey} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, iconKey: e.target.value } : x)))}>
              {iconOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="check-wrap"><input type="checkbox" checked={item.enabled} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, enabled: e.target.checked } : x)))} />{item.enabled ? 'on' : 'off'}</label>
            <button type="button" onClick={() => saveAll(items)}>Save</button>
            <button type="button" className="danger" onClick={() => { const next = items.filter((x) => x.id !== item.id); setItems(next); saveAll(next); }}>Delete</button>
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
      <div className="inline-form" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          type="button"
          title="Manage icon values"
          aria-label="Manage icon values"
          onClick={() => setShowIconManager((v) => !v)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            fontSize: '1.2rem',
            fontWeight: 700,
            lineHeight: 1,
            padding: 0,
          }}
        >
          +
        </button>
      </div>
      {showIconManager && (
        <>
          <form onSubmit={addIconOption} className="inline-form" style={{ marginTop: 14 }}>
            <input value={newIconValue} onChange={(e) => setNewIconValue(e.target.value)} placeholder="New icon key (e.g. railways)" />
            <input value={newIconLabel} onChange={(e) => setNewIconLabel(e.target.value)} placeholder="Dropdown label (e.g. Railways)" />
            <button type="submit">Add Icon Option</button>
          </form>
          <div className="list table">
            <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr 120px' }}><span>Icon Value</span><span>Label</span><span>Delete</span></div>
            {iconOptions.map((opt) => (
              <div key={opt.id} className="row" style={{ gridTemplateColumns: '1fr 1fr 120px' }}>
                <span>{opt.value || '(default)'}</span>
                <span>{opt.label}</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    const next = iconOptions.filter((x) => x.id !== opt.id);
                    setIconOptions(next);
                    saveIconOptions(next.length ? next : DEFAULT_EXAM_CATEGORY_ICON_OPTIONS);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function UserManagementAdvancedTabImpl({ apiClient, isSuperAdmin }: { apiClient: ApiClient; isSuperAdmin: boolean }) {
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<UserReportItem[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  async function load(nextPage = page) {
    try {
      setError('');
      const offset = (Math.max(1, nextPage) - 1) * ITEMS_PER_PAGE;
      const res = await apiClient.get('/admin/users/reports', { params: { q: query, limit: ITEMS_PER_PAGE, offset } });
      setItems(res.data?.items || []);
      setPage(Math.max(1, nextPage));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load user reports');
    }
  }
  async function toggleBan(item: UserReportItem) {
    const shouldBan = !item.is_banned;
    let reason = '';
    if (shouldBan) {
      reason = window.prompt(`Ban reason for ${item.email}`, item.ban_reason || 'Policy violation') || '';
      if (!reason.trim()) return;
    }
    try {
      setError('');
      await apiClient.patch(`/admin/users/${item.id}/ban`, { isBanned: shouldBan, banReason: reason.trim() });
      await load(page);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update ban status');
    }
  }
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>User Management Advanced</h3></div>
      <div className="inline-form"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users" /><button type="button" onClick={() => load(1)}>Load Reports</button></div>
      {error && <p className="error">{error}</p>}
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1.3fr 1fr 120px 170px 160px' }}><span>User</span><span>Attempts</span><span>Status</span><span>Last Attempt</span><span>Action</span></div>
        {items.map((item) => <div key={item.id} className="row" style={{ gridTemplateColumns: '1.3fr 1fr 120px 170px 160px' }}><span>{item.display_name || item.email}</span><span>{item.attempts_count}</span><span>{item.is_banned ? 'Blocked' : 'Active'}</span><span>{item.last_attempt_at ? new Date(item.last_attempt_at).toLocaleString() : '-'}</span>{isSuperAdmin ? <button type="button" className={item.is_banned ? 'ghost' : 'danger'} onClick={() => toggleBan(item)}>{item.is_banned ? 'Unblock' : 'Block'}</button> : <button disabled title="Only super admin can block/unblock users">Restricted</button>}</div>)}
      </div>
      <div className="pagination-wrap"><span>Page {page}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => load(Math.max(1, page - 1))} disabled={page === 1}>Previous</button><button type="button" className="ghost" onClick={() => load(page + 1)} disabled={items.length < ITEMS_PER_PAGE}>Next</button></div></div>
    </section>
  );
}
