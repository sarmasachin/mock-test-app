package com.freemocktest.app.newui.profile

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.util.UserInterestUtils
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.material3.CircularProgressIndicator
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.map

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
    DynamicProfileMenuItem("edit-dob", "Date of birth", "{value}", "/edit-dob", true),
    DynamicProfileMenuItem("edit-gender", "Gender", "{value}", "/edit-gender", true),
    DynamicProfileMenuItem("edit-interests", "My interest", "{value}", "/edit-interests", true),
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

/** Keep interests menu label consistent even when remote config uses legacy Hindi title. */
private fun normalizeProfileMenuItemTitles(
    items: List<DynamicProfileMenuItem>,
): List<DynamicProfileMenuItem> =
    items.map { item ->
        if (item.path == "/edit-interests") item.copy(title = "My interest") else item
    }

/** When remote profile menu omits `/edit-interests`, insert after gender. */
private fun mergeRemoteMenuWithInterestsIfMissing(
    mapped: List<DynamicProfileMenuItem>,
): List<DynamicProfileMenuItem> {
    if (mapped.any { it.path == "/edit-interests" }) return mapped
    val interestsItem = DynamicProfileMenuItem(
        id = "edit-interests",
        title = "My interest",
        subtitle = "{value}",
        path = "/edit-interests",
        enabled = true,
    )
    val iGender = mapped.indexOfFirst { it.path == "/edit-gender" }
    val insertAt = if (iGender >= 0) iGender + 1 else {
        val iDob = mapped.indexOfFirst { it.path == "/edit-dob" }
        if (iDob >= 0) iDob + 1 else mapped.size
    }
    val out = mapped.toMutableList()
    out.add(insertAt.coerceIn(0, out.size), interestsItem)
    return out
}

/** When remote profile menu omits `/edit-dob`, insert it next to other identity fields — not at the list tail. */
private fun mergeRemoteMenuWithDobIfMissing(
    mapped: List<DynamicProfileMenuItem>,
): List<DynamicProfileMenuItem> {
    if (mapped.any { it.path == "/edit-dob" }) return mapped
    val dobItem = DynamicProfileMenuItem(
        id = "edit-dob",
        title = "Date of birth",
        subtitle = "{value}",
        path = "/edit-dob",
        enabled = true,
    )
    val iMobile = mapped.indexOfFirst { it.path == "/edit-mobile" }
    val insertAt = when {
        iMobile >= 0 -> iMobile + 1
        else -> {
            val iGender = mapped.indexOfFirst { it.path == "/edit-gender" }
            if (iGender >= 0) iGender else mapped.size
        }
    }
    val out = mapped.toMutableList()
    val safeIndex = insertAt.coerceIn(0, out.size)
    out.add(safeIndex, dobItem)
    return out
}

private fun formatDobForUi(iso: String): String {
    val raw = iso.trim()
    if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) return raw
    return try {
        LocalDate.parse(raw).format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))
    } catch (_: DateTimeParseException) {
        raw
    }
}

