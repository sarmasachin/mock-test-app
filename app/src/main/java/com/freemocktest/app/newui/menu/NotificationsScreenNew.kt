package com.freemocktest.app.newui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.notifications.LocalNotificationInbox
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val NOTIFICATIONS_REMOTE_ERROR_MESSAGE =
    "Couldn't load notifications from the server. Check your connection and try again."

private const val NOTIFICATIONS_REMOTE_PARTIAL_MESSAGE =
    "Couldn't refresh from server. Showing notifications on this device only."

@Composable
fun NotificationsScreenNew(
    onBack: () -> Unit,
    onOpenDeepLink: (String) -> Unit,
) {
    val context = LocalContext.current
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var notifications by remember { mutableStateOf<List<ContentRepository.PushNotificationItemRemote>>(emptyList()) }
    var loadingNotifications by remember { mutableStateOf(true) }
    var remoteLoadFailed by remember { mutableStateOf(false) }
    var notificationsReloadKey by remember { mutableIntStateOf(0) }
    val clearReloadScope = rememberCoroutineScope()

    LaunchedEffect(notificationsReloadKey) {
        loadingNotifications = true
        remoteLoadFailed = false
        val clearedAtMs = AppPreferencesRepository.notificationsClearedAtMs.first()
        try {
            val remoteRows = try {
                ContentRepository.loadNotifications()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                remoteLoadFailed = true
                emptyList()
            }

            val localRows = runCatching {
                ContentRepository.filterNotificationsForCurrentAccount(LocalNotificationInbox.read(context))
            }.getOrElse { emptyList() }

            val rows = (localRows + remoteRows)
                .distinctBy { it.id.trim() }
                .filter { row ->
                    val createdMs = parseCreatedAtMillis(row.createdAt)
                    createdMs == null || createdMs >= clearedAtMs
                }
                .sortedByDescending { it.createdAt.orEmpty() }
            notifications = rows
            runCatching { AppPreferencesRepository.markNotificationsSeen(rows.map { it.id }) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            remoteLoadFailed = true
            notifications = runCatching {
                ContentRepository.filterNotificationsForCurrentAccount(LocalNotificationInbox.read(context))
                    .distinctBy { it.id.trim() }
                    .filter { row ->
                        val createdMs = parseCreatedAtMillis(row.createdAt)
                        createdMs == null || createdMs >= clearedAtMs
                    }
                    .sortedByDescending { it.createdAt.orEmpty() }
            }.getOrElse { emptyList() }
        } finally {
            loadingNotifications = false
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = p.textPrimary)
                }
                Text("Notifications", color = p.textPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                Spacer(Modifier.weight(1f))
                TextButton(
                    onClick = {
                        clearReloadScope.launch {
                            LocalNotificationInbox.clearAll(context)
                            AppPreferencesRepository.clearAllNotificationsInbox()
                            notifications = emptyList()
                            notificationsReloadKey += 1
                        }
                    },
                    enabled = !loadingNotifications && notifications.isNotEmpty(),
                ) {
                    Text("Clear all", fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(12.dp))
            if (loadingNotifications) {
                Text("Loading notifications...", color = p.textSecondary, fontSize = 14.sp)
            } else if (remoteLoadFailed && notifications.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = NOTIFICATIONS_REMOTE_ERROR_MESSAGE,
                            color = p.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Button(
                            onClick = { notificationsReloadKey += 1 },
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else {
                if (remoteLoadFailed) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = p.surface),
                        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = NOTIFICATIONS_REMOTE_PARTIAL_MESSAGE,
                                color = p.textSecondary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(onClick = { notificationsReloadKey += 1 }) {
                                Text("Retry", fontWeight = FontWeight.Bold, color = p.accent)
                            }
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                }
                if (notifications.isEmpty()) {
                    Text("No notifications available.", color = p.textSecondary, fontSize = 14.sp)
                } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
                    items(notifications) { item ->
                        val targetRoute = resolveNotificationRoute(item)
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = targetRoute.isNotBlank()) {
                                    onOpenDeepLink(targetRoute)
                                },
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = p.surface),
                            border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top,
                                ) {
                                    Text(
                                        text = item.title,
                                        color = p.textPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        modifier = Modifier.weight(1f),
                                    )
                                    val dateText = formatNotificationDateTime(item.createdAt)
                                    if (dateText.isNotBlank()) {
                                        Text(
                                            text = dateText,
                                            color = p.textSecondary.copy(alpha = 0.9f),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium,
                                        )
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(item.message, color = p.textSecondary, fontSize = 13.sp)
                            }
                        }
                    }
                }
                }
            }
        }
    }
}

private fun resolveNotificationRoute(item: ContentRepository.PushNotificationItemRemote): String {
    val direct = item.deepLink?.trim().orEmpty()
    if (direct.isNotBlank()) return direct
    val haystack = "${item.title.lowercase(Locale.US)} ${item.message.lowercase(Locale.US)}"
    return when {
        "poll" in haystack -> "poll"
        "daily quiz" in haystack || "quiz" in haystack -> "menu_quiz"
        "job" in haystack -> "job_alert"
        "exam" in haystack -> "exam_alert"
        "news" in haystack || "article" in haystack -> "main/news"
        "test" in haystack || "mock" in haystack -> "main/tests"
        else -> "notifications"
    }
}

private fun formatNotificationDateTime(raw: String?): String {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return ""
    val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.US)
    val zone = ZoneId.systemDefault()
    return runCatching {
        // Prefer Instant parsing (works for "2026-05-09T10:12:30Z" etc).
        Instant.parse(value).atZone(zone)
    }.recoverCatching {
        // Some payloads may be full ISO with offset; normalize to local zone.
        ZonedDateTime.parse(value).withZoneSameInstant(zone)
    }.recoverCatching {
        // If server stored date-only ("YYYY-MM-DD"), assume start-of-day local.
        if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)) {
            LocalDate.parse(value).atStartOfDay(zone)
        } else {
            throw IllegalArgumentException("unknown timestamp format")
        }
    }.map { zdt ->
        formatter.format(zdt)
    }.getOrElse {
        // Fallback: show raw string instead of crashing the UI.
        value
    }
}

private fun parseCreatedAtMillis(raw: String?): Long? {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return null
    return runCatching { Instant.parse(value).toEpochMilli() }
        .recoverCatching { ZonedDateTime.parse(value).toInstant().toEpochMilli() }
        .recoverCatching {
            if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)) {
                LocalDate.parse(value).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
            } else {
                throw IllegalArgumentException("unknown timestamp format")
            }
        }
        .getOrNull()
}
