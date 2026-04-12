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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import com.example.mocktestapp.newui.alerts.ExamAlertFeedImageSeedPrefix
import com.example.mocktestapp.newui.alerts.ExamAlertScreenNew
import com.example.mocktestapp.newui.alerts.JobAlertFeedImageSeedPrefix
import com.example.mocktestapp.newui.alerts.JobAlertScreenNew
import com.example.mocktestapp.newui.achievements.AchievementsScreenNew
import com.example.mocktestapp.newui.apply.ApplyForTestScreenNew
import com.example.mocktestapp.newui.bookmarks.BookmarksScreenNew
import com.example.mocktestapp.newui.category.CategoryRouteNew
import com.example.mocktestapp.newui.category.SubcategoryDetailScreenNew
import com.example.mocktestapp.newui.digest.DailyDigestScreenNew
import com.example.mocktestapp.newui.history.HistoryScreenNew
import com.example.mocktestapp.newui.history.ResultsHistoryScreenNew
import com.example.mocktestapp.newui.home.HomeRouteNew
import com.example.mocktestapp.newui.home.SeeAllCategoriesScreenNew
import com.example.mocktestapp.newui.instructions.InstructionsScreenNew
import com.example.mocktestapp.newui.leaderboard.LeaderboardScreenNew
import com.example.mocktestapp.newui.legal.PrivacyPolicyScreenNew
import com.example.mocktestapp.newui.legal.TermsOfServiceScreenNew
import com.example.mocktestapp.newui.menu.DrawerMenuFeatureScreenNew
import com.example.mocktestapp.newui.news.NewsDetailRouteNew
import com.example.mocktestapp.newui.news.NewsScreenNew
import com.example.mocktestapp.newui.profile.ProfileRouteNew
import com.example.mocktestapp.newui.progress.ProgressReportScreenNew
import com.example.mocktestapp.newui.quiz.QuizScreenNew
import com.example.mocktestapp.newui.result.AnswerKeyScreenNew
import com.example.mocktestapp.newui.result.ResultScreenNew
import com.example.mocktestapp.newui.result.ReviewScreenNew
import com.example.mocktestapp.newui.tests.TestsScreenNew
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

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
    return false
}

