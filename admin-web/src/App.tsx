import axios from 'axios';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  AnalyticsInsightsTabImpl,
  ExamCategoriesTabImpl,
  NotificationSchedulingTabImpl,
  PublishSchedulingTabImpl,
  UserManagementAdvancedTabImpl,
} from './tabs/AdvancedAdminTabs';
import {
  InstructionContentTabImpl,
  PollSettingsTabImpl,
  PushNotificationSettingsTabImpl,
  SubmitApplicationContentTabImpl,
} from './tabs/EngagementContentTabs';

type Tab =
  | 'dashboard'
  | 'leaderboard'
  | 'allTests'
  | 'questionBuilder'
  | 'profile'
  | 'feedback'
  | 'helpSupport'
  | 'reportIssue'
  | 'achievement'
  | 'privacyPolicy'
  | 'termsOfUse'
  | 'dailyDigest'
  | 'dailyQuiz'
  | 'articles'
  | 'homeContent'
  | 'pollSettings'
  | 'pushNotificationSettings'
  | 'notificationScheduling'
  | 'publishScheduling'
  | 'submitApplicationContent'
  | 'instructionContent'
  | 'examCategories'
  | 'analyticsInsights'
  | 'userManagementAdvanced'
  | 'settings'
  | 'auditLogs'
  | 'users';
type TestKind = 'mock' | 'quiz';
type RangeKind = 'weekly' | 'monthly' | 'all';

type TestItem = {
  id: string;
  slug: string;
  title: string;
  subcategory: string;
  meta_line: string;
  duration_minutes: number;
  question_count: number;
  exam_date?: string | null;
  total_marks?: number;
  slot_label?: string;
  capacity_total?: number;
  enrolled_count?: number;
  attempts_allowed?: number;
  language_mode?: string;
  exam_mode?: string;
  negative_marking_text?: string;
  test_type_label?: string;
  valid_until?: string | null;
  answer_key_release_at?: string | null;
  result_release_at?: string | null;
  dynamic_date_enabled?: boolean;
  date_cycle_days?: number;
  test_kind: TestKind;
  is_published: boolean;
  dynamic_fluctuation_on_publish: boolean;
};

type QuestionItem = {
  id: number;
  test_id: string;
  position: number;
  stem: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_index: number;
  explanation: string;
};

type DailyDigestItem = {
  id: string;
  question_prompt: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_index: number;
  fact_text: string;
  is_published: boolean;
};

type DailyQuizItem = {
  id: string;
  questionPrompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  explanation: string;
  isPublished: boolean;
};


type ArticleItem = {
  id: string;
  feed_kind: 'news' | 'job' | 'exam';
  headline: string;
  summary: string;
  category: string;
  body: string;
  link_url: string;
  is_published: boolean;
};
type AppSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationOpen: boolean;
};
type ProfileMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  path: string;
  enabled: boolean;
};
type SupportInboxItem = {
  id: string;
  user: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'new' | 'in_progress' | 'resolved';
};
type HomeContentSection = {
  id: string;
  title: string;
  items: string[];
};
type HomeQuickActionItem = {
  title: string;
  actionKey: string;
  iconKey?: string;
};
type HomeQuickActionSection = {
  id: string;
  title: string;
  items: HomeQuickActionItem[];
};
type HomeBannerItem = {
  id: string;
  imageUrl: string;
  enabled: boolean;
};
type HomeNewsSlideItem = {
  id: string;
  articleId: string;
  headline: string;
  imageUrl: string;
  enabled: boolean;
};
type HomeContentSettings = {
  welcomeText: string;
  quickActionsTitle: string;
  sections: HomeContentSection[];
  quickActionSections: HomeQuickActionSection[];
  banners: HomeBannerItem[];
  newsSlides: HomeNewsSlideItem[];
  startSeriesLockSeconds: number;
  startSeriesActiveWindowMinutes: number;
};
type AuditLogItem = {
  id: number;
  action_type: string;
  target_type: string;
  target_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  details_json: Record<string, unknown>;
  created_at: string;
};

type UserItem = {
  id: string;
  email: string;
  display_name: string;
  phone: string;
  is_admin: boolean;
  is_super_admin: boolean;
  is_banned: boolean;
  ban_reason: string;
  banned_at: string | null;
};
const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  leaderboard: 'Leaderboard',
  allTests: 'All Tests',
  questionBuilder: 'Question Builder',
  profile: 'Profile',
  feedback: 'Feedback',
  helpSupport: 'Help and Support',
  reportIssue: 'Report Issue',
  achievement: 'Achievement',
  privacyPolicy: 'Privacy Policy',
  termsOfUse: 'Terms of Use',
  dailyDigest: 'Daily Digest',
  dailyQuiz: 'Daily Quiz',
  articles: 'Articles',
  homeContent: 'Home Content',
  pollSettings: 'Poll Settings',
  pushNotificationSettings: 'Push Notification',
  notificationScheduling: 'Notification Scheduling',
  publishScheduling: 'Publish Scheduling',
  submitApplicationContent: 'Submit Application',
  instructionContent: 'Instruction Content',
  examCategories: 'Exam Categories',
  analyticsInsights: 'Analytics & Insights',
  userManagementAdvanced: 'User Management Advanced',
  settings: 'Settings',
  auditLogs: 'Audit Logs',
  users: 'Users',
};
const TAB_ICONS: Record<Tab, string> = {
  dashboard: 'DB',
  leaderboard: 'LB',
  allTests: 'TS',
  questionBuilder: 'QB',
  profile: 'PR',
  feedback: 'FB',
  helpSupport: 'HS',
  reportIssue: 'RI',
  achievement: 'AC',
  privacyPolicy: 'PP',
  termsOfUse: 'TU',
  dailyDigest: 'DD',
  dailyQuiz: 'DQ',
  articles: 'AR',
  homeContent: 'HC',
  pollSettings: 'PL',
  pushNotificationSettings: 'PN',
  notificationScheduling: 'NS',
  publishScheduling: 'PS',
  submitApplicationContent: 'SA',
  instructionContent: 'IN',
  examCategories: 'EX',
  analyticsInsights: 'AN',
  userManagementAdvanced: 'UM',
  settings: 'ST',
  auditLogs: 'LG',
  users: 'US',
};

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/v1';

const api = axios.create({
  baseURL: apiBase,
  timeout: 15000,
});

