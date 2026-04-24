package com.example.mocktestapp.newui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

private data class DynamicProfileMenuItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val path: String,
    val enabled: Boolean,
)

private fun defaultDynamicProfileMenuItems() = listOf(
    DynamicProfileMenuItem("edit-username", "Username", "{value}", "/edit-username", true),
    DynamicProfileMenuItem("edit-email", "Email", "{value}", "/edit-email", true),
    DynamicProfileMenuItem("edit-mobile", "Mobile number", "{value}", "/edit-mobile", true),
    DynamicProfileMenuItem("edit-gender", "Gender", "{value}", "/edit-gender", true),
    DynamicProfileMenuItem("edit-password", "Password", "Change password (current + new + confirm)", "/edit-password", true),
    DynamicProfileMenuItem("verify-email", "Email verification", "Not verified", "/verify-email", true),
    DynamicProfileMenuItem("verify-phone", "Phone verification", "Not verified", "/verify-phone", true),
    DynamicProfileMenuItem("notifications", "Notifications", "Notification settings (on/off)", "/notifications", true),
    DynamicProfileMenuItem("help-support", "Help & support", "Need help? Open support page", "/help-support", true),
    DynamicProfileMenuItem("feedback", "Feedback", "Share your app feedback", "/feedback", true),
    DynamicProfileMenuItem("report-issue", "Report issue", "Report a bug or problem", "/report-issue", true),
    DynamicProfileMenuItem("achievement", "Achievements", "Streaks, badges, full marks", "/achievement", true),
    DynamicProfileMenuItem("privacy-policy", "Privacy policy", "How data is handled", "/privacy-policy", true),
    DynamicProfileMenuItem("terms-of-use", "Terms of use", "Conditions of use", "/terms-of-use", true),
    DynamicProfileMenuItem("export-data", "Export my data", "JSON snapshot via share sheet", "/export-data", true),
    DynamicProfileMenuItem("logout", "Log out", "Sign out on this device (keeps local practice history)", "/logout", true),
    DynamicProfileMenuItem("delete-account", "Delete account", "Removes your account on the server and clears this device", "/delete-account", true),
)

@Composable
fun ProfileScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    showAppBarBack: Boolean = true,
    onEditUsername: () -> Unit,
    onEditEmail: () -> Unit,
    onEditMobile: () -> Unit,
    onEditGender: () -> Unit,
    onEditPassword: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenHelpSupport: () -> Unit,
    onOpenFeedback: () -> Unit,
    onOpenReportIssue: () -> Unit,
    onOpenAchievements: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenTerms: () -> Unit,
    onExportData: () -> Unit,
    onLogout: () -> Unit,
    onDeleteAccount: () -> Unit,
    onSendEmailVerification: () -> Unit,
    onSendPhoneVerification: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val scroll = rememberScrollState()
    val emailOk by AppPreferencesRepository.emailVerified.collectAsState(initial = false)
    val phoneOk by AppPreferencesRepository.phoneVerified.collectAsState(initial = false)
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", ""),
    )
    var menuItems by remember { mutableStateOf(defaultDynamicProfileMenuItems()) }

    LaunchedEffect(Unit) {
        val remote = ContentRepository.loadProfileMenuItems()
        if (remote.isNotEmpty()) {
            menuItems = remote.map {
                DynamicProfileMenuItem(
                    id = it.id,
                    title = it.title,
                    subtitle = it.subtitle,
                    path = it.path,
                    enabled = it.enabled,
                )
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(bg)
            .verticalScroll(scroll)
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (showAppBarBack) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(6.dp))
            } else {
                Spacer(Modifier.width(4.dp))
            }
            Text(
                text = "Profile / Settings",
                color = p.textPrimary,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }

        Spacer(Modifier.height(12.dp))

        val shape = RoundedCornerShape(18.dp)
        val visibleItems = menuItems.filter { it.enabled }

        SettingsCard(
            shape = shape,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 8.dp),
            ) {
                visibleItems.forEachIndexed { index, item ->
                    val resolvedSubtitle = when (item.path) {
                        "/edit-username" -> item.subtitle.replace("{value}", profile.displayName.ifBlank { "Tap to set" })
                        "/edit-email" -> item.subtitle.replace("{value}", profile.email.ifBlank { "Tap to set" })
                        "/edit-mobile" -> item.subtitle.replace("{value}", profile.mobile.ifBlank { "Tap to set" })
                        "/edit-gender" -> item.subtitle.replace("{value}", profile.gender.ifBlank { "Tap to set" })
                        "/verify-email" -> if (emailOk) "Verified" else if (item.subtitle.isBlank()) "Not verified — tap to send OTP" else item.subtitle
                        "/verify-phone" -> if (phoneOk) "Verified (demo)" else if (item.subtitle.isBlank()) "Not verified — tap to simulate send" else item.subtitle
                        else -> item.subtitle
                    }.ifBlank { "Tap to open" }
                    val onClick = when (item.path) {
                        "/edit-username" -> onEditUsername
                        "/edit-email" -> onEditEmail
                        "/edit-mobile" -> onEditMobile
                        "/edit-gender" -> onEditGender
                        "/edit-password" -> onEditPassword
                        "/verify-email" -> onSendEmailVerification
                        "/verify-phone" -> onSendPhoneVerification
                        "/notifications" -> onOpenNotifications
                        "/help-support" -> onOpenHelpSupport
                        "/feedback" -> onOpenFeedback
                        "/report-issue" -> onOpenReportIssue
                        "/achievement" -> onOpenAchievements
                        "/privacy-policy" -> onOpenPrivacy
                        "/terms-of-use" -> onOpenTerms
                        "/export-data" -> onExportData
                        "/logout" -> onLogout
                        "/delete-account" -> onDeleteAccount
                        else -> ({})
                    }
                    ProfileNavRow(
                        title = item.title,
                        subtitle = resolvedSubtitle,
                        onClick = onClick,
                        danger = item.path == "/delete-account",
                    )
                    if (index < visibleItems.lastIndex) DividerLine()
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SettingsCard(
    shape: RoundedCornerShape,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val p = mockTestPalette()
    Card(
        modifier = modifier
            .clip(shape)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            content()
        }
    }
}

@Composable
private fun DividerLine() {
    val p = mockTestPalette()
    Spacer(Modifier.height(1.dp))
    Spacer(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(p.border.copy(alpha = 0.12f)),
    )
}

@Composable
private fun ProfileNavRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    danger: Boolean = false,
) {
    val p = mockTestPalette()
    val titleColor = if (danger) p.error else p.textPrimary
    val subColor = if (danger) p.error.copy(alpha = 0.85f) else p.textSecondary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                text = subtitle,
                color = subColor,
                fontSize = 13.sp,
                lineHeight = 17.sp,
            )
        }
        Icon(
            imageVector = Icons.Rounded.ChevronRight,
            contentDescription = null,
            tint = p.textSecondary,
            modifier = Modifier.size(22.dp),
        )
    }
}