@Composable
fun MainBottomNavHost(
    rootNavController: NavController,
) {
    val mainNavController = rememberNavController()
    val p = mockTestPalette()

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
            NavigationBar(
                containerColor = p.surface,
                tonalElevation = 10.dp,
            ) {
                tabs.forEach { tab ->
                    val selected = isMainBottomTabSelected(tab.route, currentDestination)
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            if (tab.route == MainTabRoutes.Home) {
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
                        rootNavController.navigate(RoutesNew.AUTH) {
                            popUpTo(RoutesNew.HOME) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                    onOpenProfile = {
                        mainNavController.navigateMainTab(MainTabRoutes.Profile)
                    },
                    onOpenHistory = { mainNavController.navigate(RoutesNew.HISTORY) },
                    onOpenActivity = { mainNavController.navigate(RoutesNew.RESULTS_HISTORY) },
                    onOpenCategory = { cat ->
                        mainNavController.navigate("${RoutesNew.CATEGORY}/$cat")
                    },
                    onSeeAllCategories = {
                        mainNavController.navigateMainTab(MainTabRoutes.Tests)
                    },
                    onStartTest = {
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/bsc nursing moc test")
                    },
                    onLeaderboard = { mainNavController.navigate(RoutesNew.LEADERBOARD) },
                    onResults = {
                        mainNavController.navigate(RoutesNew.RESULTS_HISTORY)
                    },
                    onBookmarks = { mainNavController.navigate(RoutesNew.BOOKMARKS) },
                    onOpenJobAlert = { mainNavController.navigate(RoutesNew.JOB_ALERT) },
                    onOpenExamAlert = { mainNavController.navigate(RoutesNew.EXAM_ALERT) },
                    onOpenNews = { mainNavController.navigateMainTab(MainTabRoutes.News) },
                    onOpenProgressReport = { mainNavController.navigate(RoutesNew.PROGRESS_REPORT) },
                    onOpenDaily = { mainNavController.navigate(RoutesNew.DAILY) },
                    onOpenMenuQuiz = { mainNavController.navigate(RoutesNew.MENU_QUIZ) },
                )
            }
            composable(MainTabRoutes.Tests) {
                BackHandler { mainNavController.goToHomeTab() }
                SeeAllCategoriesScreenNew(
                    showAppBarBack = false,
                    onBack = { mainNavController.goToHomeTab() },
                    onOpenCategory = { cat ->
                        mainNavController.navigate("${RoutesNew.CATEGORY}/$cat")
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
                )
            }

            composable(
                route = "${RoutesNew.CATEGORY}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                CategoryRouteNew(
                    category = name.ifBlank { "Category" },
                    onBack = { mainNavController.popBackStack() },
                    onOpenSubcategory = { sub ->
                        mainNavController.navigate("${RoutesNew.SUBCATEGORY}/$sub")
                    },
                )
            }

            composable(
                route = "${RoutesNew.SUBCATEGORY}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                SubcategoryDetailScreenNew(
                    title = name.ifBlank { "Topic" },
                    onBack = { mainNavController.popBackStack() },
                    onApplyForTest = {
                        mainNavController.navigate("${RoutesNew.APPLY}/${name.ifBlank { "Test" }}")
                    },
                    onViewTests = { mainNavController.navigate("${RoutesNew.TESTS}/$name") },
                )
            }

            composable(
                route = "${RoutesNew.TESTS}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                TestsScreenNew(
                    subcategory = name.ifBlank { "Topic" },
                    onBack = { mainNavController.popBackStack() },
                    onOpenTest = { test ->
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/$test")
                    },
                )
            }

            composable(
                route = "${RoutesNew.INSTRUCTIONS}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                InstructionsScreenNew(
                    testName = name.ifBlank { "Test" },
                    onBack = { mainNavController.popBackStack() },
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
                    onBack = { mainNavController.popBackStack() },
                    onSubmit = { mainNavController.navigate("${RoutesNew.RESULT}/$name") },
                )
            }

            composable(
                route = "${RoutesNew.RESULT}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                ResultScreenNew(
                    testName = name.ifBlank { "Arithmetic Sprint" },
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
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(
                route = "${RoutesNew.REVIEW}/{name}",
                arguments = listOf(navArgument("name") { type = NavType.StringType }),
            ) { entry ->
                val name = entry.arguments?.getString("name").orEmpty()
                ReviewScreenNew(
                    testName = name.ifBlank { "Test" },
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.LEADERBOARD) {
                LeaderboardScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.HISTORY) {
                HistoryScreenNew(
                    onBack = { mainNavController.popBackStack() },
                    title = "History",
                )
            }

            composable(RoutesNew.RESULTS_HISTORY) {
                ResultsHistoryScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.BOOKMARKS) {
                BookmarksScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.JOB_ALERT) {
                JobAlertScreenNew(
                    onBack = { mainNavController.popBackStack() },
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
                    onBack = { mainNavController.popBackStack() },
                    imageSeedPrefix = JobAlertFeedImageSeedPrefix,
                )
            }

            composable(RoutesNew.EXAM_ALERT) {
                ExamAlertScreenNew(
                    onBack = { mainNavController.popBackStack() },
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
                    onBack = { mainNavController.popBackStack() },
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
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.PROGRESS_REPORT) {
                ProgressReportScreenNew(
                    onBack = { mainNavController.popBackStack() },
                    onStartPractice = {
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/bsc nursing moc test") {
                            launchSingleTop = true
                        }
                    },
                )
            }

            composable(RoutesNew.DAILY) {
                DailyDigestScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.PRIVACY) {
                PrivacyPolicyScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.TERMS) {
                TermsOfServiceScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.ACHIEVEMENTS) {
                AchievementsScreenNew(
                    onBack = { mainNavController.popBackStack() },
                )
            }

            composable(RoutesNew.MENU_QUIZ) {
                DrawerMenuFeatureScreenNew(
                    title = "Quiz",
                    description = "Quick practice and topic-wise quizzes. Use the button below to open the existing quiz flow (demo test).",
                    onBack = { mainNavController.popBackStack() },
                    primaryButtonLabel = "Start practice quiz",
                    onPrimaryButtonClick = {
                        mainNavController.navigate("${RoutesNew.INSTRUCTIONS}/Daily practice quiz") {
                            launchSingleTop = true
                        }
                    },
                )
            }

            composable(RoutesNew.SEE_ALL_CATEGORIES) {
                SeeAllCategoriesScreenNew(
                    onBack = { mainNavController.popBackStack() },
                    onOpenCategory = { cat ->
                        mainNavController.navigate("${RoutesNew.CATEGORY}/$cat")
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
