package com.freemocktest.app.newui.home

import androidx.compose.runtime.Composable

@Composable
fun HomeRouteNew(
    onLogout: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenActivity: () -> Unit,
    onOpenCategory: (String) -> Unit,
    onSeeAllCategories: () -> Unit,
    onStartTest: (String) -> Unit,
    onApplyForTest: (String) -> Unit,
    onLeaderboard: () -> Unit,
    onResults: () -> Unit,
    onOpenPendingResult: (String, Int, Int, Int, Int, Long) -> Unit,
    onBookmarks: () -> Unit,
    onOpenJobAlert: () -> Unit,
    onOpenExamAlert: () -> Unit,
    onOpenNews: () -> Unit,
    onOpenNewsArticle: (String) -> Unit,
    onOpenProgressReport: () -> Unit,
    onOpenDaily: () -> Unit,
    onOpenMenuQuiz: () -> Unit,
    onOpenPoll: () -> Unit,
    onOpenNotifications: () -> Unit,
) {
    HomeScreenNew(
        onLogout = onLogout,
        onOpenProfile = onOpenProfile,
        onOpenHistory = onOpenHistory,
        onOpenActivity = onOpenActivity,
        onOpenCategory = onOpenCategory,
        onSeeAllCategories = onSeeAllCategories,
        onStartTest = onStartTest,
        onApplyForTest = onApplyForTest,
        onLeaderboard = onLeaderboard,
        onResults = onResults,
        onOpenPendingResult = onOpenPendingResult,
        onBookmarks = onBookmarks,
        onOpenJobAlert = onOpenJobAlert,
        onOpenExamAlert = onOpenExamAlert,
        onOpenNews = onOpenNews,
        onOpenNewsArticle = onOpenNewsArticle,
        onOpenProgressReport = onOpenProgressReport,
        onOpenDaily = onOpenDaily,
        onOpenMenuQuiz = onOpenMenuQuiz,
        onOpenPoll = onOpenPoll,
        onOpenNotifications = onOpenNotifications,
    )
}

