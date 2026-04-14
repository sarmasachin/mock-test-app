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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

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

        SettingsCard(
            shape = shape,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 8.dp),
            ) {
                Text(
                    text = "Account details",
                    color = p.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                ProfileNavRow(
                    title = "Username",
                    subtitle = profile.displayName.ifBlank { "Tap to set" },
                    onClick = onEditUsername,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Email",
                    subtitle = profile.email.ifBlank { "Tap to set" },
                    onClick = onEditEmail,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Mobile number",
                    subtitle = profile.mobile.ifBlank { "Tap to set" },
                    onClick = onEditMobile,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Gender",
                    subtitle = profile.gender.ifBlank { "Tap to set" },
                    onClick = onEditGender,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Password",
                    subtitle = "Change password (current + new + confirm)",
                    onClick = onEditPassword,
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        SettingsCard(
            shape = shape,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 8.dp),
            ) {
                ProfileNavRow(
                    title = "Email verification",
                    subtitle = if (emailOk) "Verified (demo)" else "Not verified — tap to simulate send",
                    onClick = onSendEmailVerification,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Phone verification",
                    subtitle = if (phoneOk) "Verified (demo)" else "Not verified — tap to simulate send",
                    onClick = onSendPhoneVerification,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Notifications",
                    subtitle = "Notification settings (on/off)",
                    onClick = onOpenNotifications,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Help & support",
                    subtitle = "Need help? Open support page",
                    onClick = onOpenHelpSupport,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Feedback",
                    subtitle = "Share your app feedback",
                    onClick = onOpenFeedback,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Report issue",
                    subtitle = "Report a bug or problem",
                    onClick = onOpenReportIssue,
                )
                DividerLine()
                ProfileNavRow(title = "Achievements", subtitle = "Streaks, badges, full marks", onClick = onOpenAchievements)
                DividerLine()
                ProfileNavRow(title = "Privacy policy", subtitle = "How data is handled", onClick = onOpenPrivacy)
                DividerLine()
                ProfileNavRow(title = "Terms of use", subtitle = "Conditions of use", onClick = onOpenTerms)
                DividerLine()
                ProfileNavRow(title = "Export my data", subtitle = "JSON snapshot via share sheet", onClick = onExportData)
                DividerLine()
                ProfileNavRow(
                    title = "Log out",
                    subtitle = "Sign out on this device (keeps local practice history)",
                    onClick = onLogout,
                )
                DividerLine()
                ProfileNavRow(
                    title = "Delete account",
                    subtitle = "Removes your account on the server and clears this device",
                    onClick = onDeleteAccount,
                    danger = true,
                )
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
