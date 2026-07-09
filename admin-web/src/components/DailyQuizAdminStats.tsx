/**
 * Backward-compatible re-export — use DailyQuizDashboard directly in new code.
 */
export {
  DailyQuizDashboard,
  DailyQuizDashboard as DailyQuizAdminStats,
  normalizeDailyQuizAdminStats,
  type DailyQuizAdminStatsData,
  type DailyQuizStatsRange,
} from './dailyQuiz/DailyQuizDashboard';
