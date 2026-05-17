import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminAnalyticsDashboard } from '../components/AdminAnalyticsDashboard';
import { useAdminDialog } from '../adminDialog';
import { useAdminToast } from '../adminToast';
import { isProtectedSuperAdminEmail } from '../protectedSuperAdmin';

/** Display stored ISO (or parseable) times in India timezone for admin lists. */
function formatScheduleAtDisplay(iso: string): string {
  const raw = String(iso || '').trim();
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
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

/** `<input type="datetime-local">` value → UTC ISO for API / DB (server compares with Date.now()). */
function datetimeLocalToIsoUtc(localValue: string): string | null {
  const v = String(localValue || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type TestItemLite = { id: string; title: string };
type ArticleItemLite = { id: string; headline: string };
type UserReportItem = {
  id: string;
  email: string;
  display_name: string;
  /** Same value users often see on Profile (public numeric id). */
  six_digit_public_id: string | number | null;
  attempts_count: number;
  is_banned: boolean;
  ban_reason: string;
  last_attempt_at: string | null;
};
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
  { id: 'state', value: 'state', label: 'State Govt Exams' },
  { id: 'upsc', value: 'upsc', label: 'UPSC / Civil Services' },
  { id: 'ssc', value: 'ssc', label: 'SSC Exams' },
  { id: 'bank', value: 'bank', label: 'Bank Exams' },
  { id: 'railway', value: 'railway', label: 'Railway Exams' },
  { id: 'defence', value: 'defence', label: 'Defence Exams' },
  { id: 'police', value: 'police', label: 'Police Exams' },
  { id: 'judiciary', value: 'judiciary', label: 'Judiciary / PCS J' },
  { id: 'neet', value: 'neet', label: 'NEET / Medical' },
  { id: 'gate', value: 'gate', label: 'GATE / Engineering' },
  { id: 'cat', value: 'cat', label: 'CAT / MBA' },
  { id: 'jee', value: 'jee', label: 'JEE' },
  { id: 'cuet', value: 'cuet', label: 'CUET' },
  { id: 'iitjam', value: 'iitjam', label: 'IIT JAM' },
  { id: 'gmat', value: 'gmat', label: 'GMAT' },
  { id: 'ca', value: 'ca', label: 'CA / CS' },
  { id: 'insurance', value: 'insurance', label: 'Insurance Exams' },
  { id: 'agriculture', value: 'agriculture', label: 'Agriculture Exams' },
  { id: 'nursing', value: 'nursing', label: 'Nursing / Pharma' },
  { id: 'interview', value: 'interview', label: 'Interview Preparation' },
  { id: 'studyabroad', value: 'studyabroad', label: 'Study Abroad' },
  { id: 'startup', value: 'startup', label: 'Startup / Basics' },
  { id: 'teacher', value: 'teacher', label: 'Teaching Exams' },
  { id: 'ctet', value: 'ctet', label: 'CTET / TET' },
  { id: 'ugcnet', value: 'ugcnet', label: 'UGC NET / JRF' },
  { id: 'csirnet', value: 'csirnet', label: 'CSIR NET' },
  { id: 'clat', value: 'clat', label: 'CLAT' },
  { id: 'pcs', value: 'pcs', label: 'PCS / State Civil' },
  { id: 'patwari', value: 'patwari', label: 'Patwari / Revenue' },
  { id: 'constable', value: 'constable', label: 'Constable / Police' },
  { id: 'subinspector', value: 'subinspector', label: 'Sub Inspector' },
  { id: 'army', value: 'army', label: 'Army' },
  { id: 'airforce', value: 'airforce', label: 'Air Force' },
  { id: 'navy', value: 'navy', label: 'Navy' },
  { id: 'nda', value: 'nda', label: 'NDA / CDS' },
  { id: 'commerce', value: 'commerce', label: 'Commerce / BCom' },
  { id: 'accounts', value: 'accounts', label: 'Accounts / Finance' },
  { id: 'management', value: 'management', label: 'Management' },
  { id: 'hospital', value: 'hospital', label: 'Healthcare' },
  { id: 'pharma', value: 'pharma', label: 'Pharma' },
  { id: 'lab', value: 'lab', label: 'Lab / Technician' },
  { id: 'it', value: 'it', label: 'IT / Software' },
  { id: 'developer', value: 'developer', label: 'Developer' },
  { id: 'data', value: 'data', label: 'Data / Analytics' },
  { id: 'ai', value: 'ai', label: 'AI / ML' },
  { id: 'government', value: 'government', label: 'Government Jobs' },
  { id: 'central', value: 'central', label: 'Central Govt' },
  { id: 'ministerial', value: 'ministerial', label: 'Ministerial / Clerk' },
  { id: 'clerical', value: 'clerical', label: 'Clerical' },
  { id: 'typing', value: 'typing', label: 'Typing / Steno' },
  { id: 'railwayntpc', value: 'railwayntpc', label: 'Railway NTPC' },
  { id: 'groupd', value: 'groupd', label: 'Group D' },
  { id: 'apti', value: 'apti', label: 'Aptitude' },
  { id: 'verbal', value: 'verbal', label: 'Verbal Ability' },
  { id: 'currentaffairs', value: 'currentaffairs', label: 'Current Affairs' },
  { id: 'skill', value: 'skill', label: 'Skills / Certification' },
  { id: 'diploma', value: 'diploma', label: 'Diploma / Polytechnic' },
];

type ApiClient = {
  get: (url: string, config?: any) => Promise<any>;
  patch: (url: string, data?: any, config?: any) => Promise<any>;
  post: (url: string, data?: any, config?: any) => Promise<any>;
};

export function AnalyticsInsightsTabImpl({ apiClient }: { apiClient: ApiClient }) {
  return <AdminAnalyticsDashboard apiClient={apiClient} />;
}

export function NotificationSchedulingTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
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
  const [sendingId, setSendingId] = useState('');

  async function load() {
    try {
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
      pushToast('error', err?.response?.data?.error || 'Failed to load notification scheduling');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveAll(nextItems: NotificationScheduleItem[]) {
    try {
      setSaving(true);
      const res = await apiClient.patch('/admin/settings', { notificationScheduling: { items: nextItems } });
      setItems(res.data?.settings?.notificationScheduling?.items || nextItems);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save notification scheduling');
    } finally {
      setSaving(false);
    }
  }

  function addSchedule(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const scheduleIso = datetimeLocalToIsoUtc(scheduleAt);
    if (!cleanTitle || !cleanMessage || !scheduleIso) {
      pushToast('error', 'Title, message and a valid schedule date/time are required');
      return;
    }
    let repeatUntilOut = '';
    if (repeatType !== 'none' && repeatUntil.trim()) {
      const untilIso = datetimeLocalToIsoUtc(repeatUntil);
      if (!untilIso) {
        pushToast('error', 'Repeat until: pick a valid date/time or leave it empty');
        return;
      }
      repeatUntilOut = untilIso;
    }
    const next: NotificationScheduleItem[] = [{
      id: `schedule-${Date.now()}`,
      title: cleanTitle,
      message: cleanMessage,
      target,
      segmentKey: segmentKey.trim(),
      scheduleAt: scheduleIso,
      repeatType,
      dayOfWeek: Number(dayOfWeek || '1'),
      dayOfMonth: Number(dayOfMonth || '1'),
      repeatUntil: repeatUntilOut,
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

  async function sendNow(item: NotificationScheduleItem) {
    try {
      setSendingId(item.id);
      const res = await apiClient.post('/admin/notifications/send', {
        title: item.title,
        message: item.message,
        target: item.target,
      });
      const sent = Number(res.data?.sent || 0);
      const failed = Number(res.data?.failed || 0);
      const total = Number(res.data?.total || 0);
      const nextStatus: NotificationScheduleItem['status'] = sent > 0 ? 'sent' : 'failed';
      const next = items.map((x) =>
        x.id === item.id
          ? {
              ...x,
              status: nextStatus,
              sentAt: sent > 0 ? new Date().toISOString() : x.sentAt,
            }
          : x,
      );
      setItems(next);
      await saveAll(next);
      if (sent > 0) {
        pushToast('success', `Push sent to ${sent}/${total} devices${failed > 0 ? ` (${failed} failed)` : ''}.`);
      } else {
        pushToast('error', total > 0 ? `Push failed for ${failed}/${total} devices.` : 'No active device tokens found.');
      }
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to send push notification');
    } finally {
      setSendingId('');
    }
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
        <input
          type="datetime-local"
          step={60}
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          title="Your device local time; saved as UTC for the server"
          style={{ minWidth: 220 }}
        />
        <select value={repeatType} onChange={(e) => setRepeatType(e.target.value as NotificationScheduleItem['repeatType'])}><option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
        {repeatType === 'weekly' && <input value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} type="number" min={0} max={6} placeholder="Day of week (0-6)" />}
        {repeatType === 'monthly' && <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} type="number" min={1} max={31} placeholder="Day of month (1-31)" />}
        {repeatType !== 'none' && (
          <input
            type="datetime-local"
            step={60}
            value={repeatUntil}
            onChange={(e) => setRepeatUntil(e.target.value)}
            placeholder="Repeat until (optional)"
            title="Optional end date for repeats; leave empty for no end"
            style={{ minWidth: 220 }}
          />
        )}
        <button type="submit">Schedule Alert</button>
      </form>
      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--text-muted, #5f6b7a)' }}>
        Schedule uses your computer&apos;s date and time (picker). It is stored in UTC so publish/notification jobs can compare with the server clock.
      </p>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={() => saveAll(items)} disabled={saving}>{saving ? 'Saving...' : 'Save Queue'}</button></div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1.1fr 120px 130px 120px 120px 90px 90px 90px' }}><span>Title</span><span>Message</span><span>Target</span><span>Schedule</span><span>Repeat</span><span>Status</span><span>Send</span><span>Retry</span><span>Cancel</span></div>
        {pagedItems.map((item) => (
          <div key={item.id} className="row" style={{ gridTemplateColumns: '1fr 1.1fr 120px 130px 120px 120px 90px 90px 90px' }}>
            <span>{item.title}</span>
            <span>{item.message}</span>
            <span>{item.segmentKey ? `${item.target} • ${item.segmentKey}` : item.target}</span>
            <span title={item.scheduleAt}>{formatScheduleAtDisplay(item.scheduleAt)}</span>
            <span>
              {item.repeatType === 'none'
                ? 'No'
                : item.repeatType === 'weekly'
                  ? `Weekly (${item.dayOfWeek})`
                  : item.repeatType === 'monthly'
                    ? `Monthly (${item.dayOfMonth})`
                    : 'Daily'}
            </span>
            <span>{item.status}</span>
            <button type="button" className="ghost" onClick={() => void sendNow(item)} disabled={sendingId === item.id}>
              {sendingId === item.id ? 'Sending...' : 'Send'}
            </button>
            <button type="button" className="ghost" onClick={() => markStatus(item, 'scheduled')}>
              Retry
            </button>
            <button type="button" className="danger" onClick={() => markStatus(item, 'cancelled')}>
              Cancel
            </button>
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
    </section>
  );
}

export function PublishSchedulingTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<PublishScheduleItem[]>([]);
  const [tests, setTests] = useState<TestItemLite[]>([]);
  const [articles, setArticles] = useState<ArticleItemLite[]>([]);
  const [entityType, setEntityType] = useState<'test' | 'article'>('test');
  const [entityId, setEntityId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [page, setPage] = useState(1);
  async function load() {
    try {
      const [schRes, testRes, articleRes] = await Promise.all([apiClient.get('/admin/publish-scheduling'), apiClient.get('/admin/tests'), apiClient.get('/admin/articles')]);
      setItems(schRes.data?.items || []);
      setTests(testRes.data?.items || []);
      setArticles(articleRes.data?.items || []);
      setPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load publish scheduling');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function addSchedule(e: FormEvent) {
    e.preventDefault();
    const scheduleIso = datetimeLocalToIsoUtc(scheduleAt);
    if (!entityId || !scheduleIso) {
      pushToast('error', 'Select item and a valid schedule date/time');
      return;
    }
    try {
      await apiClient.post('/admin/publish-scheduling', { entityType, entityId, scheduleAt: scheduleIso, notifyOnPublish });
      setEntityId('');
      setScheduleAt('');
      setNotifyOnPublish(true);
      await load();
      pushToast('success', 'Publish scheduled.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to schedule publish');
    }
  }
  async function changeStatus(id: string, status: 'scheduled' | 'cancelled') {
    try {
      await apiClient.patch(`/admin/publish-scheduling/${id}`, { status });
      await load();
      pushToast('success', status === 'cancelled' ? 'Schedule cancelled.' : 'Schedule updated.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update schedule status');
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
        <input
          type="datetime-local"
          step={60}
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          title="Your device local time; stored as UTC for the server"
          style={{ minWidth: 220 }}
        />
        <label className="check-wrap"><input type="checkbox" checked={notifyOnPublish} onChange={(e) => setNotifyOnPublish(e.target.checked)} />notify on publish</label>
        <button type="submit">Schedule Publish</button>
      </form>
      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--text-muted, #5f6b7a)' }}>
        Pick date &amp; time from the calendar; it is sent to the server as ISO (UTC). List shows India time (IST) for readability.
      </p>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button></div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '120px 1fr 150px 110px 110px 100px' }}><span>Type</span><span>Entity ID</span><span>Schedule At</span><span>Status</span><span>Notify</span><span>Action</span></div>
        {pagedItems.map((item) => (
          <div key={item.id} className="row" style={{ gridTemplateColumns: '120px 1fr 150px 110px 110px 100px' }}>
            <span>{item.entityType}</span>
            <span>{item.entityId}</span>
            <span title={item.scheduleAt}>{formatScheduleAtDisplay(item.scheduleAt)}</span>
            <span>{item.status}</span>
            <span>{item.notifyOnPublish ? 'Yes' : 'No'}</span>
            {item.status === 'scheduled' ? (
              <button type="button" className="danger" onClick={() => changeStatus(item.id, 'cancelled')}>
                Cancel
              </button>
            ) : (
              <button type="button" className="ghost" onClick={() => changeStatus(item.id, 'scheduled')}>
                Re-Schedule
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {safePage} of {totalPages}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Previous</button><button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</button></div></div>
    </section>
  );
}

export function ExamCategoriesTabImpl({ apiClient }: { apiClient: ApiClient }) {
  const { pushToast } = useAdminToast();
  const ITEMS_PER_PAGE = 20;
  const ACCEPTED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'] as const;
  const [items, setItems] = useState<ExamCategoryItem[]>([]);
  const [iconOptions, setIconOptions] = useState<ExamCategoryIconOption[]>(DEFAULT_EXAM_CATEGORY_ICON_OPTIONS);
  const [newIconValue, setNewIconValue] = useState('');
  const [newIconLabel, setNewIconLabel] = useState('');
  const [newLevel1, setNewLevel1] = useState('');
  const [newLevel2, setNewLevel2] = useState('');
  const [newLevel3, setNewLevel3] = useState('');
  const [newIconKey, setNewIconKey] = useState('');
  const [newIconUploading, setNewIconUploading] = useState(false);
  const [rowIconUploadingId, setRowIconUploadingId] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showIconManager, setShowIconManager] = useState(false);

  function isUploadMimeSupported(mime: string): boolean {
    return ACCEPTED_IMAGE_MIME.includes((mime || '').toLowerCase() as (typeof ACCEPTED_IMAGE_MIME)[number]);
  }

  function isRemoteIconKey(value: string): boolean {
    const v = String(value || '').trim().toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
  }

  function fileToBase64Data(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const marker = 'base64,';
        const idx = result.indexOf(marker);
        if (idx === -1) {
          reject(new Error('Failed to process selected image'));
          return;
        }
        resolve(result.slice(idx + marker.length));
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadIconFile(file: File): Promise<string> {
    if (!isUploadMimeSupported(file.type)) {
      throw new Error('Unsupported image type (use JPEG, PNG, WebP, GIF, AVIF, or SVG).');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be 5MB or less');
    }
    const dataBase64 = await fileToBase64Data(file);
    const res = await apiClient.post('/admin/uploads/article-image', {
      fileName: file.name,
      contentType: file.type,
      dataBase64,
    });
    const url = String(res.data?.imageUrl || '').trim();
    if (!url) throw new Error('Upload response missing image URL');
    return url;
  }

  async function uploadNewIcon(file: File) {
    try {
      setNewIconUploading(true);
      const url = await uploadIconFile(file);
      setNewIconKey(url);
      pushToast('success', 'Icon uploaded. It will be used for this hierarchy row.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || err?.message || 'Failed to upload icon');
    } finally {
      setNewIconUploading(false);
    }
  }

  async function uploadRowIcon(itemId: string, file: File) {
    try {
      setRowIconUploadingId(itemId);
      const url = await uploadIconFile(file);
      setItems((prev) => prev.map((x) => (x.id === itemId ? { ...x, iconKey: url } : x)));
      pushToast('success', 'Icon uploaded for this row. Click Save to persist.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || err?.message || 'Failed to upload icon');
    } finally {
      setRowIconUploadingId('');
    }
  }
  async function load() {
    try {
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
      pushToast('error', err?.response?.data?.error || 'Failed to load exam categories');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveAll(nextItems: ExamCategoryItem[]) {
    try {
      setSaving(true);
      const payload = {
        examCategories: { items: nextItems },
        examCategoryIconOptions: { items: iconOptions },
      };
      const res = await apiClient.patch('/admin/settings', payload);
      setItems(res.data?.settings?.examCategories?.items || nextItems);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save exam categories');
    } finally {
      setSaving(false);
    }
  }

  async function saveIconOptions(nextOptions: ExamCategoryIconOption[]) {
    try {
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
      pushToast('error', err?.response?.data?.error || 'Failed to save icon options');
    } finally {
      setSaving(false);
    }
  }

  function addIconOption(e: FormEvent) {
    e.preventDefault();
    const value = newIconValue.trim().toLowerCase();
    const label = newIconLabel.trim();
    if (!value || !label) {
      pushToast('error', 'Icon value and label are required');
      return;
    }
    if (iconOptions.some((x) => x.value === value)) {
      pushToast('error', 'This icon value already exists');
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
      pushToast('error', 'All hierarchy levels are required');
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
    <section className="panel-card exam-categories-panel">
      <div className="panel-head"><h3>Exam Categories Hierarchy</h3></div>
      <form onSubmit={addItem} className="inline-form exam-categories-add-form">
        <input value={newLevel1} onChange={(e) => setNewLevel1(e.target.value)} placeholder="Level 1 (e.g. State Exams)" />
        <input value={newLevel2} onChange={(e) => setNewLevel2(e.target.value)} placeholder="Level 2 (e.g. MP Govt)" />
        <input value={newLevel3} onChange={(e) => setNewLevel3(e.target.value)} placeholder="Level 3 (e.g. Patwari)" />
        <select value={newIconKey} onChange={(e) => setNewIconKey(e.target.value)}>
          {newIconKey && !iconOptions.some((opt) => opt.value === newIconKey) ? (
            <option value={newIconKey}>Custom uploaded icon</option>
          ) : null}
          {iconOptions.map((opt) => (
            <option key={opt.id} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept={ACCEPTED_IMAGE_MIME.join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadNewIcon(f);
            e.currentTarget.value = '';
          }}
          disabled={newIconUploading || saving}
          title="Upload custom icon image"
        />
        {isRemoteIconKey(newIconKey) ? (
          <button
            type="button"
            className="ghost"
            onClick={() => setNewIconKey('')}
            title="Remove uploaded icon and use preset icon"
            disabled={newIconUploading || saving}
          >
            Use preset icon
          </button>
        ) : null}
        <label className="check-wrap"><input type="checkbox" checked={newEnabled} onChange={(e) => setNewEnabled(e.target.checked)} />enabled</label>
        <button type="submit">Add Hierarchy</button>
      </form>
      <div className="inline-form"><button type="button" className="ghost" onClick={load}>Load</button><button type="button" onClick={() => saveAll(items)} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</button></div>
      <div className="table-scroll-x">
        <div className="list table exam-categories-table">
          <div className="row row-head"><span>Level 1</span><span>Level 2</span><span>Level 3</span><span>Icon Key</span><span>Upload Icon</span><span>Icon Mode</span><span>Enabled</span><span>Update</span><span>Delete</span></div>
          {visibleItems.map((item) => (
            <div key={item.id} className="row">
            <input value={item.level1} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, level1: e.target.value } : x)))} />
            <input value={item.level2} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, level2: e.target.value } : x)))} />
            <input value={item.level3} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, level3: e.target.value } : x)))} />
            <select value={item.iconKey} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, iconKey: e.target.value } : x)))}>
              {item.iconKey && !iconOptions.some((opt) => opt.value === item.iconKey) ? (
                <option value={item.iconKey}>Custom uploaded icon</option>
              ) : null}
              {iconOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept={ACCEPTED_IMAGE_MIME.join(',')}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadRowIcon(item.id, f);
                e.currentTarget.value = '';
              }}
              disabled={saving || rowIconUploadingId === item.id}
              title="Upload custom icon image"
            />
            {isRemoteIconKey(item.iconKey) ? (
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, iconKey: '' } : x)))
                }
                title="Remove uploaded icon and switch to preset icon"
                disabled={saving || rowIconUploadingId === item.id}
              >
                Preset
              </button>
            ) : (
              <span />
            )}
            <label className="check-wrap"><input type="checkbox" checked={item.enabled} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, enabled: e.target.checked } : x)))} />{item.enabled ? 'on' : 'off'}</label>
            <button type="button" onClick={() => saveAll(items)}>Save</button>
            <button type="button" className="danger" onClick={() => { const next = items.filter((x) => x.id !== item.id); setItems(next); saveAll(next); }}>Delete</button>
            </div>
          ))}
        </div>
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
  const { pushToast } = useAdminToast();
  const { prompt: adminPrompt } = useAdminDialog();
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<UserReportItem[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  async function load(nextPage = page) {
    try {
      const offset = (Math.max(1, nextPage) - 1) * ITEMS_PER_PAGE;
      const res = await apiClient.get('/admin/users/reports', { params: { q: query, limit: ITEMS_PER_PAGE, offset } });
      setItems(res.data?.items || []);
      setPage(Math.max(1, nextPage));
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load user reports');
    }
  }
  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function toggleBan(item: UserReportItem) {
    if (isProtectedSuperAdminEmail(item.email)) {
      pushToast('error', 'This account is a protected super admin and cannot be blocked from here.');
      return;
    }
    const shouldBan = !item.is_banned;
    let reason = '';
    if (shouldBan) {
      const entered = await adminPrompt({
        title: `Ban user — ${item.email}`,
        description: 'This reason may be shown to the user or in admin logs.',
        defaultValue: item.ban_reason || 'Policy violation',
        placeholder: 'Ban reason',
        confirmLabel: 'Ban user',
        cancelLabel: 'Cancel',
        required: true,
        multiline: true,
        rows: 3,
      });
      if (entered === null) return;
      reason = entered;
    }
    try {
      await apiClient.patch(`/admin/users/${item.id}/ban`, { isBanned: shouldBan, banReason: reason.trim() });
      await load(page);
      pushToast('success', shouldBan ? 'User blocked.' : 'User unblocked.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update ban status');
    }
  }
  return (
    <section className="panel-card">
      <div className="panel-head"><h3>User Management Advanced</h3></div>
      {!isSuperAdmin ? (
        <p style={{ margin: '0 0 10px', fontSize: '0.86rem', color: 'var(--text-muted, #5f6b7a)' }}>
          Block / unblock from this report list requires a <strong>super admin</strong> login. Grant admin roles on the
          Users tab (also super admin only).
        </p>
      ) : null}
      <div className="inline-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, phone, or public id"
        />
        <button type="button" onClick={() => load(1)}>
          Load Reports
        </button>
      </div>
      <div className="list table">
        <div
          className="row row-head"
          style={{
            gridTemplateColumns: 'minmax(120px, 1.2fr) 100px 88px 92px minmax(130px, 1fr) 118px',
          }}
        >
          <span>User</span>
          <span title="Shown on user profile in the app">Public ID</span>
          <span>Attempts</span>
          <span>Status</span>
          <span>Last Attempt</span>
          <span>Action</span>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className="row"
            style={{
              gridTemplateColumns: 'minmax(120px, 1.2fr) 100px 88px 92px minmax(130px, 1fr) 118px',
            }}
          >
            <span>{item.display_name || item.email}</span>
            <span
              title="Profile / public id (six_digit_public_id)"
              style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {item.six_digit_public_id != null && item.six_digit_public_id !== ''
                ? String(item.six_digit_public_id)
                : '—'}
            </span>
            <span>{item.attempts_count}</span>
            <span>{item.is_banned ? 'Blocked' : 'Active'}</span>
            <span>{item.last_attempt_at ? new Date(item.last_attempt_at).toLocaleString() : '-'}</span>
            {isSuperAdmin ? (
              isProtectedSuperAdminEmail(item.email) ? (
                <span title="Permanent super admin" style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
                  Protected
                </span>
              ) : (
                <button type="button" className={item.is_banned ? 'ghost' : 'danger'} onClick={() => toggleBan(item)}>
                  {item.is_banned ? 'Unblock' : 'Block'}
                </button>
              )
            ) : (
              <button disabled title="Only super admin can block/unblock users">
                Restricted
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="pagination-wrap"><span>Page {page}</span><div className="inline-form pagination-controls"><button type="button" className="ghost" onClick={() => load(Math.max(1, page - 1))} disabled={page === 1}>Previous</button><button type="button" className="ghost" onClick={() => load(page + 1)} disabled={items.length < ITEMS_PER_PAGE}>Next</button></div></div>
    </section>
  );
}
