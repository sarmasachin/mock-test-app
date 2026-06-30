package com.freemocktest.app.newui.navigation

import android.app.Activity
import android.net.Uri
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.ui.graphics.vector.ImageVector
import android.widget.Toast
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavController
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.TestHistoryRepository
import com.freemocktest.app.util.TestScheduleUtils
import com.freemocktest.app.util.TestAttemptPolicy
import com.freemocktest.app.newui.alerts.ExamAlertFeedImageSeedPrefix
import com.freemocktest.app.newui.alerts.ExamAlertScreenNew
import com.freemocktest.app.newui.alerts.JobAlertFeedImageSeedPrefix
import com.freemocktest.app.newui.alerts.JobAlertScreenNew
import com.freemocktest.app.newui.achievements.AchievementsScreenNew
import com.freemocktest.app.newui.apply.ApplyForTestScreenNew
import com.freemocktest.app.newui.bookmarks.BookmarksScreenNew
import com.freemocktest.app.newui.category.CategoryRouteNew
import com.freemocktest.app.newui.digest.DailyDigestScreenNew
import com.freemocktest.app.newui.digest.DailyDigestContentScreenNew
import com.freemocktest.app.newui.history.HistoryScreenNew
import com.freemocktest.app.newui.history.ResultsHistoryScreenNew
import com.freemocktest.app.newui.home.HomeRouteNew
import com.freemocktest.app.newui.home.SeeAllCategoriesScreenNew
import com.freemocktest.app.newui.instructions.InstructionsScreenNew
import com.freemocktest.app.newui.leaderboard.LeaderboardScreenNew
import com.freemocktest.app.newui.legal.PrivacyPolicyScreenNew
import com.freemocktest.app.newui.legal.TermsOfServiceScreenNew
import com.freemocktest.app.newui.menu.NotificationsScreenNew
import com.freemocktest.app.newui.menu.PollScreenNew
import com.freemocktest.app.newui.news.NewsDetailRouteNew
import com.freemocktest.app.newui.news.NewsScreenNew
import com.freemocktest.app.newui.profile.ProfileRouteNew
import com.freemocktest.app.newui.progress.ProgressReportScreenNew
import com.freemocktest.app.newui.quiz.QuizScreenNew
import com.freemocktest.app.newui.result.AnswerKeyScreenNew
import com.freemocktest.app.newui.result.ResultScreenNew
import com.freemocktest.app.newui.result.ReviewScreenNew
import com.freemocktest.app.newui.result.ReviewSolutionScreenNew
import com.freemocktest.app.newui.tests.StartTestPreviewScreenNew
import com.freemocktest.app.newui.tests.TestsScreenNew
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import com.freemocktest.app.notifications.PushNavigationBridge
import com.freemocktest.app.notifications.PushRouteNormalizer
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.nio.charset.StandardCharsets

private object MainTabRoutes {
    const val Home = "main/home"
    const val Tests = "main/tests"
    const val News = "main/news"
    const val Profile = "main/profile"
}

private data class MainTabItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

/** Bottom-nav tabs must share one back-stack policy or popBackStack / Home tab breaks. */
private fun NavController.navigateMainTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/** Prefer popping to Home so system back + Home tab match the same stack as tab switches. */
private fun NavController.goToHomeTab(): Boolean {
    val popped = popBackStack(MainTabRoutes.Home, inclusive = false)
    if (!popped) {
        navigateMainTab(MainTabRoutes.Home)
    }
    return true
}

private fun NavController.popBackOrHome() {
    val popped = popBackStack()
    if (!popped) {
        goToHomeTab()
    }
}

/**
 * News feed and [RoutesNew.NEWS_DETAIL] are sibling destinations in the same graph, so
 * [NavDestination.hierarchy] does not include [MainTabRoutes.News] on the article screen.
 * Treat both as the News tab so the bottom item stays highlighted.
 */
