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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

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

    LaunchedEffect(Unit) {
        loadingNotifications = true
        val remoteRows = runCatching { ContentRepository.loadNotifications() }.getOrDefault(emptyList())
        val localRows = ContentRepository.filterNotificationsForCurrentAccount(LocalNotificationInbox.read(context))
        val rows = (localRows + remoteRows)
            .distinctBy { it.id.trim() }
            .sortedByDescending { it.createdAt.orEmpty() }
        notifications = rows
        AppPreferencesRepository.markNotificationsSeen(rows.map { it.id })
        loadingNotifications = false
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
            }
            Spacer(Modifier.height(12.dp))
            if (loadingNotifications) {
                Text("Loading notifications...", color = p.textSecondary, fontSize = 14.sp)
            } else if (notifications.isEmpty()) {
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
    return runCatching {
        formatter.format(ZonedDateTime.parse(value))
    }.getOrElse {
        value
    }
}