function normalizeBoolean(value: unknown, fallback = true) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function App() {
  const [token, setToken] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error' | 'success'>('info');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedQuestionTestId, setSelectedQuestionTestId] = useState<string>('');

  const authedApi = useMemo(() => {
    const instance = axios.create({ baseURL: apiBase, timeout: 15000 });
    instance.interceptors.request.use((config) => {
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return instance;
  }, [token]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('info');
    try {
      const loginRes = await api.post('/auth/login', {
        identifier,
        password,
      });
      const accessToken = String(loginRes.data?.accessToken || '');
      if (!accessToken) throw new Error('Token missing in login response');
      const meRes = await api.get('/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!meRes.data?.user?.isAdmin) {
        setMessageType('error');
        setMessage('This account is not allowed for admin panel.');
        return;
      }
      setIsAdmin(true);
      setIsSuperAdmin(Boolean(meRes.data?.user?.isSuperAdmin));
      setToken(accessToken);
      setMessageType('success');
      setMessage('Login successful.');
    } catch (err: any) {
      setMessageType('error');
      setMessage(err?.response?.data?.error || 'Login failed. Check ID and password.');
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="page auth-page">
        <div className="mesh-bg" aria-hidden="true">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        <div className="auth-shell">
          <div className="auth-card login-card">
            <h2>एडमिन लॉगिन</h2>
            <p className="sub">प्रवेश के लिए क्रेडेंशियल्स दर्ज करें</p>
            <form onSubmit={handleLogin} className="auth-form">
              <div className="input-group">
                <label>ईमेल / मोबाइल</label>
                <div className="input-box">
                  <i aria-hidden="true">✉</i>
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ईमेल/मोबाइल दर्ज करें"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>
              <div className="input-group">
                <label>पासवर्ड</label>
                <div className="input-box">
                  <i aria-hidden="true">🔒</i>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="पासवर्ड दर्ज करें"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'लॉगिन हो रहा है...' : 'लॉगिन करें  >'}
              </button>
            </form>
            {message && <p className={`auth-message ${messageType} ${messageType === 'error' ? 'error-p' : ''}`}>{message}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="admin-shell">
        <aside className="sidebar">
          <div>
            <p className="brand-tag">MockTest</p>
            <h2 className="brand-title">Admin Panel</h2>
          </div>
          <nav className="side-nav">
            {(['dashboard', 'analyticsInsights', 'leaderboard', 'allTests', 'questionBuilder', 'profile', 'feedback', 'helpSupport', 'reportIssue', 'achievement', 'privacyPolicy', 'termsOfUse', 'dailyDigest', 'dailyQuiz', 'articles', 'homeContent', 'pollSettings', 'pushNotificationSettings', 'notificationScheduling', 'publishScheduling', 'submitApplicationContent', 'instructionContent', 'examCategories', 'settings', 'auditLogs', 'users', 'userManagementAdvanced'] as Tab[]).map(
              (name) => (
              <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
                <span>{TAB_ICONS[name]}</span>
                {TAB_LABELS[name]}
              </button>
              ),
            )}
          </nav>
        </aside>
        <main className="main">
          <header className="topbar">
            <div>
              <h1>{TAB_LABELS[tab]}</h1>
              <p>Professional control center</p>
            </div>
            <button
              onClick={() => {
                setIsAdmin(false);
                setIsSuperAdmin(false);
                setToken('');
                setMessage('');
                setIdentifier('');
                setPassword('');
              }}
            >
              Logout
            </button>
          </header>
          {tab === 'dashboard' && <DashboardTab apiClient={authedApi} />}
          {tab === 'analyticsInsights' && <AnalyticsInsightsTab apiClient={authedApi} />}
          {tab === 'leaderboard' && <LeaderboardTab />}
          {tab === 'allTests' && (
            <TestsTab
              apiClient={authedApi}
              mode="allTests"
              selectedQuestionTestId={selectedQuestionTestId}
              onSelectQuestionTest={(testId) => {
                setSelectedQuestionTestId(testId);
                setTab('questionBuilder');
              }}
            />
          )}
          {tab === 'questionBuilder' && (
            <TestsTab
              apiClient={authedApi}
              mode="questionBuilder"
              selectedQuestionTestId={selectedQuestionTestId}
              onSelectQuestionTest={setSelectedQuestionTestId}
            />
          )}
          {tab === 'profile' && <ProfileTab apiClient={authedApi} />}
          {tab === 'feedback' && <SupportInboxSettingsTab apiClient={authedApi} title="Feedback" settingsKey="feedbackInbox" />}
          {tab === 'helpSupport' && <SimpleContentSettingsTab apiClient={authedApi} title="Help and Support" settingsKey="helpSupportContent" />}
          {tab === 'reportIssue' && <SupportInboxSettingsTab apiClient={authedApi} title="Report Issue" settingsKey="reportIssueInbox" />}
          {tab === 'achievement' && <SimpleContentSettingsTab apiClient={authedApi} title="Achievement" settingsKey="achievementContent" />}
          {tab === 'privacyPolicy' && <SimpleContentSettingsTab apiClient={authedApi} title="Privacy Policy" settingsKey="privacyPolicyContent" />}
          {tab === 'termsOfUse' && <SimpleContentSettingsTab apiClient={authedApi} title="Terms of Use" settingsKey="termsOfUseContent" />}
          {tab === 'dailyDigest' && <DailyDigestTab apiClient={authedApi} />}
          {tab === 'dailyQuiz' && <DailyQuizTab apiClient={authedApi} />}
          {tab === 'articles' && <ArticlesTab apiClient={authedApi} />}
          {tab === 'homeContent' && <HomeContentTab apiClient={authedApi} />}
          {tab === 'pollSettings' && <PollSettingsTab apiClient={authedApi} />}
          {tab === 'pushNotificationSettings' && <PushNotificationSettingsTab apiClient={authedApi} />}
          {tab === 'notificationScheduling' && <NotificationSchedulingTab apiClient={authedApi} />}
          {tab === 'publishScheduling' && <PublishSchedulingTab apiClient={authedApi} />}
          {tab === 'submitApplicationContent' && <SubmitApplicationContentTab apiClient={authedApi} />}
          {tab === 'instructionContent' && <InstructionContentTab apiClient={authedApi} />}
          {tab === 'examCategories' && <ExamCategoriesTab apiClient={authedApi} />}
          {tab === 'settings' && <SettingsTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
          {tab === 'auditLogs' && <AuditLogsTab apiClient={authedApi} />}
          {tab === 'users' && <UsersTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
          {tab === 'userManagementAdvanced' && <UserManagementAdvancedTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
        </main>
      </div>
    </div>
  );
}

function DashboardTab({ apiClient }: { apiClient: typeof api }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const values = data ? [data.users, data.attempts, data.tests, data.articles] : [0, 0, 0, 0];
  const max = Math.max(...values, 1);
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/summary');
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load dashboard');
    }
  }
  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Overview</h3>
        <button onClick={load}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="grid">
            <Stat title="Users" value={data.users} />
            <Stat title="Attempts" value={data.attempts} />
            <Stat title="Tests" value={data.tests} />
            <Stat title="Articles" value={data.articles} />
          </div>
          <div className="chart">
            <ChartBar label="Users" value={data.users} max={max} />
            <ChartBar label="Attempts" value={data.attempts} max={max} />
            <ChartBar label="Tests" value={data.tests} max={max} />
            <ChartBar label="Articles" value={data.articles} max={max} />
          </div>
        </>
      )}
    </section>
  );
}

function ChartBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = Math.max(4, Math.round((value / max) * 100));
  return (
    <div className="chart-row">
      <span>{label}</span>
      <div className="chart-track">
        <div className="chart-fill" style={{ width: `${percent}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat">
      <div>{title}</div>
      <strong>{value}</strong>
    </div>
  );
}

function AnalyticsInsightsTab({ apiClient }: { apiClient: typeof api }) {
  return <AnalyticsInsightsTabImpl apiClient={apiClient} />;
}

function LeaderboardTab() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [range, setRange] = useState<RangeKind>('weekly');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [query, setQuery] = useState('');
  async function load() {
    try {
      setError('');
      const res = await api.get('/leaderboard', { params: { range, city, state, limit: 80 } });
      setItems(res.data?.items || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load leaderboard');
    }
  }
  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.city || '').toLowerCase().includes(q) ||
      String(item.state || '').toLowerCase().includes(q)
    );
  });
  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Leaderboard Insights</h3>
      </div>
      <div className="inline-form">
        <select value={range} onChange={(e) => setRange(e.target.value as RangeKind)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="all">All</option>
        </select>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City filter" />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State filter" />
        <button onClick={load}>Load Leaderboard</button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in leaderboard" />
      {error && <p className="error">{error}</p>}
      <div className="list table leaderboard-table">
        <div className="row row-head">
          <span>Rank</span>
          <span>Name</span>
          <span>Score</span>
          <span>City</span>
          <span>State</span>
        </div>
        {filtered.map((item) => (
          <div key={item.userId} className="row">
            <span>#{item.rank}</span>
            <span>{item.name}</span>
            <span>{item.score}/500</span>
            <span>{item.city}</span>
            <span>{item.state}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TestsTab({
  apiClient,
  mode,
  selectedQuestionTestId,
  onSelectQuestionTest,
}: {
  apiClient: typeof api;
  mode: 'allTests' | 'questionBuilder';
  selectedQuestionTestId: string;
  onSelectQuestionTest: (testId: string) => void;
}) {
  const TESTS_PER_PAGE = 20;
  const QUESTIONS_PER_PAGE = 20;
  const [items, setItems] = useState<TestItem[]>([]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('180');
  const [questionCount, setQuestionCount] = useState('100');
  const [totalMarks, setTotalMarks] = useState('400');
  const [examDate, setExamDate] = useState('');
  const [slotLabel, setSlotLabel] = useState('');
  const [capacityTotal, setCapacityTotal] = useState('500');
  const [enrolledCount, setEnrolledCount] = useState('0');
  const [attemptsAllowed, setAttemptsAllowed] = useState('1');
  const [languageMode, setLanguageMode] = useState('Bilingual');
  const [examMode, setExamMode] = useState('Online CBT');
  const [negativeMarkingText, setNegativeMarkingText] = useState('Yes (-1)');
  const [testTypeLabel, setTestTypeLabel] = useState('Full Mock');
  const [validUntil, setValidUntil] = useState('');
  const [answerKeyReleaseAt, setAnswerKeyReleaseAt] = useState('');
  const [resultReleaseAt, setResultReleaseAt] = useState('');
  const [dynamicDateEnabled, setDynamicDateEnabled] = useState(false);
  const [dateCycleDays, setDateCycleDays] = useState('0');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [kind, setKind] = useState<TestKind>('mock');
  const [isPublished, setIsPublished] = useState(true);
  const [dynamicFluctuationOnPublish, setDynamicFluctuationOnPublish] = useState(true);
  const [error, setError] = useState('');
  const [selectedTest, setSelectedTest] = useState<TestItem | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionForm, setQuestionForm] = useState({
    position: '1',
    stem: '',
    choiceA: '',
    choiceB: '',
    choiceC: '',
    choiceD: '',
    correctIndex: '0',
    explanation: '',
  });
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [testsPage, setTestsPage] = useState(1);
  const [questionsPage, setQuestionsPage] = useState(1);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedQuestionTestId || !items.length) return;
    const match = items.find((item) => item.id === selectedQuestionTestId);
    if (match) {
      loadQuestions(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuestionTestId, items.length]);
  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/tests');
      const mapped = Array.isArray(res.data?.items)
        ? res.data.items.map((x: any) => ({
            ...x,
            dynamic_fluctuation_on_publish: normalizeBoolean(x.dynamic_fluctuation_on_publish, true),
            exam_date: x.exam_date || '',
            total_marks: Number(x.total_marks || 0),
            slot_label: String(x.slot_label || ''),
            capacity_total: Number(x.capacity_total || 0),
            enrolled_count: Number(x.enrolled_count || 0),
            attempts_allowed: Number(x.attempts_allowed || 1),
            language_mode: String(x.language_mode || 'Bilingual'),
            exam_mode: String(x.exam_mode || 'Practice'),
            negative_marking_text: String(x.negative_marking_text || 'No'),
            test_type_label: String(x.test_type_label || 'Full Mock'),
            valid_until: x.valid_until || '',
            answer_key_release_at: x.answer_key_release_at || '',
            result_release_at: x.result_release_at || '',
            dynamic_date_enabled: normalizeBoolean(x.dynamic_date_enabled, false),
            date_cycle_days: Number(x.date_cycle_days || 0),
          }))
        : [];
      setItems(mapped);
      setTestsPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load tests');
    }
  }
  async function createTest(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanSlug = slug.trim();
    if (!cleanTitle || !cleanSlug) {
      setError('Title and slug are required');
      return;
    }
    try {
      setError('');
      await apiClient.post('/admin/tests', {
        title: cleanTitle,
        slug: cleanSlug,
        subcategory: subcategory.trim(),
        durationMinutes: Number(durationMinutes || '180'),
        questionCount: Number(questionCount || '100'),
        totalMarks: Number(totalMarks || '0'),
        examDate: examDate.trim(),
        slotLabel: slotLabel.trim(),
        capacityTotal: Number(capacityTotal || '0'),
        enrolledCount: Number(enrolledCount || '0'),
        attemptsAllowed: Number(attemptsAllowed || '1'),
        languageMode: languageMode.trim() || 'Bilingual',
        examMode: examMode.trim() || 'Practice',
        negativeMarkingText: negativeMarkingText.trim() || 'No',
        testTypeLabel: testTypeLabel.trim() || 'Full Mock',
        validUntil: validUntil.trim(),
        answerKeyReleaseAt: answerKeyReleaseAt || null,
        resultReleaseAt: resultReleaseAt || null,
        dynamicDateEnabled,
        dateCycleDays: Number(dateCycleDays || '0'),
        testKind: kind,
        isPublished,
        dynamicFluctuationOnPublish,
      });
      setTitle('');
      setSlug('');
      setSubcategory('');
      setDurationMinutes('180');
      setQuestionCount('100');
      setTotalMarks('400');
      setExamDate('');
      setSlotLabel('');
      setCapacityTotal('500');
      setEnrolledCount('0');
      setAttemptsAllowed('1');
      setLanguageMode('Bilingual');
      setExamMode('Online CBT');
      setNegativeMarkingText('Yes (-1)');
      setTestTypeLabel('Full Mock');
      setValidUntil('');
      setAnswerKeyReleaseAt('');
      setResultReleaseAt('');
      setDynamicDateEnabled(false);
      setDateCycleDays('0');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create test');
    }
  }
  async function saveEdit(testId: string) {
    try {
      setError('');
      const current = items.find((x) => x.id === testId);
      if (!current) {
        setError('Selected test not found');
        return;
      }
      await apiClient.patch(`/admin/tests/${current.id}`, {
        title: current.title,
        slug: current.slug,
        subcategory: current.subcategory,
        metaLine: current.meta_line,
        durationMinutes: current.duration_minutes,
        questionCount: current.question_count,
        examDate: current.exam_date || '',
        totalMarks: current.total_marks || 0,
        slotLabel: current.slot_label || '',
        capacityTotal: current.capacity_total || 0,
        enrolledCount: current.enrolled_count || 0,
        attemptsAllowed: current.attempts_allowed || 1,
        languageMode: current.language_mode || 'Bilingual',
        examMode: current.exam_mode || 'Practice',
        negativeMarkingText: current.negative_marking_text || 'No',
        testTypeLabel: current.test_type_label || 'Full Mock',
        validUntil: current.valid_until || '',
        answerKeyReleaseAt: current.answer_key_release_at || null,
        resultReleaseAt: current.result_release_at || null,
        dynamicDateEnabled: normalizeBoolean(current.dynamic_date_enabled, false),
        dateCycleDays: current.date_cycle_days || 0,
        testKind: current.test_kind,
        isPublished: current.is_published,
        dynamicFluctuationOnPublish: normalizeBoolean(current.dynamic_fluctuation_on_publish, true),
      });
      setEditingId('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update test');
    }
  }

  async function deleteTest(id: string) {
    if (!window.confirm('Delete this test?')) return;
    try {
      setError('');
      await apiClient.delete(`/admin/tests/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete test');
    }
  }

  async function loadQuestions(test: TestItem) {
    try {
      setError('');
      setSelectedTest(test);
      onSelectQuestionTest(test.id);
      const res = await apiClient.get(`/admin/tests/${test.id}/questions`);
      setQuestions(res.data?.items || []);
      setQuestionsPage(1);
      setEditingQuestionId(null);
      setQuestionForm({
        position: '1',
        stem: '',
        choiceA: '',
        choiceB: '',
        choiceC: '',
        choiceD: '',
        correctIndex: '0',
        explanation: '',
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load questions');
    }
  }

  async function submitQuestion(e: FormEvent) {
    e.preventDefault();
    if (!selectedTest) {
      setError('Select a test first');
      return;
    }
    const position = Number(questionForm.position);
    const stem = questionForm.stem.trim();
    const choiceA = questionForm.choiceA.trim();
    const choiceB = questionForm.choiceB.trim();
    const choiceC = questionForm.choiceC.trim();
    const choiceD = questionForm.choiceD.trim();
    const correctIndex = Number(questionForm.correctIndex);
    const explanation = questionForm.explanation.trim();
    if (!Number.isInteger(position) || position <= 0) {
      setError('Position must be a positive integer');
      return;
    }
    if (!stem) {
      setError('Question statement is required');
      return;
    }
    if (!choiceA || !choiceB || !choiceC || !choiceD) {
      setError('All four options are required');
      return;
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      setError('Please select a valid correct answer');
      return;
    }
    const payload = {
      position,
      stem,
      choiceA,
      choiceB,
      choiceC,
      choiceD,
      correctIndex,
      explanation,
    };
    try {
      setError('');
      if (editingQuestionId) {
        await apiClient.patch(`/admin/tests/${selectedTest.id}/questions/${editingQuestionId}`, payload);
      } else {
        await apiClient.post(`/admin/tests/${selectedTest.id}/questions`, payload);
      }
      await loadQuestions(selectedTest);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save question');
    }
  }

  function startEditQuestion(item: QuestionItem) {
    if (item.id < 0) return;
    setShowQuestionForm(true);
    setEditingQuestionId(item.id);
    setQuestionForm({
      position: String(item.position),
      stem: item.stem,
      choiceA: item.choice_a,
      choiceB: item.choice_b,
      choiceC: item.choice_c,
      choiceD: item.choice_d,
      correctIndex: String(item.correct_index),
      explanation: item.explanation || '',
    });
  }

  async function deleteQuestion(questionId: number) {
    if (questionId < 0) return;
    if (!selectedTest) return;
    if (!window.confirm('Delete this question?')) return;
    try {
      setError('');
      await apiClient.delete(`/admin/tests/${selectedTest.id}/questions/${questionId}`);
      await loadQuestions(selectedTest);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete question');
    }
  }
  const displayedQuestions = questions;

  const visibleItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q);
  });
  const totalTestsPages = Math.max(1, Math.ceil(visibleItems.length / TESTS_PER_PAGE));
  const safeTestsPage = Math.min(testsPage, totalTestsPages);
  const pagedVisibleItems = useMemo(() => {
    const start = (safeTestsPage - 1) * TESTS_PER_PAGE;
    return visibleItems.slice(start, start + TESTS_PER_PAGE);
  }, [safeTestsPage, visibleItems]);

  const totalQuestionsPages = Math.max(1, Math.ceil(displayedQuestions.length / QUESTIONS_PER_PAGE));
  const safeQuestionsPage = Math.min(questionsPage, totalQuestionsPages);
  const pagedQuestions = useMemo(() => {
    const start = (safeQuestionsPage - 1) * QUESTIONS_PER_PAGE;
    return displayedQuestions.slice(start, start + QUESTIONS_PER_PAGE);
  }, [displayedQuestions, safeQuestionsPage]);

  return (
    <section className={`panel-card ${mode === 'allTests' ? 'all-tests-panel' : ''}`}>
      <div className="panel-head">
        <h3>{mode === 'allTests' ? 'Manage All Tests' : 'Manage Questions'}</h3>
      </div>
      {mode === 'allTests' && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Home category mapping tip: keep the same <b>Subcategory</b> for related exams (e.g. Patwari), and keep each
            <b> Test title</b> unique (e.g. Patwari - HP, Patwari - Punjab) so users can choose the correct exam.
          </p>
          <form onSubmit={createTest} className="all-tests-create">
            <div className="all-tests-section">
              <h4>Basic</h4>
              <div className="all-tests-grid">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Test title" required />
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="test-slug" required />
                <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Subcategory" />
                <select value={kind} onChange={(e) => setKind(e.target.value as TestKind)}>
                  <option value="mock">Mock</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
            </div>

            <div className="all-tests-section">
              <h4>Schedule & Stats</h4>
              <div className="all-tests-grid">
                <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                <input
                  type="datetime-local"
                  value={answerKeyReleaseAt}
                  onChange={(e) => setAnswerKeyReleaseAt(e.target.value)}
                  placeholder="Answer key release"
                />
                <input
                  type="datetime-local"
                  value={resultReleaseAt}
                  onChange={(e) => setResultReleaseAt(e.target.value)}
                  placeholder="Result release"
                />
                <input value={slotLabel} onChange={(e) => setSlotLabel(e.target.value)} placeholder="Slot label (e.g. Morning)" />
                <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="Duration (minutes)" />
                <input type="number" value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} placeholder="Question count" />
                <input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} placeholder="Total marks" />
              </div>
            </div>

            <div className="all-tests-section">
              <h4>Capacity & Rules</h4>
              <div className="all-tests-grid">
                <input type="number" value={capacityTotal} onChange={(e) => setCapacityTotal(e.target.value)} placeholder="Capacity (e.g. 500)" />
                <input
                  type="number"
                  value={enrolledCount}
                  onChange={(e) => setEnrolledCount(e.target.value)}
                  placeholder="Enrolled count (auto)"
                  readOnly
                  title="Auto-managed from user applications"
                />
                <input type="number" value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(e.target.value)} placeholder="Attempts allowed" />
                <input value={languageMode} onChange={(e) => setLanguageMode(e.target.value)} placeholder="Language mode" />
                <input value={examMode} onChange={(e) => setExamMode(e.target.value)} placeholder="Exam mode" />
                <input value={negativeMarkingText} onChange={(e) => setNegativeMarkingText(e.target.value)} placeholder="Negative marking" />
                <input value={testTypeLabel} onChange={(e) => setTestTypeLabel(e.target.value)} placeholder="Test type label" />
              </div>
            </div>

            <div className="all-tests-actions">
              <label className="check-wrap">
                <input type="checkbox" checked={dynamicDateEnabled} onChange={(e) => setDynamicDateEnabled(e.target.checked)} />
                dynamic date
              </label>
              <input type="number" value={dateCycleDays} onChange={(e) => setDateCycleDays(e.target.value)} placeholder="Date cycle days" />
              <label className="check-wrap">
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                published
              </label>
              <label className="check-wrap">
                <input
                  type="checkbox"
                  checked={dynamicFluctuationOnPublish}
                  onChange={(e) => setDynamicFluctuationOnPublish(e.target.checked)}
                />
                dynamic fluctuation
              </label>
              <button type="submit">Add Test</button>
            </div>
          </form>
          <div className="inline-form all-tests-tools">
            <button type="button" className="all-tests-refresh" onClick={load}>
              Refresh Tests
            </button>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setTestsPage(1);
              }}
              placeholder="Search tests..."
            />
          </div>
        </>
      )}

      {mode === 'questionBuilder' && (
        <div className="inline-form">
          <select
            value={selectedTest?.id || ''}
            onChange={(e) => {
              const test = items.find((x) => x.id === e.target.value);
              if (test) loadQuestions(test);
            }}
          >
            <option value="">Select Test</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.test_kind})
              </option>
            ))}
          </select>
          <button onClick={load}>Refresh Tests</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {mode === 'allTests' && (
        <>
          <div className="list table tests-table">
            <div className="row row-head">
              <span>Title</span>
              <span>Slug</span>
              <span>Type</span>
              <span>Status</span>
              <span>Fluctuation</span>
              <span>Actions</span>
              <span />
            </div>
            {pagedVisibleItems.map((item) => (
              <div key={item.id} className="row">
                {editingId === item.id ? (
                  <>
                    <div>
                      <input
                        value={item.title}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))}
                      />
                      <input
                        value={item.subcategory || ''}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, subcategory: e.target.value } : x)))}
                        placeholder="subcategory"
                      />
                      <input
                        type="date"
                        value={item.exam_date || ''}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, exam_date: e.target.value } : x)))}
                      />
                      <input
                        type="date"
                        value={item.valid_until || ''}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, valid_until: e.target.value } : x)))}
                      />
                      <input
                        type="datetime-local"
                        value={toDateTimeLocal(item.answer_key_release_at)}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, answer_key_release_at: e.target.value } : x)))
                        }
                      />
                      <input
                        type="datetime-local"
                        value={toDateTimeLocal(item.result_release_at)}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, result_release_at: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div>
                      <input
                        value={item.slug}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, slug: e.target.value } : x)))}
                      />
                      <input
                        value={item.slot_label || ''}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, slot_label: e.target.value } : x)))}
                        placeholder="slot label"
                      />
                      <input
                        value={item.language_mode || ''}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, language_mode: e.target.value } : x)))}
                        placeholder="language"
                      />
                      <input
                        value={item.exam_mode || ''}
                        onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, exam_mode: e.target.value } : x)))}
                        placeholder="mode"
                      />
                    </div>
                    <div>
                      <select
                        value={item.test_kind}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, test_kind: e.target.value as TestKind } : x)))
                        }
                      >
                        <option value="mock">mock</option>
                        <option value="quiz">quiz</option>
                      </select>
                      <input
                        type="number"
                        value={item.duration_minutes ?? 0}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, duration_minutes: Number(e.target.value || 0) } : x)))
                        }
                        placeholder="duration"
                      />
                      <input
                        type="number"
                        value={item.question_count ?? 0}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, question_count: Number(e.target.value || 0) } : x)))
                        }
                        placeholder="questions"
                      />
                      <input
                        type="number"
                        value={item.total_marks ?? 0}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, total_marks: Number(e.target.value || 0) } : x)))
                        }
                        placeholder="marks"
                      />
                    </div>
                    <label className="check-wrap">
                      <input
                        type="checkbox"
                        checked={item.is_published}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, is_published: e.target.checked } : x)))
                        }
                      />
                      published
                    </label>
                    <label className="check-wrap">
                      <input
                        type="checkbox"
                        checked={item.dynamic_fluctuation_on_publish}
                        onChange={(e) =>
                          setItems((p) =>
                            p.map((x) =>
                              x.id === item.id ? { ...x, dynamic_fluctuation_on_publish: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      fluctuation
                    </label>
                    <div>
                      <input
                        type="number"
                        value={item.capacity_total ?? 0}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, capacity_total: Number(e.target.value || 0) } : x)))
                        }
                        placeholder="capacity"
                      />
                      <input
                        type="number"
                        value={item.enrolled_count ?? 0}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, enrolled_count: Number(e.target.value || 0) } : x)))
                        }
                        placeholder="enrolled"
                      />
                      <input
                        type="number"
                        value={item.attempts_allowed ?? 1}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, attempts_allowed: Number(e.target.value || 1) } : x)))
                        }
                        placeholder="attempts"
                      />
                      <input
                        value={item.negative_marking_text || ''}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, negative_marking_text: e.target.value } : x)))
                        }
                        placeholder="negative marking"
                      />
                      <input
                        value={item.test_type_label || ''}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, test_type_label: e.target.value } : x)))
                        }
                        placeholder="test type"
                      />
                      <label className="check-wrap">
                        <input
                          type="checkbox"
                          checked={normalizeBoolean(item.dynamic_date_enabled, false)}
                          onChange={(e) =>
                            setItems((p) => p.map((x) => (x.id === item.id ? { ...x, dynamic_date_enabled: e.target.checked } : x)))
                          }
                        />
                        dynamic date
                      </label>
                      <input
                        type="number"
                        value={item.date_cycle_days ?? 0}
                        onChange={(e) =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, date_cycle_days: Number(e.target.value || 0) } : x)))
                        }
                        placeholder="cycle days"
                      />
                    </div>
                    <button onClick={() => saveEdit(item.id)}>Save</button>
                    <button className="ghost" onClick={() => setEditingId('')}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span>{item.title}<br />{item.subcategory || '-'}</span>
                    <span>{item.slug}<br />{item.exam_date || '-'}</span>
                    <span>{item.test_kind}<br />{item.duration_minutes} min · {item.question_count} Q</span>
                    <span>{item.is_published ? 'Published' : 'Hidden'}<br />{item.enrolled_count || 0}/{item.capacity_total || 0}</span>
                    <span>{item.dynamic_fluctuation_on_publish ? 'Fluctuation: On' : 'Fluctuation: Off'}<br />{item.dynamic_date_enabled ? `Date: On (${item.date_cycle_days || 0}d)` : 'Date: Off'}</span>
                    <button onClick={() => setEditingId(item.id)}>Edit</button>
                    <div className="inline-form">
                      <button onClick={() => loadQuestions(item)}>Open Builder</button>
                      <button className="danger" onClick={() => deleteTest(item.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="pagination-wrap">
            <span>
              Page {safeTestsPage} of {totalTestsPages}
            </span>
            <div className="inline-form pagination-controls">
              <button type="button" className="ghost" onClick={() => setTestsPage((p) => Math.max(1, p - 1))} disabled={safeTestsPage === 1}>
                Previous
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setTestsPage((p) => Math.min(totalTestsPages, p + 1))}
                disabled={safeTestsPage === totalTestsPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'questionBuilder' && (
        <div className="question-builder">
          <div className="panel-head">
            <div>
              <h3>Question Builder</h3>
              <span>{selectedTest ? `Selected: ${selectedTest.title}` : ''}</span>
            </div>
          </div>
          <div className="qb-create-card">
            <button
              type="button"
              className="qb-create-toggle"
              onClick={() => setShowQuestionForm((p) => !p)}
            >
              <span className="qb-create-label">Create New Question</span>
              <span className="qb-toggle-icon" aria-hidden="true">
                {showQuestionForm ? 'x' : '+'}
              </span>
            </button>

            {showQuestionForm && (
              <form onSubmit={submitQuestion} className="question-form">
                <label>
                  Target Category / Test
                  <select
                    value={selectedTest?.id || ''}
                    onChange={(e) => {
                      const test = items.find((x) => x.id === e.target.value);
                      if (test) loadQuestions(test);
                    }}
                    required
                  >
                    <option value="">Select Test</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.test_kind})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Position
                  <input
                    type="number"
                    min={1}
                    value={questionForm.position}
                    onChange={(e) => setQuestionForm((p) => ({ ...p, position: e.target.value }))}
                    placeholder="1"
                    required
                  />
                </label>
                <label>
                  Question Statement
                  <textarea
                    value={questionForm.stem}
                    onChange={(e) => setQuestionForm((p) => ({ ...p, stem: e.target.value }))}
                    placeholder="Write your question here..."
                    required
                  />
                </label>
                <div className="qb-option-grid">
                  <label>
                    <span className="qb-option-label">A</span>
                    <input
                      value={questionForm.choiceA}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceA: e.target.value }))}
                      placeholder="Option A"
                      required
                    />
                  </label>
                  <label>
                    <span className="qb-option-label">B</span>
                    <input
                      value={questionForm.choiceB}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceB: e.target.value }))}
                      placeholder="Option B"
                      required
                    />
                  </label>
                  <label>
                    <span className="qb-option-label">C</span>
                    <input
                      value={questionForm.choiceC}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceC: e.target.value }))}
                      placeholder="Option C"
                      required
                    />
                  </label>
                  <label>
                    <span className="qb-option-label">D</span>
                    <input
                      value={questionForm.choiceD}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceD: e.target.value }))}
                      placeholder="Option D"
                      required
                    />
                  </label>
                </div>
                <div className="qb-form-bottom">
                  <label>
                    Correct Answer
                    <select
                      value={questionForm.correctIndex}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, correctIndex: e.target.value }))}
                    >
                      <option value="0">Option A</option>
                      <option value="1">Option B</option>
                      <option value="2">Option C</option>
                      <option value="3">Option D</option>
                    </select>
                  </label>
                  <label>
                    Explanation (Optional)
                    <textarea
                      value={questionForm.explanation}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, explanation: e.target.value }))}
                      placeholder="Explanation"
                    />
                  </label>
                  <div className="inline-form">
                    <button type="submit" disabled={!selectedTest}>
                      {editingQuestionId ? 'Update Question' : 'Add to Question Bank'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingQuestionId(null);
                        setQuestionForm({
                          position: '1',
                          stem: '',
                          choiceA: '',
                          choiceB: '',
                          choiceC: '',
                          choiceD: '',
                          correctIndex: '0',
                          explanation: '',
                        });
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

        <div className="list table questions-table">
          <div className="row row-head">
            <span>Pos</span>
            <span>Question</span>
            <span>Answer</span>
            <span>Option A</span>
            <span>Option B</span>
            <span>Option C</span>
            <span>Option D</span>
            <span>Action</span>
          </div>
          {pagedQuestions.map((q) => (
            <div key={q.id} className="row">
              <span>{q.position}</span>
              <span>{q.stem}</span>
              <span>{['A', 'B', 'C', 'D'][q.correct_index] || '-'}</span>
              <span>{q.choice_a}</span>
              <span>{q.choice_b}</span>
              <span>{q.choice_c}</span>
              <span>{q.choice_d}</span>
              <div className="inline-form qb-action-buttons">
                <button type="button" title={q.id < 0 ? 'Demo entry' : 'Edit'} aria-label={q.id < 0 ? 'Demo entry' : 'Edit'} onClick={() => startEditQuestion(q)} disabled={q.id < 0}>
                  <span aria-hidden="true">✎</span>
                </button>
                <button type="button" className="danger" title={q.id < 0 ? 'Demo entry' : 'Delete'} aria-label={q.id < 0 ? 'Demo entry' : 'Delete'} onClick={() => deleteQuestion(q.id)} disabled={q.id < 0}>
                  <span aria-hidden="true">🗑</span>
                </button>
              </div>
            </div>
          ))}
          {!pagedQuestions.length && (
            <div className="row">
              <span>-</span>
              <span>{selectedTest ? 'No questions found for this test yet.' : 'Select a test to view questions.'}</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </div>
          )}
        </div>
        <div className="pagination-wrap">
          <span>
            Page {safeQuestionsPage} of {totalQuestionsPages}
          </span>
          <div className="inline-form pagination-controls">
            <button
              type="button"
              className="ghost"
              onClick={() => setQuestionsPage((p) => Math.max(1, p - 1))}
              disabled={safeQuestionsPage === 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setQuestionsPage((p) => Math.min(totalQuestionsPages, p + 1))}
              disabled={safeQuestionsPage === totalQuestionsPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}

function DailyDigestTab({ apiClient }: { apiClient: typeof api }) {
  const [items, setItems] = useState<DailyDigestItem[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctIndex, setCorrectIndex] = useState('0');
  const [factText, setFactText] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [dailyReleaseHour, setDailyReleaseHour] = useState('10');
  const [dailyReleaseMinute, setDailyReleaseMinute] = useState('0');
  const [dailyTimezoneOffset, setDailyTimezoneOffset] = useState('330');

  async function load() {
    try {
      setError('');
      const [digestRes, settingsRes] = await Promise.all([
        apiClient.get('/admin/digest'),
        apiClient.get('/admin/settings'),
      ]);
      setItems(digestRes.data?.items || []);
      const schedule = settingsRes.data?.settings?.dailyQuizSettings || {};
      setDailyReleaseHour(String(Math.max(0, Math.min(23, Number(schedule.releaseHour ?? 10)))));
      setDailyReleaseMinute(String(Math.max(0, Math.min(59, Number(schedule.releaseMinute ?? 0)))));
      setDailyTimezoneOffset(String(Math.max(-720, Math.min(840, Number(schedule.timezoneOffsetMinutes ?? 330)))));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load daily digest items');
    }
  }
  async function saveDailySchedule() {
    try {
      setError('');
      await apiClient.patch('/admin/settings', {
        dailyQuizSettings: {
          releaseHour: Number(dailyReleaseHour || '10'),
          releaseMinute: Number(dailyReleaseMinute || '0'),
          timezoneOffsetMinutes: Number(dailyTimezoneOffset || '330'),
        },
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save daily quiz schedule');
    }
  }
  async function createDigestItem(e: FormEvent) {
    e.preventDefault();
    try {
      setError('');
      await apiClient.post('/admin/digest', {
        questionPrompt,
        optionA,
        optionB,
        optionC,
        optionD,
        correctIndex: Number(correctIndex),
        factText,
        isPublished,
      });
      setQuestionPrompt('');
      setOptionA('');
      setOptionB('');
      setOptionC('');
      setOptionD('');
      setCorrectIndex('0');
      setFactText('');
      setIsPublished(true);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create daily digest item');
    }
  }
  async function saveDigestItem(item: DailyDigestItem) {
    try {
      setError('');
      await apiClient.patch(`/admin/digest/${item.id}`, {
        questionPrompt: item.question_prompt,
        optionA: item.option_a,
        optionB: item.option_b,
        optionC: item.option_c,
        optionD: item.option_d,
        correctIndex: item.correct_index,
        factText: item.fact_text,
        isPublished: item.is_published,
      });
      setEditingId('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update daily digest item');
    }
  }

  async function deleteDigestItem(id: string) {
    if (!window.confirm('Delete this daily digest item?')) return;
    try {
      setError('');
      await apiClient.delete(`/admin/digest/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete daily digest item');
    }
  }

  const visibleItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.question_prompt.toLowerCase().includes(q) || item.fact_text.toLowerCase().includes(q);
  });

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Daily Digest (Question of the Day + Fact of the Day)</h3>
      </div>
      <form onSubmit={createDigestItem} className="question-form">
        <input value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} placeholder="Question prompt" required />
        <input value={optionA} onChange={(e) => setOptionA(e.target.value)} placeholder="Option A" required />
        <input value={optionB} onChange={(e) => setOptionB(e.target.value)} placeholder="Option B" required />
        <input value={optionC} onChange={(e) => setOptionC(e.target.value)} placeholder="Option C" required />
        <input value={optionD} onChange={(e) => setOptionD(e.target.value)} placeholder="Option D" required />
        <select value={correctIndex} onChange={(e) => setCorrectIndex(e.target.value)}>
          <option value="0">Correct: A</option>
          <option value="1">Correct: B</option>
          <option value="2">Correct: C</option>
          <option value="3">Correct: D</option>
        </select>
        <input value={factText} onChange={(e) => setFactText(e.target.value)} placeholder="Fact of the day" required />
        <label className="check-wrap">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          published
        </label>
        <div className="inline-form">
          <button type="submit">Add Digest Item</button>
        </div>
      </form>
      <div className="inline-form" style={{ marginBottom: 8 }}>
        <input
          type="number"
          min={0}
          max={23}
          value={dailyReleaseHour}
          onChange={(e) => setDailyReleaseHour(e.target.value)}
          placeholder="Release hour (0-23)"
        />
        <input
          type="number"
          min={0}
          max={59}
          value={dailyReleaseMinute}
          onChange={(e) => setDailyReleaseMinute(e.target.value)}
          placeholder="Release minute (0-59)"
        />
        <input
          type="number"
          min={-720}
          max={840}
          value={dailyTimezoneOffset}
          onChange={(e) => setDailyTimezoneOffset(e.target.value)}
          placeholder="Timezone offset minutes (IST=330)"
        />
        <button type="button" onClick={saveDailySchedule}>Save Daily Quiz Time</button>
      </div>
      <button onClick={load}>Refresh Digest Items</button>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search digest items" />
      {error && <p className="error">{error}</p>}
      <div className="list table questions-table">
        <div className="row row-head">
          <span>Q</span>
          <span>Question</span>
          <span>Answer</span>
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>Action</span>
        </div>
        {visibleItems.map((item) => (
          <div key={item.id} className="row">
            {editingId === item.id ? (
              <>
                <input
                  value={item.question_prompt}
                  onChange={(e) =>
                    setItems((p) => p.map((x) => (x.id === item.id ? { ...x, question_prompt: e.target.value } : x)))
                  }
                />
                <input
                  value={item.option_a}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_a: e.target.value } : x)))}
                />
                <input
                  value={item.option_b}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_b: e.target.value } : x)))}
                />
                <input
                  value={item.option_c}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_c: e.target.value } : x)))}
                />
                <input
                  value={item.option_d}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_d: e.target.value } : x)))}
                />
                <select
                  value={String(item.correct_index)}
                  onChange={(e) =>
                    setItems((p) =>
                      p.map((x) => (x.id === item.id ? { ...x, correct_index: Number(e.target.value) } : x)),
                    )
                  }
                >
                  <option value="0">A</option>
                  <option value="1">B</option>
                  <option value="2">C</option>
                  <option value="3">D</option>
                </select>
                <div className="inline-form">
                  <button onClick={() => saveDigestItem(item)}>Save</button>
                  <button className="ghost" onClick={() => setEditingId('')}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <span title={item.fact_text}>{item.question_prompt.slice(0, 20)}</span>
                <span>{item.question_prompt}</span>
                <span>{['A', 'B', 'C', 'D'][item.correct_index]}</span>
                <span>{item.option_a}</span>
                <span>{item.option_b}</span>
                <span>{item.option_c}</span>
                <span>{item.option_d}</span>
                <div className="inline-form">
                  <button onClick={() => setEditingId(item.id)}>Edit</button>
                  <button className="danger" onClick={() => deleteDigestItem(item.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="list table users-table">
        <div className="row row-head">
          <span>Question</span>
          <span>Fact Of The Day</span>
          <span>Status</span>
          <span>Action</span>
          <span>Status</span>
          <span>Toggle</span>
        </div>
        {visibleItems.map((item) => (
          <div key={item.id} className="row">
            <span>{item.question_prompt.slice(0, 40)}</span>
            <span>{item.fact_text.slice(0, 70)}</span>
            <span>{item.is_published ? 'Published' : 'Hidden'}</span>
            <button onClick={() => setEditingId(item.id)}>Edit Question</button>
            <span>{item.is_published ? 'Published' : 'Hidden'}</span>
            <button
              onClick={async () => {
                try {
                  setError('');
                  await apiClient.patch(`/admin/digest/${item.id}`, {
                    questionPrompt: item.question_prompt,
                    optionA: item.option_a,
                    optionB: item.option_b,
                    optionC: item.option_c,
                    optionD: item.option_d,
                    correctIndex: item.correct_index,
                    factText: item.fact_text,
                    isPublished: !item.is_published,
                  });
                  await load();
                } catch (err: any) {
                  setError(err?.response?.data?.error || 'Failed to update publish status');
                }
              }}
            >
              {item.is_published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function DailyQuizTab({ apiClient }: { apiClient: typeof api }) {
  const [items, setItems] = useState<DailyQuizItem[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctIndex, setCorrectIndex] = useState('0');
  const [explanation, setExplanation] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/daily-quiz');
      setItems(res.data?.items || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load daily quiz items');
    }
  }

  async function createDailyQuizItem(e: FormEvent) {
    e.preventDefault();
    try {
      setError('');
      await apiClient.post('/admin/daily-quiz', {
        questionPrompt,
        optionA,
        optionB,
        optionC,
        optionD,
        correctIndex: Number(correctIndex),
        explanation,
        isPublished,
      });
      setQuestionPrompt('');
      setOptionA('');
      setOptionB('');
      setOptionC('');
      setOptionD('');
      setCorrectIndex('0');
      setExplanation('');
      setIsPublished(true);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create daily quiz item');
    }
  }

  async function saveDailyQuizItem(item: DailyQuizItem) {
    try {
      setError('');
      await apiClient.patch(`/admin/daily-quiz/${item.id}`, {
        questionPrompt: item.questionPrompt,
        optionA: item.optionA,
        optionB: item.optionB,
        optionC: item.optionC,
        optionD: item.optionD,
        correctIndex: item.correctIndex,
        explanation: item.explanation,
        isPublished: item.isPublished,
      });
      setEditingId('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update daily quiz item');
    }
  }

  async function deleteDailyQuizItem(id: string) {
    if (!window.confirm('Delete this daily quiz item?')) return;
    try {
      setError('');
      await apiClient.delete(`/admin/daily-quiz/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete daily quiz item');
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Daily Quiz (separate from Daily Digest)</h3>
      </div>
      <form onSubmit={createDailyQuizItem} className="question-form">
        <input value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} placeholder="Quiz question prompt" required />
        <input value={optionA} onChange={(e) => setOptionA(e.target.value)} placeholder="Option A" required />
        <input value={optionB} onChange={(e) => setOptionB(e.target.value)} placeholder="Option B" required />
        <input value={optionC} onChange={(e) => setOptionC(e.target.value)} placeholder="Option C" required />
        <input value={optionD} onChange={(e) => setOptionD(e.target.value)} placeholder="Option D" required />
        <select value={correctIndex} onChange={(e) => setCorrectIndex(e.target.value)}>
          <option value="0">Correct: A</option>
          <option value="1">Correct: B</option>
          <option value="2">Correct: C</option>
          <option value="3">Correct: D</option>
        </select>
        <input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explanation (optional)" />
        <label className="check-wrap">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          published
        </label>
        <div className="inline-form">
          <button type="submit">Add Daily Quiz Item</button>
        </div>
      </form>
      <div className="inline-form">
        <button onClick={load}>Refresh Daily Quiz Items</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="list table tests-table">
        <div className="row row-head">
          <span>Question</span>
          <span>Correct</span>
          <span>Published</span>
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>Action</span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="row">
            {editingId === item.id ? (
              <>
                <input
                  value={item.questionPrompt}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, questionPrompt: e.target.value } : x)))}
                />
                <select
                  value={String(item.correctIndex)}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, correctIndex: Number(e.target.value) } : x)))}
                >
                  <option value="0">A</option>
                  <option value="1">B</option>
                  <option value="2">C</option>
                  <option value="3">D</option>
                </select>
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={item.isPublished}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, isPublished: e.target.checked } : x)))}
                  />
                  published
                </label>
                <input value={item.optionA} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionA: e.target.value } : x)))} />
                <input value={item.optionB} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionB: e.target.value } : x)))} />
                <input value={item.optionC} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionC: e.target.value } : x)))} />
                <input value={item.optionD} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionD: e.target.value } : x)))} />
                <div className="inline-form">
                  <button onClick={() => saveDailyQuizItem(item)}>Save</button>
                  <button className="ghost" onClick={() => setEditingId('')}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <span>{item.questionPrompt}</span>
                <span>{['A', 'B', 'C', 'D'][item.correctIndex]}</span>
                <span>{item.isPublished ? 'Published' : 'Hidden'}</span>
                <span>{item.optionA}</span>
                <span>{item.optionB}</span>
                <span>{item.optionC}</span>
                <span>{item.optionD}</span>
                <div className="inline-form">
                  <button onClick={() => setEditingId(item.id)}>Edit</button>
                  <button className="danger" onClick={() => deleteDailyQuizItem(item.id)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="list table users-table">
        <div className="row row-head">
          <span>Question</span>
          <span>Explanation</span>
          <span>Status</span>
          <span>Toggle</span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="row">
            <span>{item.questionPrompt.slice(0, 60)}</span>
            <span>{item.explanation.slice(0, 80)}</span>
            <span>{item.isPublished ? 'Published' : 'Hidden'}</span>
            <button
              onClick={async () => {
                try {
                  setError('');
                  await apiClient.patch(`/admin/daily-quiz/${item.id}`, { ...item, isPublished: !item.isPublished });
                  await load();
                } catch (err: any) {
                  setError(err?.response?.data?.error || 'Failed to update daily quiz publish status');
                }
              }}
            >
              {item.isPublished ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArticlesTab({ apiClient }: { apiClient: typeof api }) {
  const ARTICLES_PER_PAGE = 20;
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [feedKind, setFeedKind] = useState<'news' | 'job' | 'exam'>('news');
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [showArticleForm, setShowArticleForm] = useState(false);
  const [articlesPage, setArticlesPage] = useState(1);

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/articles');
      setItems(res.data?.items || []);
      setArticlesPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load articles');
    }
  }

  async function createArticle(e: FormEvent) {
    e.preventDefault();
    try {
      setError('');
      await apiClient.post('/admin/articles', {
        feedKind,
        headline,
        summary,
        category,
        body,
        linkUrl,
        isPublished,
      });
      setHeadline('');
      setSummary('');
      setCategory('');
      setBody('');
      setLinkUrl('');
      setIsPublished(true);
      setShowArticleForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create article');
    }
  }

  async function saveArticle(item: ArticleItem) {
    try {
      setError('');
      await apiClient.patch(`/admin/articles/${item.id}`, {
        feedKind: item.feed_kind,
        headline: item.headline,
        summary: item.summary,
        category: item.category,
        body: item.body,
        linkUrl: item.link_url,
        isPublished: item.is_published,
      });
      setEditingId('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update article');
    }
  }

  async function deleteArticle(id: string) {
    if (!window.confirm('Delete this article?')) return;
    try {
      setError('');
      await apiClient.delete(`/admin/articles/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete article');
    }
  }

  const visibleItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.headline.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });
  const totalArticlesPages = Math.max(1, Math.ceil(visibleItems.length / ARTICLES_PER_PAGE));
  const safeArticlesPage = Math.min(articlesPage, totalArticlesPages);
  const pagedArticles = useMemo(() => {
    const start = (safeArticlesPage - 1) * ARTICLES_PER_PAGE;
    return visibleItems.slice(start, start + ARTICLES_PER_PAGE);
  }, [safeArticlesPage, visibleItems]);

  return (
    <section className="panel-card articles-panel">
      <div className="panel-head">
        <h3>Articles</h3>
      </div>
      <div className="article-create-card">
        <button type="button" className="article-create-toggle" onClick={() => setShowArticleForm((p) => !p)}>
          <span className="article-create-label">Articles Control</span>
          <span className="article-toggle-icon" aria-hidden="true">
            {showArticleForm ? 'x' : '+'}
          </span>
        </button>
        {showArticleForm && (
          <form onSubmit={createArticle} className="article-form">
            <label>
              Content Type
              <select value={feedKind} onChange={(e) => setFeedKind(e.target.value as 'news' | 'job' | 'exam')}>
                <option value="news">News</option>
                <option value="job">Job</option>
                <option value="exam">Exam</option>
              </select>
            </label>
            <label>
              Headline
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Enter headline" required />
            </label>
            <label>
              Category
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Medical" />
            </label>
            <label>
              Link URL
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="URL here" />
            </label>
            <label>
              Summary
              <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Brief summary" />
            </label>
            <label>
              Article Body
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write main content..." />
            </label>
            <div className="inline-form article-form-actions">
              <label className="check-wrap">
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                published
              </label>
              <button type="submit">Add Article</button>
            </div>
          </form>
        )}
      </div>
      <div className="inline-form articles-tools">
        <button type="button" className="all-tests-refresh" onClick={load}>
          Refresh Articles
        </button>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setArticlesPage(1);
          }}
          placeholder="Search articles..."
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="list table articles-table">
        <div className="row row-head">
          <span>Type</span>
          <span>Headline</span>
          <span>Category</span>
          <span>Status</span>
          <span>Actions</span>
          <span />
        </div>
        {pagedArticles.map((item) => (
          <div key={item.id} className="row">
            {editingId === item.id ? (
              <>
                <select
                  value={item.feed_kind}
                  onChange={(e) =>
                    setItems((p) => p.map((x) => (x.id === item.id ? { ...x, feed_kind: e.target.value as 'news' | 'job' | 'exam' } : x)))
                  }
                >
                  <option value="news">news</option>
                  <option value="job">job</option>
                  <option value="exam">exam</option>
                </select>
                <input
                  value={item.headline}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, headline: e.target.value } : x)))}
                />
                <input
                  value={item.category}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, category: e.target.value } : x)))}
                />
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={item.is_published}
                    onChange={(e) =>
                      setItems((p) => p.map((x) => (x.id === item.id ? { ...x, is_published: e.target.checked } : x)))
                    }
                  />
                  published
                </label>
                <button onClick={() => saveArticle(item)}>Save</button>
                <button className="danger" onClick={() => deleteArticle(item.id)}>
                  Delete
                </button>
              </>
            ) : (
              <>
                <span>{item.feed_kind}</span>
                <span title={item.summary || item.body}>{item.headline}</span>
                <span>{item.category || '-'}</span>
                <span>{item.is_published ? 'Published' : 'Hidden'}</span>
                <button title="Edit" aria-label="Edit" onClick={() => setEditingId(item.id)}>
                  <span aria-hidden="true">✎</span>
                </button>
                <button className="danger" title="Delete" aria-label="Delete" onClick={() => deleteArticle(item.id)}>
                  <span aria-hidden="true">🗑</span>
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safeArticlesPage} of {totalArticlesPages}
        </span>
        <div className="inline-form pagination-controls">
          <button
            type="button"
            className="ghost"
            onClick={() => setArticlesPage((p) => Math.max(1, p - 1))}
            disabled={safeArticlesPage === 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setArticlesPage((p) => Math.min(totalArticlesPages, p + 1))}
            disabled={safeArticlesPage === totalArticlesPages}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}


const DEFAULT_PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  { id: 'edit-username', title: 'Username', subtitle: '{value}', path: '/edit-username', enabled: true },
  { id: 'edit-email', title: 'Email', subtitle: '{value}', path: '/edit-email', enabled: true },
  { id: 'edit-mobile', title: 'Mobile number', subtitle: '{value}', path: '/edit-mobile', enabled: true },
  { id: 'edit-gender', title: 'Gender', subtitle: '{value}', path: '/edit-gender', enabled: true },
  { id: 'edit-password', title: 'Password', subtitle: 'Change password (current + new + confirm)', path: '/edit-password', enabled: true },
  { id: 'verify-email', title: 'Email verification', subtitle: 'Not verified', path: '/verify-email', enabled: true },
  { id: 'verify-phone', title: 'Phone verification', subtitle: 'Not verified', path: '/verify-phone', enabled: true },
  { id: 'notifications', title: 'Notifications', subtitle: 'Notification settings (on/off)', path: '/notifications', enabled: true },
  { id: 'help-support', title: 'Help & support', subtitle: 'Need help? Open support page', path: '/help-support', enabled: true },
  { id: 'feedback', title: 'Feedback', subtitle: 'Share your app feedback', path: '/feedback', enabled: true },
  { id: 'report-issue', title: 'Report issue', subtitle: 'Report a bug or problem', path: '/report-issue', enabled: true },
  { id: 'achievement', title: 'Achievements', subtitle: 'Streaks, badges, full marks', path: '/achievement', enabled: true },
  { id: 'privacy-policy', title: 'Privacy policy', subtitle: 'How data is handled', path: '/privacy-policy', enabled: true },
  { id: 'terms-of-use', title: 'Terms of use', subtitle: 'Conditions of use', path: '/terms-of-use', enabled: true },
  { id: 'export-data', title: 'Export my data', subtitle: 'JSON snapshot via share sheet', path: '/export-data', enabled: true },
  { id: 'logout', title: 'Log out', subtitle: 'Sign out on this device', path: '/logout', enabled: true },
  { id: 'delete-account', title: 'Delete account', subtitle: 'Remove account and clear this device', path: '/delete-account', enabled: true },
];
function ProfileTab({ apiClient }: { apiClient: typeof api }) {
  const PROFILE_ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<ProfileMenuItem[]>(DEFAULT_PROFILE_MENU_ITEMS);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>(DEFAULT_PROFILE_MENU_ITEMS[0].id);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [path, setPath] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const rawItems = res.data?.settings?.profileMenuItems;
      if (Array.isArray(rawItems) && rawItems.length) {
        const mapped = rawItems.map((item: any, index: number) => ({
            id: String(item.id || `item-${index + 1}`),
            title: String(item.title || '').trim(),
            subtitle: String(item.subtitle || '').trim(),
            path: String(item.path || '').trim(),
            enabled: item.enabled !== false,
          }));
        setItems(mapped);
        if (!mapped.some((x) => x.id === selectedMenuItemId)) {
          setSelectedMenuItemId(mapped[0].id);
        }
      } else {
        setItems(DEFAULT_PROFILE_MENU_ITEMS);
        if (!DEFAULT_PROFILE_MENU_ITEMS.some((x) => x.id === selectedMenuItemId)) {
          setSelectedMenuItemId(DEFAULT_PROFILE_MENU_ITEMS[0].id);
        }
      }
      setPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load profile menu');
    }
  }

  async function saveAll(nextItems: ProfileMenuItem[]) {
    try {
      setError('');
      const res = await apiClient.patch('/admin/settings', { profileMenuItems: nextItems });
      const savedItems = res.data?.settings?.profileMenuItems || nextItems;
      setItems(savedItems);
      if (!savedItems.some((x: ProfileMenuItem) => x.id === selectedMenuItemId) && savedItems.length) {
        setSelectedMenuItemId(savedItems[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save profile menu');
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanPath = path.trim();
    if (!cleanTitle || !cleanPath) {
      setError('Title and path are required');
      return;
    }
    const id = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now()}`;
    const nextItems = [{ id, title: cleanTitle, subtitle: subtitle.trim(), path: cleanPath, enabled }, ...items];
    await saveAll(nextItems);
    setTitle('');
    setSubtitle('');
    setPath('');
    setEnabled(true);
    setPage(1);
  }

  async function updateItem(item: ProfileMenuItem) {
    const nextItems = items.map((x) => (x.id === item.id ? item : x));
    await saveAll(nextItems);
    setEditingId('');
  }

  async function removeItem(id: string) {
    if (!window.confirm('Delete this profile menu item?')) return;
    const nextItems = items.filter((x) => x.id !== id);
    await saveAll(nextItems);
    setPage(1);
  }

  async function toggleItem(item: ProfileMenuItem) {
    const nextItems = items.map((x) => (x.id === item.id ? { ...x, enabled: !x.enabled } : x));
    await saveAll(nextItems);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PROFILE_ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PROFILE_ITEMS_PER_PAGE;
    return items.slice(start, start + PROFILE_ITEMS_PER_PAGE);
  }, [items, safePage]);
  const selectedItem = items.find((x) => x.id === selectedMenuItemId) || items[0] || null;

  return (
    <section className="panel-card profile-panel">
      <div className="panel-head">
        <h3>Profile Menu Control</h3>
      </div>
      <div className="profile-preview">
        <div className="profile-preview-menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`profile-preview-item ${selectedItem?.id === item.id ? 'active' : ''}`}
              onClick={() => setSelectedMenuItemId(item.id)}
              disabled={!item.enabled}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="profile-preview-content">
          <h4>{selectedItem?.title || 'Select item'}</h4>
          <p>{selectedItem?.subtitle || (selectedItem ? `This section opens in same page panel for: ${selectedItem.title}` : 'No item selected')}</p>
          {selectedItem && <code>{selectedItem.path}</code>}
        </div>
      </div>
      <form onSubmit={addItem} className="inline-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Menu title (e.g. Feedback)" required />
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" />
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Open path (e.g. /feedback)" required />
        <label className="check-wrap">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          enabled
        </label>
        <button type="submit">Add Menu Item</button>
      </form>
      <div className="inline-form">
        <button type="button" onClick={load}>Load Profile Items</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="list table">
        <div className="row row-head profile-menu-row">
          <span>Title</span>
          <span>Subtitle</span>
          <span>Path</span>
          <span>Toggle</span>
          <span>Open</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {pagedItems.map((item) => (
          <div key={item.id} className="row profile-menu-row">
            {editingId === item.id ? (
              <>
                <input
                  value={item.title}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))}
                />
                <input
                  value={item.subtitle || ''}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, subtitle: e.target.value } : x)))}
                />
                <input
                  value={item.path}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, path: e.target.value } : x)))}
                />
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, enabled: e.target.checked } : x)))}
                  />
                  enabled
                </label>
                <button type="button" onClick={() => setSelectedMenuItemId(item.id)}>Open</button>
                <button type="button" onClick={() => updateItem(item)}>Save</button>
                <button type="button" className="ghost" onClick={() => setEditingId('')}>Cancel</button>
              </>
            ) : (
              <>
                <span>{item.title}</span>
                <span>{item.subtitle || '-'}</span>
                <span>{item.path}</span>
                <label className="check-wrap">
                  <input type="checkbox" checked={item.enabled} onChange={() => toggleItem(item)} />
                  {item.enabled ? 'on' : 'off'}
                </label>
                <button type="button" onClick={() => setSelectedMenuItemId(item.id)} disabled={!item.enabled}>
                  Open
                </button>
                <button type="button" onClick={() => setEditingId(item.id)}>Update</button>
                <button type="button" className="danger" onClick={() => removeItem(item.id)}>Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safePage} of {totalPages}
        </span>
        <div className="inline-form pagination-controls">
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
            Previous
          </button>
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function SimpleContentSettingsTab({
  apiClient,
  title,
  settingsKey,
}: {
  apiClient: typeof api;
  title: string;
  settingsKey: 'helpSupportContent' | 'achievementContent' | 'privacyPolicyContent' | 'termsOfUseContent';
}) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  async function load() {
    try {
      setError('');
      setLoading(true);
      const res = await apiClient.get('/admin/settings');
      const value = String(res.data?.settings?.[settingsKey]?.body || '');
      setBody(value);
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setError('');
      setSaving(true);
      await apiClient.patch('/admin/settings', {
        [settingsKey]: {
          title,
          body,
        },
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to save ${title}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      {loading ? (
        <p className="sub">Loading...</p>
      ) : (
        <>
          <textarea
            className="simple-content-editor"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Write ${title} content`}
            rows={16}
          />
          <div className="inline-form">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Content'}
            </button>
            <button type="button" className="ghost" onClick={load} disabled={saving}>
              Reload
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function SupportInboxSettingsTab({
  apiClient,
  title,
  settingsKey,
}: {
  apiClient: typeof api;
  title: string;
  settingsKey: 'feedbackInbox' | 'reportIssueInbox';
}) {
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<SupportInboxItem[]>([]);
  const [user, setUser] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<SupportInboxItem['status']>('new');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/settings');
      const rawItems = res.data?.settings?.[settingsKey]?.items;
      const mapped = Array.isArray(rawItems)
        ? rawItems.map((item: any, index: number) => ({
            id: String(item.id || `${settingsKey}-${index + 1}`),
            user: String(item.user || ''),
            subject: String(item.subject || ''),
            message: String(item.message || ''),
            createdAt: String(item.createdAt || ''),
            status: (['new', 'in_progress', 'resolved'].includes(String(item.status)) ? item.status : 'new') as SupportInboxItem['status'],
          }))
        : [];
      setItems(mapped);
      setPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to load ${title}`);
    }
  }

  async function saveAll(nextItems: SupportInboxItem[]) {
    try {
      setError('');
      await apiClient.patch('/admin/settings', {
        [settingsKey]: {
          items: nextItems,
        },
      });
      setItems(nextItems);
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to save ${title}`);
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const cleanUser = user.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanUser || !cleanSubject || !cleanMessage) {
      setError('User, subject and message are required');
      return;
    }
    const nextItems: SupportInboxItem[] = [
      {
        id: `${settingsKey}-${Date.now()}`,
        user: cleanUser,
        subject: cleanSubject,
        message: cleanMessage,
        createdAt: new Date().toISOString(),
        status,
      },
      ...items,
    ];
    await saveAll(nextItems);
    setUser('');
    setSubject('');
    setMessage('');
    setStatus('new');
    setPage(1);
  }

  async function removeItem(id: string) {
    if (!window.confirm('Delete this record?')) return;
    const nextItems = items.filter((x) => x.id !== id);
    await saveAll(nextItems);
  }

  async function updateStatus(id: string, nextStatus: SupportInboxItem['status']) {
    const nextItems = items.map((x) => (x.id === id ? { ...x, status: nextStatus } : x));
    await saveAll(nextItems);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  }, [items, safePage]);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      <form onSubmit={addItem} className="inline-form">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="User" required />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message" required />
        <select value={status} onChange={(e) => setStatus(e.target.value as SupportInboxItem['status'])}>
          <option value="new">new</option>
          <option value="in_progress">in_progress</option>
          <option value="resolved">resolved</option>
        </select>
        <button type="submit">Add</button>
        <button type="button" className="ghost" onClick={load}>
          Reload
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="list table support-table">
        <div className="row row-head">
          <span>User</span>
          <span>Subject</span>
          <span>Message</span>
          <span>Time</span>
          <span>Status</span>
        </div>
        {pagedItems.map((item) => (
          <div key={item.id} className="row">
            <span>{item.user}</span>
            <span>{item.subject}</span>
            <span>{item.message}</span>
            <span>{item.createdAt}</span>
            <div className="inline-form">
              <select value={item.status} onChange={(e) => updateStatus(item.id, e.target.value as SupportInboxItem['status'])}>
                <option value="new">new</option>
                <option value="in_progress">in_progress</option>
                <option value="resolved">resolved</option>
              </select>
              <button type="button" className="danger" onClick={() => removeItem(item.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safePage} of {totalPages}
        </span>
        <div className="inline-form pagination-controls">
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
            Previous
          </button>
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function HomeContentTab({ apiClient }: { apiClient: typeof api }) {
  const [settings, setSettings] = useState<HomeContentSettings>({
    welcomeText: 'Welcome Rahul',
    quickActionsTitle: 'Quick actions',
    sections: [{ id: 'category', title: 'Category', items: ['Math', 'Reasoning', 'English', 'GK'] }],
    quickActionSections: [
      {
        id: 'quick-actions-default',
        title: 'Quick actions',
        items: [
          { title: 'Start test', actionKey: 'startTest', iconKey: 'play' },
          { title: 'Leaderboard', actionKey: 'leaderboard', iconKey: 'trophy' },
          { title: 'Results', actionKey: 'results', iconKey: 'report' },
          { title: 'Tool', actionKey: 'bookmarks', iconKey: 'bookmark' },
        ],
      },
    ],
    banners: [],
    newsSlides: [],
    startSeriesLockSeconds: 20,
    startSeriesActiveWindowMinutes: 30,
  });
  const [newsItems, setNewsItems] = useState<ArticleItem[]>([]);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionItems, setNewSectionItems] = useState('');
  const [newQuickSectionTitle, setNewQuickSectionTitle] = useState('');
  const [newQuickSectionItems, setNewQuickSectionItems] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  async function load() {
    try {
      setError('');
      const [settingsRes, articleRes] = await Promise.all([apiClient.get('/admin/settings'), apiClient.get('/admin/articles')]);
      const res = settingsRes;
      const home = res.data?.settings?.homeContent;
      const allArticles: ArticleItem[] = articleRes.data?.items || [];
      setNewsItems(allArticles.filter((item) => item.feed_kind === 'news' && item.is_published));
      if (home && typeof home === 'object') {
        setSettings({
          welcomeText: String(home.welcomeText || 'Welcome Rahul'),
          quickActionsTitle: String(home.quickActionsTitle || 'Quick actions'),
          sections: Array.isArray(home.sections)
            ? home.sections.map((s: any, idx: number) => ({
                id: String(s.id || `section-${idx + 1}`),
                title: String(s.title || ''),
                items: Array.isArray(s.items) ? s.items.map((x: any) => String(x)) : [],
              }))
            : [],
          quickActionSections: Array.isArray(home.quickActionSections)
            ? home.quickActionSections.map((s: any, idx: number) => ({
                id: String(s.id || `qa-section-${idx + 1}`),
                title: String(s.title || ''),
                items: Array.isArray(s.items)
                  ? s.items.map((x: any) => ({
                      title: String(x.title || ''),
                      actionKey: String(x.actionKey || ''),
                      iconKey: String(x.iconKey || ''),
                    }))
                  : [],
              }))
            : [],
          banners: Array.isArray(home.banners)
            ? home.banners.map((b: any, idx: number) => ({
                id: String(b.id || `banner-${idx + 1}`),
                imageUrl: String(b.imageUrl || ''),
                enabled: b.enabled !== false,
              }))
            : [],
          newsSlides: Array.isArray(home.newsSlides)
            ? home.newsSlides.map((slide: any, idx: number) => ({
                id: String(slide.id || `news-slide-${idx + 1}`),
                articleId: String(slide.articleId || ''),
                headline: String(slide.headline || ''),
                imageUrl: String(slide.imageUrl || ''),
                enabled: slide.enabled !== false,
              }))
            : [],
          startSeriesLockSeconds: Number(home.startSeriesLockSeconds || 20),
          startSeriesActiveWindowMinutes: Number(home.startSeriesActiveWindowMinutes || 30),
        });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load home content');
    }
  }

  async function save() {
    try {
      setError('');
      setSaving(true);
      await apiClient.patch('/admin/settings', { homeContent: settings });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save home content');
    } finally {
      setSaving(false);
    }
  }

  function addSection() {
    const title = newSectionTitle.trim();
    if (!title) return;
    const items = newSectionItems
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    setSettings((p) => ({
      ...p,
      sections: [...p.sections, { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `section-${Date.now()}`, title, items }],
    }));
    setNewSectionTitle('');
    setNewSectionItems('');
  }

  function parseQuickItems(value: string): HomeQuickActionItem[] {
    return value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((pair) => {
        const [title, actionKey, iconKey] = pair.split(':').map((v) => v.trim());
        return { title: title || '', actionKey: actionKey || '', iconKey: iconKey || '' };
      })
      .filter((x) => x.title && x.actionKey);
  }

  function formatQuickItems(items: HomeQuickActionItem[]): string {
    return items
      .map((x) => (x.iconKey ? `${x.title}:${x.actionKey}:${x.iconKey}` : `${x.title}:${x.actionKey}`))
      .join(', ');
  }

  function addQuickActionSection() {
    const title = newQuickSectionTitle.trim();
    if (!title) return;
    const items = parseQuickItems(newQuickSectionItems);
    setSettings((p) => ({
      ...p,
      quickActionSections: [
        ...p.quickActionSections,
        {
          id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `qa-section-${Date.now()}`,
          title,
          items,
        },
      ],
    }));
    setNewQuickSectionTitle('');
    setNewQuickSectionItems('');
  }

  function toBase64(file: File): Promise<string> {
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

  async function uploadAndAddBanner() {
    if (!bannerFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(bannerFile.type)) {
      setError('Only JPG, PNG, or WEBP files are allowed');
      return;
    }
    if (bannerFile.size > 5 * 1024 * 1024) {
      setError('Image size must be 5MB or less');
      return;
    }
    try {
      setError('');
      setUploadingBanner(true);
      const dataBase64 = await toBase64(bannerFile);
      const res = await apiClient.post('/admin/uploads/banner', {
        fileName: bannerFile.name,
        contentType: bannerFile.type,
        dataBase64,
      });
      const imageUrl = String(res.data?.imageUrl || '').trim();
      if (!imageUrl) throw new Error('Upload response missing image URL');
      setSettings((p) => ({
        ...p,
        banners: [...p.banners, { id: `banner-${Date.now()}`, imageUrl, enabled: true }],
      }));
      setBannerFile(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to upload banner');
    } finally {
      setUploadingBanner(false);
    }
  }

  function addNewsSlide(article: ArticleItem) {
    setSettings((p) => {
      if (p.newsSlides.some((x) => x.articleId === article.id)) return p;
      return {
        ...p,
        newsSlides: [
          ...p.newsSlides,
          {
            id: `news-slide-${Date.now()}-${article.id.slice(0, 8)}`,
            articleId: article.id,
            headline: article.headline,
            imageUrl: '',
            enabled: true,
          },
        ],
      };
    });
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Home Content</h3>
      </div>
      <div className="settings-form">
        <input
          value={settings.welcomeText}
          onChange={(e) => setSettings((p) => ({ ...p, welcomeText: e.target.value }))}
          placeholder="Welcome text"
        />
        <input
          value={settings.quickActionsTitle}
          onChange={(e) => setSettings((p) => ({ ...p, quickActionsTitle: e.target.value }))}
          placeholder="Quick actions title"
        />
        <input
          type="number"
          min={0}
          max={86400}
          value={settings.startSeriesLockSeconds}
          onChange={(e) => setSettings((p) => ({ ...p, startSeriesLockSeconds: Number(e.target.value || 0) }))}
          placeholder="Start lock seconds"
        />
        <input
          type="number"
          min={1}
          max={10080}
          value={settings.startSeriesActiveWindowMinutes}
          onChange={(e) => setSettings((p) => ({ ...p, startSeriesActiveWindowMinutes: Number(e.target.value || 1) }))}
          placeholder="Active window minutes"
        />
      </div>
      <div className="inline-form">
        <input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="New section title" />
        <input
          value={newSectionItems}
          onChange={(e) => setNewSectionItems(e.target.value)}
          placeholder="Items comma separated (e.g. Math,Reasoning)"
        />
        <button type="button" onClick={addSection}>
          Add Section
        </button>
      </div>
      <div className="inline-form">
        <input value={newQuickSectionTitle} onChange={(e) => setNewQuickSectionTitle(e.target.value)} placeholder="New quick action section title" />
        <input
          value={newQuickSectionItems}
          onChange={(e) => setNewQuickSectionItems(e.target.value)}
          placeholder="Quick actions format: Label:key:icon, Label:key:icon"
        />
        <button type="button" onClick={addQuickActionSection}>
          Add Quick Action Section
        </button>
      </div>
      <div className="inline-form">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
        />
        <button type="button" onClick={uploadAndAddBanner} disabled={uploadingBanner || !bannerFile}>
          {uploadingBanner ? 'Uploading...' : 'Upload Banner'}
        </button>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
          <span>Section</span>
          <span>Items</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.sections.map((section) => (
          <div key={section.id} className="row" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
            <input
              value={section.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  sections: p.sections.map((x) => (x.id === section.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={section.items.join(', ')}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  sections: p.sections.map((x) =>
                    x.id === section.id
                      ? {
                          ...x,
                          items: e.target.value
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                        }
                      : x,
                  ),
                }))
              }
            />
            <button type="button" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  sections: p.sections.filter((x) => x.id !== section.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 120px 120px' }}>
          <span>Published News (Add to slider)</span>
          <span>Add</span>
          <span>Open</span>
        </div>
        {newsItems.map((article) => (
          <div key={article.id} className="row" style={{ gridTemplateColumns: '2fr 120px 120px' }}>
            <span title={article.summary || ''}>{article.headline}</span>
            <button type="button" onClick={() => addNewsSlide(article)} disabled={settings.newsSlides.some((x) => x.articleId === article.id)}>
              {settings.newsSlides.some((x) => x.articleId === article.id) ? 'Added' : 'Add'}
            </button>
            <button type="button" className="ghost" onClick={() => window.open(article.link_url || '', '_blank')} disabled={!article.link_url}>
              Link
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1.4fr 1.4fr 120px 90px 90px 90px' }}>
          <span>News headline</span>
          <span>Banner Image URL</span>
          <span>Enabled</span>
          <span>Up</span>
          <span>Down</span>
          <span>Delete</span>
        </div>
        {settings.newsSlides.map((slide, index) => (
          <div key={slide.id} className="row" style={{ gridTemplateColumns: '1.4fr 1.4fr 120px 90px 90px 90px' }}>
            <input
              value={slide.headline}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  newsSlides: p.newsSlides.map((x) => (x.id === slide.id ? { ...x, headline: e.target.value } : x)),
                }))
              }
            />
            <input
              value={slide.imageUrl}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  newsSlides: p.newsSlides.map((x) => (x.id === slide.id ? { ...x, imageUrl: e.target.value } : x)),
                }))
              }
              placeholder="Paste news image URL"
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={slide.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    newsSlides: p.newsSlides.map((x) => (x.id === slide.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setSettings((p) => {
                  if (index === 0) return p;
                  const next = [...p.newsSlides];
                  const tmp = next[index - 1];
                  next[index - 1] = next[index];
                  next[index] = tmp;
                  return { ...p, newsSlides: next };
                })
              }
              disabled={index === 0}
            >
              Up
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setSettings((p) => {
                  if (index >= p.newsSlides.length - 1) return p;
                  const next = [...p.newsSlides];
                  const tmp = next[index + 1];
                  next[index + 1] = next[index];
                  next[index] = tmp;
                  return { ...p, newsSlides: next };
                })
              }
              disabled={index >= settings.newsSlides.length - 1}
            >
              Down
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  newsSlides: p.newsSlides.filter((x) => x.id !== slide.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 120px 90px 90px' }}>
          <span>Banner Image</span>
          <span>Enabled</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.banners.map((banner) => (
          <div key={banner.id} className="row" style={{ gridTemplateColumns: '2fr 120px 90px 90px' }}>
            <input
              value={banner.imageUrl}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  banners: p.banners.map((x) => (x.id === banner.id ? { ...x, imageUrl: e.target.value } : x)),
                }))
              }
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={banner.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    banners: p.banners.map((x) => (x.id === banner.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button type="button" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  banners: p.banners.filter((x) => x.id !== banner.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
          <span>Quick Action Section</span>
          <span>Items (title:key:icon)</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.quickActionSections.map((section) => (
          <div key={section.id} className="row" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
            <input
              value={section.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  quickActionSections: p.quickActionSections.map((x) => (x.id === section.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={formatQuickItems(section.items)}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  quickActionSections: p.quickActionSections.map((x) =>
                    x.id === section.id
                      ? {
                          ...x,
                          items: parseQuickItems(e.target.value),
                        }
                      : x,
                  ),
                }))
              }
            />
            <button type="button" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  quickActionSections: p.quickActionSections.filter((x) => x.id !== section.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <button type="button" className="ghost" onClick={load}>
          Load
        </button>
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function PollSettingsTab({ apiClient }: { apiClient: typeof api }) {
  return <PollSettingsTabImpl apiClient={apiClient} />;
}

function PushNotificationSettingsTab({ apiClient }: { apiClient: typeof api }) {
  return <PushNotificationSettingsTabImpl apiClient={apiClient} />;
}

function NotificationSchedulingTab({ apiClient }: { apiClient: typeof api }) {
  return <NotificationSchedulingTabImpl apiClient={apiClient} />;
}

function PublishSchedulingTab({ apiClient }: { apiClient: typeof api }) {
  return <PublishSchedulingTabImpl apiClient={apiClient} />;
}

function SubmitApplicationContentTab({ apiClient }: { apiClient: typeof api }) {
  return <SubmitApplicationContentTabImpl apiClient={apiClient} />;
}

function InstructionContentTab({ apiClient }: { apiClient: typeof api }) {
  return <InstructionContentTabImpl apiClient={apiClient} />;
}

function ExamCategoriesTab({ apiClient }: { apiClient: typeof api }) {
  return <ExamCategoriesTabImpl apiClient={apiClient} />;
}

function SettingsTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  const [settings, setSettings] = useState<AppSettings>({
    maintenanceMode: false,
    maintenanceMessage: '',
    registrationOpen: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      setLoading(true);
      const res = await apiClient.get('/admin/settings');
      setSettings(res.data?.settings || settings);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!isSuperAdmin) return;
    try {
      setError('');
      setLoading(true);
      const res = await apiClient.patch('/admin/settings', settings);
      setSettings(res.data?.settings || settings);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Global Settings</h3>
      </div>
      <div className="inline-form">
        <button onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Load Settings'}</button>
      </div>
      <div className="settings-form">
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings((p) => ({ ...p, maintenanceMode: e.target.checked }))}
            disabled={!isSuperAdmin}
          />
          Maintenance mode
        </label>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.registrationOpen}
            onChange={(e) => setSettings((p) => ({ ...p, registrationOpen: e.target.checked }))}
            disabled={!isSuperAdmin}
          />
          Registration open
        </label>
        <input
          value={settings.maintenanceMessage}
          onChange={(e) => setSettings((p) => ({ ...p, maintenanceMessage: e.target.value }))}
          placeholder="Maintenance message"
          disabled={!isSuperAdmin}
        />
      </div>
      {isSuperAdmin ? (
        <button onClick={save} disabled={loading}>Save Settings</button>
      ) : (
        <button disabled title="Only super admin can update settings">Restricted</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function AuditLogsTab({ apiClient }: { apiClient: typeof api }) {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [limit, setLimit] = useState('120');
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/audit-logs', { params: { limit: Number(limit || '120') } });
      setItems(res.data?.items || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load audit logs');
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Audit Logs</h3>
      </div>
      <div className="inline-form">
        <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Limit" type="number" min={20} max={300} />
        <button onClick={load}>Load Logs</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="list table audit-table">
        <div className="row row-head">
          <span>Time</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Target</span>
          <span>Details</span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="row">
            <span>{new Date(item.created_at).toLocaleString()}</span>
            <span>{item.actor_name || item.actor_email || '-'}</span>
            <span>{item.action_type}</span>
            <span>{item.target_type}:{item.target_id || '-'}</span>
            <span>{JSON.stringify(item.details_json || {})}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
function UsersTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  const [items, setItems] = useState<UserItem[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const res = await apiClient.get('/admin/users', { params: { q: query } });
      setItems(res.data?.items || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load users');
    }
  }

  async function toggleAdmin(user: UserItem) {
    try {
      setError('');
      await apiClient.patch(`/admin/users/${user.id}/admin`, {
        isAdmin: !user.is_admin,
        isSuperAdmin: user.is_super_admin,
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update admin role');
    }
  }

  async function toggleSuperAdmin(user: UserItem) {
    try {
      setError('');
      await apiClient.patch(`/admin/users/${user.id}/admin`, {
        isAdmin: true,
        isSuperAdmin: !user.is_super_admin,
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update admin role');
    }
  }

  async function toggleBan(user: UserItem) {
    const shouldBan = !user.is_banned;
    let reason = '';
    if (shouldBan) {
      reason = window.prompt(`Ban reason for ${user.email}`, user.ban_reason || 'Policy violation') || '';
      if (!reason.trim()) return;
    }
    try {
      setError('');
      await apiClient.patch(`/admin/users/${user.id}/ban`, {
        isBanned: shouldBan,
        banReason: reason.trim(),
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update ban status');
    }
  }

  async function revokeSessions(user: UserItem) {
    if (!window.confirm(`Revoke all login sessions for ${user.email}?`)) return;
    try {
      setError('');
      await apiClient.post(`/admin/users/${user.id}/revoke-sessions`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to revoke sessions');
    }
  }

  async function deleteUser(user: UserItem) {
    if (!window.confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      setError('');
      await apiClient.delete(`/admin/users/${user.id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete user');
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>User Access Control</h3>
      </div>
      <div className="inline-form">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users" />
        <button onClick={load}>Load Users</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="list table users-table">
        <div className="row row-head">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Ban Status</span>
          <span>Actions</span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="row">
            <span>{item.display_name || '-'}</span>
            <span>{item.email}</span>
            <span>{item.is_super_admin ? 'Super Admin' : item.is_admin ? 'Admin' : 'User'}</span>
            <span>{item.is_banned ? `Banned: ${item.ban_reason || 'No reason'}` : 'Active'}</span>
            {isSuperAdmin ? (
              <div className="inline-form">
                <button onClick={() => toggleAdmin(item)}>{item.is_admin ? 'Remove Admin' : 'Make Admin'}</button>
                <button onClick={() => toggleSuperAdmin(item)}>
                  {item.is_super_admin ? 'Remove Super Admin' : 'Make Super Admin'}
                </button>
                <button className="ghost" onClick={() => toggleBan(item)}>
                  {item.is_banned ? 'Unban User' : 'Ban User'}
                </button>
                <button className="ghost" onClick={() => revokeSessions(item)}>
                  Revoke Sessions
                </button>
                <button className="danger" onClick={() => deleteUser(item)}>
                  Delete User
                </button>
              </div>
            ) : (
              <button disabled title="Only super admin can change roles and user access">
                Restricted
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function UserManagementAdvancedTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  return <UserManagementAdvancedTabImpl apiClient={apiClient} isSuperAdmin={isSuperAdmin} />;
}

export default App;






