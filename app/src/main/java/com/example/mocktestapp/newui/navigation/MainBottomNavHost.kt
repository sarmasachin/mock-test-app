package com.example.mocktestapp.newui.navigation

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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.newui.alerts.ExamAlertFeedImageSeedPrefix
import com.example.mocktestapp.newui.alerts.ExamAlertScreenNew
import com.example.mocktestapp.newui.alerts.JobAlertFeedImageSeedPrefix
import com.example.mocktestapp.newui.alerts.JobAlertScreenNew
import com.example.mocktestapp.newui.achievements.AchievementsScreenNew
import com.example.mocktestapp.newui.apply.ApplyForTestScreenNew
import com.example.mocktestapp.newui.bookmarks.BookmarksScreenNew
import com.example.mocktestapp.newui.category.CategoryRouteNew
import com.example.mocktestapp.newui.digest.DailyDigestScreenNew
import com.example.mocktestapp.newui.digest.DailyDigestContentScreenNew
import com.example.mocktestapp.newui.history.HistoryScreenNew
import com.example.mocktestapp.newui.history.ResultsHistoryScreenNew
import com.example.mocktestapp.newui.home.HomeRouteNew
import com.example.mocktestapp.newui.home.SeeAllCategoriesScreenNew
import com.example.mocktestapp.newui.instructions.InstructionsScreenNew
import com.example.mocktestapp.newui.leaderboard.LeaderboardScreenNew
import com.example.mocktestapp.newui.legal.PrivacyPolicyScreenNew
import com.example.mocktestapp.newui.legal.TermsOfServiceScreenNew
import com.example.mocktestapp.newui.menu.NotificationsScreenNew
import com.example.mocktestapp.newui.menu.PollScreenNew
import com.example.mocktestapp.newui.news.NewsDetailRouteNew
import com.example.mocktestapp.newui.news.NewsScreenNew
import com.example.mocktestapp.newui.profile.ProfileRouteNew
import com.example.mocktestapp.newui.progress.ProgressReportScreenNew
import com.example.mocktestapp.newui.quiz.QuizScreenNew
import com.example.mocktestapp.newui.result.AnswerKeyScreenNew
import com.example.mocktestapp.newui.result.ResultScreenNew
import com.example.mocktestapp.newui.result.ReviewScreenNew
import com.example.mocktestapp.newui.result.ReviewSolutionScreenNew
import com.example.mocktestapp.newui.tests.StartTestPreviewScreenNew
import com.example.mocktestapp.newui.tests.TestsScreenNew
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.launch

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
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
    val drawerProfile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    var profileReselectSignal by remember { mutableIntStateOf(0) }

    val tabs = remember {
        listOf(
            MainTabItem(MainTabRoutes.Home, "Home", Icons.Outlined.Home),
            MainTabItem(MainTabRoutes.Tests, "Tests", Icons.Outlined.Category),
            MainTabItem(MainTabRoutes.News, "News", Icons.Outlined.Article),
            MainTabItem(MainTabRoutes.Profile, "Profile", Icons.Outlined.Person),
        )
    }

    Scaffold(
        containerColor = p.surface,
        bottomBar = {
            val navBackStackEntry by mainNavController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination
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
                currentDestination?.route == RoutesNew.TERMS
            if (showBottomBar) {
                NavigationBar(
                    containerColor = p.surface,
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
                                selectedIconColor = Color.Black,
                                selectedTextColor = Color.Black,
                                indicatorColor = Color.Transparent,
                                unselectedIconColor = p.textSecondary,
                                unselectedTextColor = p.textSecondary,
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
                        val safeName = testName.ifBlank { "bsc nursing moc test" }
                        mainNavController.navigate("${RoutesNew.START_TEST_PREVIEW}/$safeName")
                    },
                    onLeaderboard = { mainNavController.navigate(RoutesNew.LEADERBOARD) },
                    onResults = {
                        mainNavController.navigate(
                            "${RoutesNew.RESULT}/Latest Test?answered=0&correct=0&wrong=0",
                        )
                    },
                    onOpenPendingResult = { testName, answered, correct, wrong ->
                        val safeName = testName.ifBlank { "Test" }
                        mainNavController.navigate(
                            "${RoutesNew.RESULT}/$safeName?answered=$answered&correct=$correct&wrong=$wrong",
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
                BackHandler { mainNavController.goToHomeTab() }
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
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/$test")
                    },
                )
            }

            composable(
                route = "${RoutesNew.START_TEST_PREVIEW}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                StartTestPreviewScreenNew(
                    testName = name.ifBlank { "bsc nursing moc test" },
                    onBack = { mainNavController.popBackOrHome() },
                    onStartTest = { mainNavController.navigate("${RoutesNew.QUIZ}/$name") },
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
                    onStartTest = { mainNavController.navigate("${RoutesNew.QUIZ}/$name") },
                )
            }

            composable(
                route = "${RoutesNew.QUIZ}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                QuizScreenNew(
                    testName = name.ifBlank { "bsc nursing moc test" },
                    onBack = { mainNavController.popBackOrHome() },
                    onSubmit = { answered, correct, wrong, publishAt ->
                        val attemptsUserKey = drawerProfile.emailLine.ifBlank {
                            drawerProfile.userIdFormatted ?: "guest"
                        }
                        scope.launch {
                            TestHistoryRepository.recordAttempt(
                                userKey = attemptsUserKey,
                                testName = name.ifBlank { "Test" },
                                correct = correct,
                                total = 10,
                            )
                        }
                        AppPreferencesRepository.markPendingResultSubmitted(
                            testName = name.ifBlank { "Test" },
                            publishAtMillis = publishAt,
                            answered = answered,
                            correct = correct,
                            wrong = wrong,
                        )
                        mainNavController.goToHomeTab()
                    },
                )
            }

            composable(
                route = "${RoutesNew.RESULT}/{name}?answered={answered}&correct={correct}&wrong={wrong}",
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
                ),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                val answered = entry.arguments?.getInt("answered") ?: 3
                val correct = entry.arguments?.getInt("correct") ?: 0
                val wrong = entry.arguments?.getInt("wrong") ?: 3
                val total = 10
                ResultScreenNew(
                    testName = name.ifBlank { "Arithmetic Sprint" },
                    scoreText = "$correct / $total",
                    answered = answered,
                    correct = correct,
                    wrong = wrong,
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
                            mainNavController.navigate("${RoutesNew.REVIEW_SOLUTION}/$name/$nextQ")
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
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/bsc nursing moc test") {
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
                NotificationsScreenNew(onBack = { mainNavController.popBackOrHome() })
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
                    onBack = { mainNavController.popBackOrHome() },
                    onSubmit = { mainNavController.popBackOrHome() },
                )
            }
        }
    }
}
