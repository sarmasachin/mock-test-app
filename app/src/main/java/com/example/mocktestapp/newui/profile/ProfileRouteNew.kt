package com.example.mocktestapp.newui.profile

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.NavController
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.newui.components.AppSnackbarHostNew
import com.example.mocktestapp.newui.components.rememberAppSnackbarHostStateNew
import com.example.mocktestapp.newui.components.showError
import com.example.mocktestapp.newui.components.showSuccess
import com.example.mocktestapp.newui.navigation.RoutesNew
import kotlinx.coroutines.launch
import java.io.File

private object ProfileInnerRoutes {
    const val MAIN = "profile_main"
    const val USERNAME = "profile_edit_username"
    const val EMAIL = "profile_edit_email"
    const val EMAIL_VERIFY = "profile_email_verify"
    const val MOBILE = "profile_edit_mobile"
    const val GENDER = "profile_edit_gender"
    const val PASSWORD = "profile_edit_password"
    const val NOTIFICATIONS = "profile_notifications"
    const val HELP_SUPPORT = "profile_help_support"
    const val FEEDBACK = "profile_feedback"
    const val REPORT_ISSUE = "profile_report_issue"
}

@Composable
fun ProfileRouteNew(
    rootNavController: NavController,
    appNavController: NavController,
    onBack: () -> Unit,
    showAppBarBack: Boolean = true,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = rememberAppSnackbarHostStateNew()
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    val innerNav = rememberNavController()

    BackHandler(enabled = innerNav.previousBackStackEntry != null) {
        innerNav.popBackStack()
    }

    val onEditSuccess: (String) -> Unit = { msg ->
        scope.launch {
            snackbar.showSuccess(msg)
            innerNav.popBackStack()
        }
    }
    val onEditError: (String) -> Unit = { msg ->
        scope.launch { snackbar.showError(msg) }
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        snackbarHost = { AppSnackbarHostNew(state = snackbar) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            NavHost(
                navController = innerNav,
                startDestination = ProfileInnerRoutes.MAIN,
                modifier = Modifier.fillMaxSize(),
            ) {
                composable(ProfileInnerRoutes.MAIN) {
                    ProfileScreenNew(
                        onBack = onBack,
                        showAppBarBack = showAppBarBack,
                        onEditUsername = { innerNav.navigate(ProfileInnerRoutes.USERNAME) },
                        onEditEmail = { innerNav.navigate(ProfileInnerRoutes.EMAIL) },
                        onEditMobile = { innerNav.navigate(ProfileInnerRoutes.MOBILE) },
                        onEditGender = { innerNav.navigate(ProfileInnerRoutes.GENDER) },
                        onEditPassword = { innerNav.navigate(ProfileInnerRoutes.PASSWORD) },
                        onOpenNotifications = { innerNav.navigate(ProfileInnerRoutes.NOTIFICATIONS) },
                        onOpenHelpSupport = { innerNav.navigate(ProfileInnerRoutes.HELP_SUPPORT) },
                        onOpenFeedback = { innerNav.navigate(ProfileInnerRoutes.FEEDBACK) },
                        onOpenReportIssue = { innerNav.navigate(ProfileInnerRoutes.REPORT_ISSUE) },
                        onOpenAchievements = { appNavController.navigate(RoutesNew.ACHIEVEMENTS) },
                        onOpenPrivacy = { appNavController.navigate(RoutesNew.PRIVACY) },
                        onOpenTerms = { appNavController.navigate(RoutesNew.TERMS) },
                        onExportData = {
                            scope.launch {
                                try {
                                    val json = AppPreferencesRepository.exportSnapshotJson()
                                    val file = File(
                                        context.cacheDir,
                                        "mocktest_export_${System.currentTimeMillis()}.json",
                                    )
                                    file.writeText(json)
                                    val uri = FileProvider.getUriForFile(
                                        context,
                                        "${context.packageName}.fileprovider",
                                        file,
                                    )
                                    val send = Intent(Intent.ACTION_SEND).apply {
                                        type = "application/json"
                                        putExtra(Intent.EXTRA_STREAM, uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    }
                                    context.startActivity(Intent.createChooser(send, "Export data"))
                                } catch (e: Exception) {
                                    snackbar.showError("Export failed: ${e.message ?: "unknown error"}")
                                }
                            }
                        },
                        onLogout = { showLogoutDialog = true },
                        onDeleteAccount = { showDeleteDialog = true },
                        onSendEmailVerification = { innerNav.navigate(ProfileInnerRoutes.EMAIL_VERIFY) },
                        onSendPhoneVerification = {
                            scope.launch {
                                snackbar.showSuccess("Demo: SMS OTP sent (connect backend).")
                                AppPreferencesRepository.setPhoneVerified(true)
                            }
                        },
                    )
                }
                composable(ProfileInnerRoutes.USERNAME) {
                    ProfileEditUsernameScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.EMAIL) {
                    ProfileEditEmailScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.EMAIL_VERIFY) {
                    ProfileEmailVerificationScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.MOBILE) {
                    ProfileEditMobileScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.GENDER) {
                    ProfileEditGenderScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.PASSWORD) {
                    ProfileEditPasswordScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.NOTIFICATIONS) {
                    ProfileNotificationsScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.HELP_SUPPORT) {
                    ProfileHelpSupportScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.FEEDBACK) {
                    ProfileFeedbackScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
                composable(ProfileInnerRoutes.REPORT_ISSUE) {
                    ProfileReportIssueScreen(
                        onBack = { innerNav.popBackStack() },
                    )
                }
            }
        }
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Log out?") },
            text = {
                Text(
                    "You will need to sign in again. Local practice test history on this device is kept.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            showLogoutDialog = false
                            AuthRepository.logout().fold(
                                onSuccess = {
                                    rootNavController.navigate(RoutesNew.AUTH) {
                                        popUpTo(RoutesNew.HOME) { inclusive = true }
                                        launchSingleTop = true
                                    }
                                },
                                onFailure = { e ->
                                    snackbar.showError(e.message ?: "Could not log out")
                                },
                            )
                        }
                    },
                ) {
                    Text("Log out")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete account?") },
            text = {
                Text(
                    "This calls DELETE on the server (permanent) and clears preferences and local history on this device.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            showDeleteDialog = false
                            AuthRepository.deleteAccountOnServer().fold(
                                onSuccess = {
                                    AuthRepository.clearSession()
                                    val cleared = AppPreferencesRepository.clearAllLocalPreferences()
                                    TestHistoryRepository.clearAll()
                                    if (!cleared) {
                                        snackbar.showError("Could not clear all preferences.")
                                    }
                                    rootNavController.navigate(RoutesNew.AUTH) {
                                        popUpTo(RoutesNew.HOME) { inclusive = true }
                                        launchSingleTop = true
                                    }
                                },
                                onFailure = { e ->
                                    snackbar.showError(e.message ?: "Could not delete account")
                                },
                            )
                        }
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}
