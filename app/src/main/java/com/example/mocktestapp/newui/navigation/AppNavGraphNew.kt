package com.example.mocktestapp.newui.navigation

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.RestoreSessionStatus
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.mocktestapp.newui.auth.AuthRouteNew
import com.example.mocktestapp.newui.auth.CompleteProfileScreenNew
import com.example.mocktestapp.newui.auth.ForgotPasswordScreenNew
import com.example.mocktestapp.newui.legal.TermsOfServiceScreenNew

internal object RoutesNew {
    const val BOOTSTRAP = "bootstrap"
    const val AUTH = "auth"
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

@Composable
fun AppNavGraphNew() {
    val navController = rememberNavController()
    // Do not call navController.navigate() from inside Auth's click handler while that route is
    // being popped (popUpTo AUTH inclusive). That can trigger lifecycle / snapshot crashes on some
    // devices. Instead: flip a flag here; perform navigation from this stable LaunchedEffect.
    var pendingNavigateToHome by remember { mutableStateOf(false) }

    LaunchedEffect(pendingNavigateToHome) {
        if (!pendingNavigateToHome) return@LaunchedEffect
        // Never clear the flag before navigate(): setting false changes this effect's key and can
        // cancel this coroutine before navigate() runs — that looked like "app closes on login".
        runCatching {
            navController.navigate(RoutesNew.HOME) {
                popUpTo(RoutesNew.AUTH) { inclusive = true }
                launchSingleTop = true
            }
        }.onFailure { e ->
            Log.e("AppNav", "Auth -> Home navigation failed", e)
        }
        pendingNavigateToHome = false
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        NavHost(
            navController = navController,
            startDestination = RoutesNew.BOOTSTRAP,
            modifier = Modifier.fillMaxSize(),
        ) {
        composable(RoutesNew.BOOTSTRAP) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            LaunchedEffect(Unit) {
                when (AuthRepository.restoreSession()) {
                    RestoreSessionStatus.Ready -> {
                        navController.navigate(RoutesNew.HOME) {
                            popUpTo(RoutesNew.BOOTSTRAP) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                    RestoreSessionStatus.ProfileIncomplete -> {
                        navController.navigate(RoutesNew.COMPLETE_PROFILE) {
                            popUpTo(RoutesNew.BOOTSTRAP) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                    RestoreSessionStatus.LoggedOut -> {
                        navController.navigate(RoutesNew.AUTH) {
                            popUpTo(RoutesNew.BOOTSTRAP) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                }
            }
        }
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
            CompleteProfileScreenNew(
                onFinished = {
                    navController.navigate(RoutesNew.HOME) {
                        popUpTo(RoutesNew.COMPLETE_PROFILE) { inclusive = true }
                        launchSingleTop = true
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
        composable(RoutesNew.HOME) {
            MainBottomNavHost(rootNavController = navController)
        }
        }
    }
}