@Composable
fun ProfileScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    showAppBarBack: Boolean = true,
    onEditUsername: () -> Unit,
    onEditEmail: () -> Unit,
    onEditMobile: () -> Unit,
    onEditDob: () -> Unit,
    onEditGender: () -> Unit,
    onEditInterests: () -> Unit,
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
    val userInterests by AppPreferencesRepository.loginPickedSubcategories.collectAsState(initial = emptyList())
    // Avoid rendering placeholder profile values first (looks like "wrong profile then correct profile").
    // DataStore emits asynchronously; we wait for the first real emission and keep it stable.
    val profileLive by remember { AppPreferencesRepository.editableProfile.map { it as AppPreferencesRepository.EditableProfileState? } }
        .collectAsState(initial = null)
    var profileStable by remember { mutableStateOf<AppPreferencesRepository.EditableProfileState?>(null) }
    var menuItems by remember { mutableStateOf(defaultDynamicProfileMenuItems()) }

    LaunchedEffect(Unit) {
        try {
            profileStable = AppPreferencesRepository.peekEditableProfileNow()
            val cachedMenu = runCatching { ContentRepository.loadCachedProfileMenuItems() }.getOrDefault(emptyList())
            if (cachedMenu.isNotEmpty()) {
                menuItems = normalizeProfileMenuItemTitles(
                    mergeRemoteMenuWithInterestsIfMissing(
                        mergeRemoteMenuWithDobIfMissing(
                            cachedMenu.map {
                                DynamicProfileMenuItem(
                                    id = it.id,
                                    title = it.title,
                                    subtitle = it.subtitle,
                                    path = it.path,
                                    enabled = it.enabled,
                                )
                            },
                        ),
                    ),
                )
            }
            val remote = runCatching { ContentRepository.loadProfileMenuItems(forceRefresh = true) }.getOrDefault(emptyList())
            when {
                remote.isNotEmpty() -> {
                    menuItems = normalizeProfileMenuItemTitles(
                        mergeRemoteMenuWithInterestsIfMissing(
                            mergeRemoteMenuWithDobIfMissing(
                                remote.map {
                                    DynamicProfileMenuItem(
                                        id = it.id,
                                        title = it.title,
                                        subtitle = it.subtitle,
                                        path = it.path,
                                        enabled = it.enabled,
                                    )
                                },
                            ),
                        ),
                    )
                }
                cachedMenu.isEmpty() -> {
                    menuItems = defaultDynamicProfileMenuItems()
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Keep peeked profile + any menu already applied from cache/defaults.
        }
    }
    LaunchedEffect(profileLive) {
        if (profileLive != null) profileStable = profileLive
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
                val profile = profileStable
                if (profile == null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = p.textSecondary,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Loading profile…",
                            color = p.textSecondary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    return@SettingsCard
                }

                visibleItems.forEachIndexed { index, item ->
                    val resolvedSubtitle = when (item.path) {
                        "/edit-username" -> item.subtitle.replace("{value}", profile.displayName.ifBlank { "Tap to set" })
                        "/edit-email" -> item.subtitle.replace("{value}", profile.email.ifBlank { "Tap to set" })
                        "/edit-mobile" -> item.subtitle.replace("{value}", profile.mobile.ifBlank { "Tap to set" })
                        "/edit-dob" -> item.subtitle.replace(
                            "{value}",
                            profile.birthdayDate.ifBlank { "Tap to set" }.let { v -> if (v == "Tap to set") v else formatDobForUi(v) },
                        )
                        "/edit-gender" -> item.subtitle.replace("{value}", profile.gender.ifBlank { "Tap to set" })
                        "/edit-interests" -> {
                            val subs = UserInterestUtils.normalizeInterestSubcategories(userInterests)
                            when {
                                subs.isEmpty() -> "Abhi set nahi — tap karke chunein"
                                subs.size <= 3 -> subs.joinToString(separator = " · ")
                                else -> subs.take(3).joinToString(separator = " · ") + " +${subs.size - 3}"
                            }
                        }
                        "/verify-email" -> if (emailOk) "Verified" else if (item.subtitle.isBlank()) "Not verified — tap to send OTP" else item.subtitle
                        "/verify-phone" -> if (phoneOk) "Verified" else if (item.subtitle.isBlank()) "Not verified — tap to send OTP" else item.subtitle
                        else -> item.subtitle
                    }.ifBlank { "Tap to open" }
                    val onClick = when (item.path) {
                        "/edit-username" -> onEditUsername
                        "/edit-email" -> onEditEmail
                        "/edit-mobile" -> onEditMobile
                        "/edit-dob" -> onEditDob
                        "/edit-gender" -> onEditGender
                        "/edit-interests" -> onEditInterests
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
                    key(item.id) {
                        ProfileNavRow(
                            title = item.title,
                            subtitle = resolvedSubtitle,
                            onClick = onClick,
                            danger = item.path == "/delete-account",
                        )
                    }
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