private fun isMainBottomTabSelected(tabRoute: String, current: NavDestination?): Boolean {
    if (current == null) return false
    if (current.hierarchy.any { it.route == tabRoute }) return true
    val r = current.route ?: return false
    if (r == tabRoute) return true
    if (tabRoute == MainTabRoutes.News) {
        val detailPattern = "${RoutesNew.NEWS_DETAIL}/{newsId}"
        if (r == detailPattern || r.startsWith("${RoutesNew.NEWS_DETAIL}/")) return true
    }
    if (tabRoute == MainTabRoutes.Profile) {
        if (
            r == RoutesNew.ACHIEVEMENTS ||
            r == RoutesNew.PRIVACY ||
            r == RoutesNew.TERMS
        ) {
            return true
        }
    }
    return false
}

@Composable
fun MainBottomNavHost(
    rootNavController: NavController,
) {
    val mainNavController = rememberNavController()
    val context = LocalContext.current
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
    val drawerProfile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    val attemptsUserKey = remember(drawerProfile.emailLine, drawerProfile.userIdFormatted) {
        drawerProfile.emailLine.ifBlank { drawerProfile.userIdFormatted ?: "guest" }
    }
    val attempts by TestHistoryRepository.observeAttempts(attemptsUserKey).collectAsState(initial = emptyList())
    val pendingResult by AppPreferencesRepository.pendingResultState.collectAsState(initial = null)
    var profileReselectSignal by remember { mutableIntStateOf(0) }
    var lastBackPressAtMs by remember { mutableStateOf(0L) }
    val navBackStackEntry by mainNavController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val isOnHomeRoot = currentDestination?.route == MainTabRoutes.Home
    val pendingPushRoute by PushNavigationBridge.pendingRoute.collectAsState()
    val showTestPendingBlockMessage: (String) -> Unit = { testName ->
        val pending = pendingResult
        if (pending != null && AppPreferencesRepository.isTestBlockedByPendingResult(testName, pending)) {
            val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a")
            val whenText = runCatching {
                formatter.format(Instant.ofEpochMilli(pending.publishAtMillis).atZone(ZoneId.systemDefault()))
            }.getOrDefault("the scheduled time")
            Toast.makeText(
                context,
                "You have successfully submitted ${pending.testName}. Your result will be available on $whenText.",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    fun navigateToQuizWhenAllowed(testName: String) {
        val safeName = testName.trim()
        if (safeName.isBlank()) return
        scope.launch {
            if (!AppPreferencesRepository.canStartTest(safeName, pendingResult)) {
                showTestPendingBlockMessage(safeName)
                return@launch
            }
            val card = runCatching {
                ContentRepository.loadTestByTitle(safeName, allowDefaultFallback = false)
            }.getOrNull()
            if (card != null) {
                val blockMsg = TestScheduleUtils.examJoinBlockMessage(
                    card.examDate,
                    card.slotLabel,
                    card.lateJoinMinutes,
                )
                if (blockMsg != null) {
                    Toast.makeText(context, blockMsg, Toast.LENGTH_LONG).show()
                    return@launch
                }
            }
            val attemptsUsed = TestHistoryRepository.countAttempts(attemptsUserKey, safeName)
            val lastAttemptAt = TestHistoryRepository.lastAttemptAtMillis(attemptsUserKey, safeName)
            val attemptAccess = TestAttemptPolicy.evaluate(
                attemptsAllowed = card?.attemptsAllowedCount ?: 1,
                reattemptCooldownMinutes = card?.reattemptCooldownMinutes ?: 0,
                attemptsUsed = attemptsUsed,
                lastAttemptAtMillis = lastAttemptAt,
            )
            if (!attemptAccess.allowed) {
                Toast.makeText(
                    context,
                    attemptAccess.message ?: "Attempt not allowed for this test",
                    Toast.LENGTH_LONG,
                ).show()
                return@launch
            }
            mainNavController.navigate("${RoutesNew.QUIZ}/$safeName")
        }
    }

    LaunchedEffect(attemptsUserKey, pendingResult?.publishAtMillis, navBackStackEntry?.destination?.id) {
        val pending = pendingResult
        val snap = AppPreferencesRepository.peekValidInProgressQuiz(attemptsUserKey) ?: return@LaunchedEffect
        if (pending != null && AppPreferencesRepository.isTestBlockedByPendingResult(snap.testName, pending)) {
            return@LaunchedEffect
        }
        val card = runCatching {
            ContentRepository.loadTestByTitle(snap.testName.trim(), allowDefaultFallback = false)
        }.getOrNull()
        if (card?.resumeEnabled == false) {
            runCatching { AppPreferencesRepository.clearInProgressQuizNow() }
            return@LaunchedEffect
        }
        val route = navBackStackEntry?.destination?.route.orEmpty()
        val argName = navBackStackEntry?.arguments?.getString("name").orEmpty()
        val quizRoutePattern = "${RoutesNew.QUIZ}/{name}"
        if (route == quizRoutePattern && argName.isNotBlank()) {
            val decoded = runCatching { Uri.decode(argName) }.getOrDefault(argName)
            if (decoded.equals(snap.testName.trim(), ignoreCase = true)) return@LaunchedEffect
        }
        val encoded = Uri.encode(snap.testName.trim(), StandardCharsets.UTF_8.name())
        runCatching {
            mainNavController.navigate("${RoutesNew.QUIZ}/$encoded") {
                launchSingleTop = true
            }
        }.onFailure { e ->
            Log.w("MainBottomNavHost", "resume_quiz_navigate_failed", e)
        }
    }

    val tabs = remember {
        listOf(
            MainTabItem(MainTabRoutes.Home, "Home", Icons.Outlined.Home),
            MainTabItem(MainTabRoutes.Tests, "Tests", Icons.Outlined.Category),
            MainTabItem(MainTabRoutes.News, "News", Icons.Outlined.Article),
            MainTabItem(MainTabRoutes.Profile, "Profile", Icons.Outlined.Person),
        )
    }
    BackHandler(enabled = isOnHomeRoot) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressAtMs < 2000L) {
            (context as? Activity)?.finish()
        } else {
            lastBackPressAtMs = now
            Toast.makeText(context, "Press back again to close app", Toast.LENGTH_SHORT).show()
        }
    }

    val openByPushRoute: (String) -> Unit = { rawRoute ->
        val route = PushRouteNormalizer.normalize(rawRoute).orEmpty()
        if (route.isBlank()) {
            mainNavController.navigate(RoutesNew.NOTIFICATIONS) { launchSingleTop = true }
        } else {
            val lower = route.lowercase()

            fun navigateIfKnownDestination(target: String) {
                val dest = target.trim()
                if (dest.isBlank()) return
                runCatching {
                    mainNavController.navigate(dest) { launchSingleTop = true }
                }.onFailure {
                    // If route isn't registered, fall back to notifications inbox (legacy behavior).
                    mainNavController.navigate(RoutesNew.NOTIFICATIONS) { launchSingleTop = true }
                }
            }

            when {
                lower == "poll" -> mainNavController.navigate(RoutesNew.POLL) { launchSingleTop = true }
                lower == "notifications" || lower == "notification" ->
                    mainNavController.navigate(RoutesNew.NOTIFICATIONS) { launchSingleTop = true }
                lower == "menu_quiz" || lower == "daily" || lower == "daily_quiz" ->
                    mainNavController.navigate(RoutesNew.MENU_QUIZ) { launchSingleTop = true }
                lower == "job_alert" || lower == "jobs" -> mainNavController.navigate(RoutesNew.JOB_ALERT) { launchSingleTop = true }
                lower == "exam_alert" || lower == "exams" -> mainNavController.navigate(RoutesNew.EXAM_ALERT) { launchSingleTop = true }

                // Tab routes (support both shorthand + actual NavHost routes).
                lower == MainTabRoutes.News.lowercase() || lower == "news" -> mainNavController.navigateMainTab(MainTabRoutes.News)
                lower == MainTabRoutes.Tests.lowercase() || lower == "tests" || lower == "main/tests" ->
                    mainNavController.navigateMainTab(MainTabRoutes.Tests)
                lower == MainTabRoutes.Home.lowercase() || lower == "home" || lower == "main/home" ->
                    mainNavController.goToHomeTab()
                lower == MainTabRoutes.Profile.lowercase() || lower == "profile" || lower == "main/profile" ->
                    mainNavController.navigateMainTab(MainTabRoutes.Profile)

                // Deep links to article/detail screens (send these from FCM `data.deepLink`).
                lower.startsWith("${RoutesNew.NEWS_DETAIL.lowercase()}/") -> navigateIfKnownDestination(route)
                lower.startsWith("${RoutesNew.JOB_ALERT_DETAIL.lowercase()}/") -> navigateIfKnownDestination(route)
                lower.startsWith("${RoutesNew.EXAM_ALERT_DETAIL.lowercase()}/") -> navigateIfKnownDestination(route)

                else -> mainNavController.navigate(RoutesNew.NOTIFICATIONS) { launchSingleTop = true }
            }
        }
    }

    LaunchedEffect(pendingPushRoute) {
        val route = pendingPushRoute?.trim().orEmpty()
            .ifBlank { PushNavigationBridge.peek(context).orEmpty() }
        if (route.isBlank()) return@LaunchedEffect
        openByPushRoute(route)
        PushNavigationBridge.consume(context)
    }

    Scaffold(
        containerColor = p.surface,
        bottomBar = {
            val showBottomBar = currentDestination
                ?.hierarchy
                ?.any { d ->
                    d.route == MainTabRoutes.Home ||
                        d.route == MainTabRoutes.Tests ||
                        d.route == MainTabRoutes.News ||
                        d.route == MainTabRoutes.Profile
                } == true ||
                currentDestination?.route == RoutesNew.ACHIEVEMENTS ||
                currentDestination?.route == RoutesNew.PRIVACY ||
                currentDestination?.route == RoutesNew.TERMS ||
                currentDestination?.route == RoutesNew.BOOKMARKS
            if (showBottomBar) {
                NavigationBar(
                    containerColor = p.tabBarContainer,
                    tonalElevation = 10.dp,
                ) {
                    tabs.forEach { tab ->
                        val selected = isMainBottomTabSelected(tab.route, currentDestination)
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (tab.route == MainTabRoutes.Profile && selected) {
                                    val currentRoute = currentDestination?.route.orEmpty()
                                    if (currentRoute == MainTabRoutes.Profile) {
                                        // Re-selecting Profile on profile tab resets inner stack to main screen.
                                        profileReselectSignal++
                                    } else {
                                        // Profile-related screens (achievements/privacy/terms) should return to profile tab.
                                        mainNavController.navigateMainTab(MainTabRoutes.Profile)
                                    }
                                } else if (tab.route == MainTabRoutes.Home) {
                                    mainNavController.goToHomeTab()
                                } else {
                                    mainNavController.navigateMainTab(tab.route)
                                }
                            },
                            icon = {
                                Icon(
                                    imageVector = tab.icon,
                                    contentDescription = tab.label,
                                )
                            },
                            label = {
                                Text(
                                    text = tab.label,
                                    maxLines = 1,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                )
                            },
                            alwaysShowLabel = true,
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = p.tabSelected,
                                selectedTextColor = p.tabSelected,
                                indicatorColor = Color.Transparent,
                                unselectedIconColor = p.tabUnselected,
                                unselectedTextColor = p.tabUnselected,
                            ),
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = mainNavController,
            startDestination = MainTabRoutes.Home,
            modifier = Modifier
                .fillMaxSize()
                .background(p.surface)
                .padding(innerPadding),
            // Default cross-fade briefly shows the activity window (near-white in light theme) between
            // destinations — especially noticeable after closing the drawer then navigating.
            enterTransition = { EnterTransition.None },
            exitTransition = { ExitTransition.None },
            popEnterTransition = { EnterTransition.None },
            popExitTransition = { ExitTransition.None },
        ) {
            composable(MainTabRoutes.Home) {
                HomeRouteNew(
                    onLogout = {
                        scope.launch {
                            AuthRepository.logout()
                            rootNavController.navigate(RoutesNew.AUTH) {
                                popUpTo(RoutesNew.HOME) { inclusive = true }
                                launchSingleTop = true
                            }
                        }
                    },
                    onOpenProfile = {
                        mainNavController.navigateMainTab(MainTabRoutes.Profile)
                    },
                    onOpenHistory = { mainNavController.navigate(RoutesNew.HISTORY) },
                    onOpenActivity = { mainNavController.navigate(RoutesNew.RESULTS_HISTORY) },
                    onOpenCategory = { cat ->
                        mainNavController.navigate("${RoutesNew.APPLY}/$cat")
                    },
                    onSeeAllCategories = {
                        mainNavController.navigateMainTab(MainTabRoutes.Tests)
                    },
                    onStartTest = { testName ->
                        val safeName = testName.trim()
                        val routeName = when {
                            safeName.isBlank() ||
                                safeName.equals("Test", ignoreCase = true) ||
                                safeName.equals("applied", ignoreCase = true) -> "applied"
                            AppPreferencesRepository.canStartTest(safeName, pendingResult) -> safeName
                            else -> "applied"
                        }
                        mainNavController.navigate("${RoutesNew.START_TEST_PREVIEW}/$routeName")
                    },
                    onLeaderboard = { mainNavController.navigate(RoutesNew.LEADERBOARD) },
                    onResults = {
                        val pending = pendingResult
                        if (pending != null) {
                            val safeName = pending.testName.ifBlank { "Test" }
                            mainNavController.navigate(
                                "${RoutesNew.RESULT}/$safeName?answered=${pending.answered}&correct=${pending.correct}&wrong=${pending.wrong}&total=${pending.total}&publishAt=${pending.publishAtMillis}",
                            )
                        } else {
                            val latestAttempt = attempts.maxByOrNull { it.completedAtMillis }
                            if (latestAttempt != null) {
                                val safeName = latestAttempt.testName.ifBlank { "Test" }
                                val total = latestAttempt.total.coerceAtLeast(0)
                                val answered = total
                                val correct = latestAttempt.correct.coerceAtLeast(0).coerceAtMost(answered)
                                val wrong = (answered - correct).coerceAtLeast(0)
                                mainNavController.navigate(
                                    "${RoutesNew.RESULT}/$safeName?answered=$answered&correct=$correct&wrong=$wrong&total=$total&publishAt=0",
                                )
                            } else {
                                Toast.makeText(context, "No attempts yet. Start a test first.", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    onOpenPendingResult = { testName, answered, correct, wrong, total, publishAtMillis ->
                        val safeName = testName.ifBlank { "Test" }
                        mainNavController.navigate(
                            "${RoutesNew.RESULT}/$safeName?answered=$answered&correct=$correct&wrong=$wrong&total=$total&publishAt=$publishAtMillis",
                        )
                    },
                    onBookmarks = { mainNavController.navigate(RoutesNew.BOOKMARKS) },
                    onOpenJobAlert = { mainNavController.navigate(RoutesNew.JOB_ALERT) },
                    onOpenExamAlert = { mainNavController.navigate(RoutesNew.EXAM_ALERT) },
                    onOpenNews = { mainNavController.navigateMainTab(MainTabRoutes.News) },
                    onOpenNewsArticle = { articleId ->
                        mainNavController.navigate("${RoutesNew.NEWS_DETAIL}/$articleId")
                    },
                    onOpenProgressReport = { mainNavController.navigate(RoutesNew.PROGRESS_REPORT) },
                    onOpenDaily = { mainNavController.navigate(RoutesNew.DAILY) },
                    onOpenMenuQuiz = { mainNavController.navigate(RoutesNew.MENU_QUIZ) },
                    onOpenPoll = { mainNavController.navigate(RoutesNew.POLL) },
                    onOpenNotifications = { mainNavController.navigate(RoutesNew.NOTIFICATIONS) },
                )
            }
            composable(MainTabRoutes.Tests) {
                SeeAllCategoriesScreenNew(
                    showAppBarBack = false,
                    onBack = { mainNavController.goToHomeTab() },
                    onOpenCategory = { cat ->
                        mainNavController.navigate("${RoutesNew.APPLY}/$cat")
                    },
                )
            }
            composable(MainTabRoutes.News) {
                BackHandler { mainNavController.goToHomeTab() }
                NewsScreenNew(
                    onBack = { mainNavController.goToHomeTab() },
                    onOpenArticle = { id ->
                        mainNavController.navigate("${RoutesNew.NEWS_DETAIL}/$id")
                    },
                )
            }
            composable(MainTabRoutes.Profile) {
                BackHandler { mainNavController.goToHomeTab() }
                ProfileRouteNew(
                    rootNavController = rootNavController,
                    appNavController = mainNavController,
                    showAppBarBack = false,
                    onBack = { mainNavController.goToHomeTab() },
                    reselectSignal = profileReselectSignal,
                )
            }

            composable(
                route = "${RoutesNew.CATEGORY}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                CategoryRouteNew(
                    category = name.ifBlank { "Category" },
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenSubcategory = { sub ->
                        mainNavController.navigate("${RoutesNew.APPLY}/$sub")
                    },
                )
            }

            composable(
                route = "${RoutesNew.TESTS}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                TestsScreenNew(
                    subcategory = name.ifBlank { "Topic" },
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenTest = { test ->
                        if (!AppPreferencesRepository.canStartTest(test, pendingResult)) {
                            showTestPendingBlockMessage(test)
                            return@TestsScreenNew
                        }
                        scope.launch {
                            val card = runCatching {
                                ContentRepository.loadTestByTitle(test.trim(), allowDefaultFallback = false)
                            }.getOrNull()
                            if (card != null) {
                                val blockMsg = TestScheduleUtils.examJoinBlockMessage(
                                    card.examDate,
                                    card.slotLabel,
                                    card.lateJoinMinutes,
                                )
                                if (blockMsg != null) {
                                    Toast.makeText(context, blockMsg, Toast.LENGTH_LONG).show()
                                    return@launch
                                }
                            }
                            mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/$test")
                        }
                    },
                )
            }

            composable(
                route = "${RoutesNew.START_TEST_PREVIEW}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                StartTestPreviewScreenNew(
                    testName = name.ifBlank { "applied" },
                    onBack = { mainNavController.popBackOrHome() },
                    onStartTest = { selectedTestName ->
                        val safeSelectedName = selectedTestName.ifBlank { name.ifBlank { "applied" } }
                        navigateToQuizWhenAllowed(safeSelectedName)
                    },
                    onApplyForTest = { selectedTestName ->
                        val safeSelectedName = selectedTestName.ifBlank { name.ifBlank { "applied" } }
                        mainNavController.navigate("${RoutesNew.APPLY}/$safeSelectedName")
                    },
                    onBrowseTests = { mainNavController.navigateMainTab(MainTabRoutes.Tests) },
                )
            }

            composable(
                route = "${RoutesNew.INSTRUCTIONS}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                InstructionsScreenNew(
                    testName = name.ifBlank { "Test" },
                    onBack = { mainNavController.popBackOrHome() },
                    onStartTest = {
                        val safeName = name.ifBlank { "Test" }
                        navigateToQuizWhenAllowed(safeName)
                    },
                )
            }

            composable(
                route = "${RoutesNew.QUIZ}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                val decodedQuizName = runCatching { Uri.decode(name) }.getOrDefault(name).ifBlank { "Test" }
                if (!AppPreferencesRepository.canStartTest(decodedQuizName, pendingResult)) {
                    LaunchedEffect(pendingResult?.publishAtMillis, decodedQuizName) {
                        showTestPendingBlockMessage(decodedQuizName)
                        mainNavController.goToHomeTab()
                    }
                    return@composable
                }
                LaunchedEffect(decodedQuizName, attemptsUserKey) {
                    val card = runCatching {
                        ContentRepository.loadTestByTitle(decodedQuizName, allowDefaultFallback = false)
                    }.getOrNull()
                    if (card != null) {
                        val blockMsg = TestScheduleUtils.examJoinBlockMessage(
                            card.examDate,
                            card.slotLabel,
                            card.lateJoinMinutes,
                        )
                        if (blockMsg != null) {
                            Toast.makeText(context, blockMsg, Toast.LENGTH_LONG).show()
                            mainNavController.goToHomeTab()
                            return@LaunchedEffect
                        }
                    }
                    val attemptsUsed = TestHistoryRepository.countAttempts(attemptsUserKey, decodedQuizName)
                    val lastAttemptAt = TestHistoryRepository.lastAttemptAtMillis(attemptsUserKey, decodedQuizName)
                    val attemptAccess = TestAttemptPolicy.evaluate(
                        attemptsAllowed = card?.attemptsAllowedCount ?: 1,
                        reattemptCooldownMinutes = card?.reattemptCooldownMinutes ?: 0,
                        attemptsUsed = attemptsUsed,
                        lastAttemptAtMillis = lastAttemptAt,
                    )
                    if (!attemptAccess.allowed) {
                        Toast.makeText(
                            context,
                            attemptAccess.message ?: "Attempt not allowed for this test",
                            Toast.LENGTH_LONG,
                        ).show()
                        mainNavController.goToHomeTab()
                    }
                }
                QuizScreenNew(
                    testName = decodedQuizName,
                    attemptsUserKey = attemptsUserKey,
                    onBack = { mainNavController.popBackOrHome() },
                    onSubmit = { answered, correct, wrong, total, publishAt ->
                        val attemptsUserKey = drawerProfile.emailLine.ifBlank {
                            drawerProfile.userIdFormatted ?: "guest"
                        }
                        scope.launch {
                            val testTitle = decodedQuizName
                            val catalogId = runCatching {
                                ContentRepository.loadTestByTitle(testTitle)?.id?.trim().orEmpty()
                            }.getOrElse { "" }
                            if (catalogId.isBlank()) {
                                Toast.makeText(context, "Test details missing. Please retry.", Toast.LENGTH_SHORT).show()
                                return@launch
                            }
                            try {
                                TestHistoryRepository.recordAttempt(
                                    userKey = attemptsUserKey,
                                    testName = testTitle,
                                    testCatalogId = catalogId,
                                    correct = correct,
                                    total = total,
                                )
                                AppPreferencesRepository.markPendingResultSubmittedNow(
                                    testName = testTitle,
                                    publishAtMillis = publishAt,
                                    answered = answered,
                                    correct = correct,
                                    wrong = wrong,
                                    total = total,
                                )
                                AppPreferencesRepository.removeAppliedTestSeriesNow(testTitle)
                                mainNavController.goToHomeTab()
                            } catch (e: CancellationException) {
                                throw e
                            } catch (_: Exception) {
                                Toast.makeText(
                                    context,
                                    "Couldn't finish saving your result. Check home or history.",
                                    Toast.LENGTH_LONG,
                                ).show()
                                runCatching { mainNavController.goToHomeTab() }
                            }
                        }
                    },
                )
            }

            composable(
                route = "${RoutesNew.RESULT}/{name}?answered={answered}&correct={correct}&wrong={wrong}&total={total}&publishAt={publishAt}",
                arguments = listOf(
                    navArgument("name") { type = NavType.StringType },
                    navArgument("answered") {
                        type = NavType.IntType
                        defaultValue = 3
                    },
                    navArgument("correct") {
                        type = NavType.IntType
                        defaultValue = 0
                    },
                    navArgument("wrong") {
                        type = NavType.IntType
                        defaultValue = 3
                    },
                    navArgument("total") {
                        type = NavType.IntType
                        defaultValue = 0
                    },
                    navArgument("publishAt") {
                        type = NavType.LongType
                        defaultValue = 0L
                    },
                ),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                val answered = entry.arguments?.getInt("answered") ?: 3
                val correct = entry.arguments?.getInt("correct") ?: 0
                val wrong = entry.arguments?.getInt("wrong") ?: 3
                val total = entry.arguments?.getInt("total") ?: 0
                val publishAt = entry.arguments?.getLong("publishAt") ?: 0L
                ResultScreenNew(
                    testName = name.ifBlank { "Arithmetic Sprint" },
                    scoreText = "-",
                    answered = answered,
                    correct = correct,
                    wrong = wrong,
                    total = total,
                    publishAtMillisOverride = publishAt.takeIf { it > 0L },
                    onGoSubmitApplication = { mainNavController.navigateMainTab(MainTabRoutes.Tests) },
                    onAnswerKey = { mainNavController.navigate("${RoutesNew.ANSWER_KEY}/$name") },
                    onReview = { mainNavController.navigate("${RoutesNew.REVIEW}/$name") },
                )
            }

            composable(
                route = "${RoutesNew.ANSWER_KEY}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                AnswerKeyScreenNew(
                    testName = name.ifBlank { "Test" },
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(
                route = "${RoutesNew.REVIEW}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                ReviewScreenNew(
                    testName = name.ifBlank { "Test" },
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenSolution = { qNo ->
                        mainNavController.navigate("${RoutesNew.REVIEW_SOLUTION}/$name/$qNo")
                    },
                )
            }

            composable(
                route = "${RoutesNew.REVIEW_SOLUTION}/{name}/{qNo}",
                arguments = listOf(
                    navArgument("name") { type = NavType.StringType },
                    navArgument("qNo") { type = NavType.IntType },
                ),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                val qNo = entry.arguments?.getInt("qNo") ?: 1
                ReviewSolutionScreenNew(
                    testName = name.ifBlank { "Test" },
                    questionNo = qNo,
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenQuestion = { nextQ ->
                        if (nextQ != qNo) {
                            val currentRoute = "${RoutesNew.REVIEW_SOLUTION}/$name/$qNo"
                            mainNavController.navigate("${RoutesNew.REVIEW_SOLUTION}/$name/$nextQ") {
                                // Replace current question route so back exits solution screen directly.
                                popUpTo(currentRoute) { inclusive = true }
                                launchSingleTop = true
                            }
                        }
                    },
                )
            }

            composable(RoutesNew.LEADERBOARD) {
                LeaderboardScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.HISTORY) {
                HistoryScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    title = "History",
                )
            }

            composable(RoutesNew.RESULTS_HISTORY) {
                ResultsHistoryScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.BOOKMARKS) {
                BookmarksScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenProfile = { mainNavController.navigateMainTab(MainTabRoutes.Profile) },
                )
            }

            composable(RoutesNew.JOB_ALERT) {
                JobAlertScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenListing = { id ->
                        mainNavController.navigate("${RoutesNew.JOB_ALERT_DETAIL}/$id")
                    },
                )
            }

            composable(
                route = "${RoutesNew.JOB_ALERT_DETAIL}/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                NewsDetailRouteNew(
                    articleId = id,
                    onBack = { mainNavController.popBackOrHome() },
                    imageSeedPrefix = JobAlertFeedImageSeedPrefix,
                )
            }

            composable(RoutesNew.EXAM_ALERT) {
                ExamAlertScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenListing = { id ->
                        mainNavController.navigate("${RoutesNew.EXAM_ALERT_DETAIL}/$id")
                    },
                )
            }

            composable(
                route = "${RoutesNew.EXAM_ALERT_DETAIL}/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                NewsDetailRouteNew(
                    articleId = id,
                    onBack = { mainNavController.popBackOrHome() },
                    imageSeedPrefix = ExamAlertFeedImageSeedPrefix,
                )
            }

            composable(
                route = "${RoutesNew.NEWS_DETAIL}/{newsId}",
                arguments = listOf(navArgument("newsId") { type = NavType.StringType }),
            ) { entry ->
                val id = entry.arguments?.getString("newsId").orEmpty()
                NewsDetailRouteNew(
                    articleId = id,
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.PROGRESS_REPORT) {
                ProgressReportScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    onStartPractice = {
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/Test") {
                            launchSingleTop = true
                        }
                    },
                )
            }

            composable(RoutesNew.DAILY) {
                DailyDigestContentScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.PRIVACY) {
                PrivacyPolicyScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.TERMS) {
                TermsOfServiceScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.ACHIEVEMENTS) {
                AchievementsScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.MENU_QUIZ) {
                DailyDigestScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                )
            }

            composable(RoutesNew.POLL) {
                PollScreenNew(onBack = { mainNavController.popBackOrHome() })
            }

            composable(RoutesNew.NOTIFICATIONS) {
                NotificationsScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenDeepLink = openByPushRoute,
                )
            }

            composable(RoutesNew.SEE_ALL_CATEGORIES) {
                SeeAllCategoriesScreenNew(
                    onBack = { mainNavController.popBackOrHome() },
                    onOpenCategory = { cat ->
                        mainNavController.navigate("${RoutesNew.APPLY}/$cat")
                    },
                )
            }

            composable(
                route = "${RoutesNew.APPLY}/{title}",
                arguments = listOf(navArgument("title") { type = NavType.StringType }),
            ) { entry ->
                val title = entry.arguments?.getString("title").orEmpty()
                ApplyForTestScreenNew(
                    title = title,
                    onBack = { mainNavController.popBackStack() },
                    onSubmit = { mainNavController.popBackStack() },
                )
            }
        }
    }
}
