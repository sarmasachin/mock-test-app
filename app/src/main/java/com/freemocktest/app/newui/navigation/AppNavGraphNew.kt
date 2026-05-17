package com.freemocktest.app.newui.navigation

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.RestoreSessionStatus
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.freemocktest.app.newui.auth.AuthRouteNew
import com.freemocktest.app.newui.auth.CompleteProfileScreenNew
import com.freemocktest.app.newui.auth.SelectLoginTestsScreenNew
import com.freemocktest.app.newui.auth.ForgotPasswordScreenNew
import com.freemocktest.app.newui.legal.TermsOfServiceScreenNew
import com.freemocktest.app.newui.components.NetworkConnectivityBanner
import com.freemocktest.app.notifications.PushNavigationBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

internal object RoutesNew {
    const val AUTH = "auth"
    /** One-time test multi-select after login / restored session. */
    const val SELECT_LOGIN_TESTS = "select_login_tests"
    const val HOME = "home"
    const val CATEGORY = "category"
    const val TESTS = "tests"
    const val START_TEST_PREVIEW = "start_test_preview"
    const val INSTRUCTIONS = "instructions"
    const val QUIZ = "quiz"
    const val RESULT = "result"
    const val ANSWER_KEY = "answer_key"
    const val REVIEW = "review"
    const val REVIEW_SOLUTION = "review_solution"
    const val LEADERBOARD = "leaderboard"
    const val HISTORY = "history"
    const val RESULTS_HISTORY = "results_history"
    const val BOOKMARKS = "bookmarks"
    const val JOB_ALERT = "job_alert"
    const val JOB_ALERT_DETAIL = "job_alert_detail"
    const val EXAM_ALERT = "exam_alert"
    const val EXAM_ALERT_DETAIL = "exam_alert_detail"
    const val NEWS_DETAIL = "news_detail"
    const val DAILY = "daily"
    const val MENU_QUIZ = "menu_quiz"
    const val SEE_ALL_CATEGORIES = "see_all_categories"
    const val APPLY = "apply_for_test"
    const val FORGOT_PASSWORD = "forgot_password"
    const val COMPLETE_PROFILE = "complete_profile"
    const val PRIVACY = "privacy"
    const val TERMS = "terms"
    const val ACHIEVEMENTS = "achievements"
    const val PROGRESS_REPORT = "progress_report"
    const val POLL = "poll"
    const val NOTIFICATIONS = "notifications"
}

private suspend fun resolveColdStartDestination(): String {
    return when (AuthRepository.peekColdStartStatus()) {
        RestoreSessionStatus.LoggedOut -> RoutesNew.AUTH
        RestoreSessionStatus.ProfileIncomplete -> RoutesNew.COMPLETE_PROFILE
        RestoreSessionStatus.Ready -> if (AppPreferencesRepository.shouldShowLoginTestPicker()) {
            RoutesNew.SELECT_LOGIN_TESTS
        } else {
            RoutesNew.HOME
        }
    }
}

@Composable
fun AppNavGraphNew() {
    val navController = rememberNavController()
    val startDestination = remember {
        runBlocking(Dispatchers.IO) { resolveColdStartDestination() }
    }
    val pendingPushRoute by PushNavigationBridge.pendingRoute.collectAsState()
    var pendingNavigateToHome by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        when (AuthRepository.restoreSession()) {
            RestoreSessionStatus.LoggedOut -> {
                val route = navController.currentDestination?.route
                if (route != RoutesNew.AUTH) {
                    navController.navigate(RoutesNew.AUTH) {
                        popUpTo(navController.graph.id) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            }
            RestoreSessionStatus.ProfileIncomplete -> {
                val route = navController.currentDestination?.route
                if (route != RoutesNew.COMPLETE_PROFILE && route != RoutesNew.AUTH) {
                    navController.navigate(RoutesNew.COMPLETE_PROFILE) {
                        popUpTo(navController.graph.id) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            }
            RestoreSessionStatus.Ready -> Unit
        }
    }

    LaunchedEffect(pendingNavigateToHome) {
        if (!pendingNavigateToHome) return@LaunchedEffect
        val dest = if (AppPreferencesRepository.shouldShowLoginTestPicker()) {
            RoutesNew.SELECT_LOGIN_TESTS
        } else {
            RoutesNew.HOME
        }
        runCatching {
            navController.navigate(dest) {
                popUpTo(RoutesNew.AUTH) { inclusive = true }
                launchSingleTop = true
            }
        }.onFailure { e ->
            Log.e("AppNav", "Auth -> post-login navigation failed", e)
        }
        pendingNavigateToHome = false
    }

    LaunchedEffect(pendingPushRoute) {
        val route = pendingPushRoute?.trim().orEmpty().lowercase()
        if (route != RoutesNew.COMPLETE_PROFILE) return@LaunchedEffect
        runCatching {
            navController.navigate(RoutesNew.COMPLETE_PROFILE) {
                launchSingleTop = true
            }
        }
        PushNavigationBridge.consume()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        NetworkConnectivityBanner()
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier
                .weight(1f, fill = true)
                .fillMaxWidth(),
        ) {
        composable(RoutesNew.AUTH) {
            AuthRouteNew(
                onAuthSuccess = { pendingNavigateToHome = true },
                onProfileIncomplete = {
                    navController.navigate(RoutesNew.COMPLETE_PROFILE) {
                        popUpTo(RoutesNew.AUTH) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onForgotPassword = { navController.navigate(RoutesNew.FORGOT_PASSWORD) },
                onOpenTerms = { navController.navigate(RoutesNew.TERMS) },
            )
        }
        composable(RoutesNew.TERMS) {
            TermsOfServiceScreenNew(
                onBack = { navController.popBackStack() },
            )
        }
        composable(RoutesNew.COMPLETE_PROFILE) {
            val scope = rememberCoroutineScope()
            CompleteProfileScreenNew(
                onFinished = {
                    scope.launch {
                        val dest = if (AppPreferencesRepository.shouldShowLoginTestPicker()) {
                            RoutesNew.SELECT_LOGIN_TESTS
                        } else {
                            RoutesNew.HOME
                        }
                        navController.navigate(dest) {
                            popUpTo(RoutesNew.COMPLETE_PROFILE) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                },
                onSignOut = {
                    navController.navigate(RoutesNew.AUTH) {
                        popUpTo(RoutesNew.COMPLETE_PROFILE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(RoutesNew.FORGOT_PASSWORD) {
            ForgotPasswordScreenNew(
                onBack = { navController.popBackStack() },
            )
        }
        composable(RoutesNew.SELECT_LOGIN_TESTS) {
            SelectLoginTestsScreenNew(
                onFinished = {
                    navController.navigate(RoutesNew.HOME) {
                        popUpTo(RoutesNew.SELECT_LOGIN_TESTS) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(RoutesNew.HOME) {
            MainBottomNavHost(rootNavController = navController)
        }
        }
    }
}
