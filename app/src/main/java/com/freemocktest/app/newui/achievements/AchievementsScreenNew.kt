package com.freemocktest.app.newui.achievements

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.remote.RetrofitProvider
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private data class Badge(
    val id: String,
    val title: String,
    val subtitle: String,
    val unlocked: Boolean,
    val icon: ImageVector,
)

private const val ACHIEVEMENTS_INTRO_LOAD_ERROR_MESSAGE =
    "Couldn't load announcement from the server. Check your connection and try again."

@Composable
fun AchievementsScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val streak by AppPreferencesRepository.streakDays.collectAsState(initial = 0)

    var adminIntro by remember { mutableStateOf<Pair<String?, String>?>(null) }
    var introLoading by remember { mutableStateOf(true) }
    var introLoadFailed by remember { mutableStateOf(false) }
    var introReloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(introReloadKey) {
        introLoading = true
        introLoadFailed = false
        try {
            val loaded = withContext(Dispatchers.IO) {
                runCatching { RetrofitProvider.publicApi.getHomeContent().achievementContent }
            }
            if (loaded.isFailure) {
                adminIntro = null
                introLoadFailed = true
            } else {
                val ac = loaded.getOrNull()
                val body = ac?.body?.trim().orEmpty()
                if (body.isBlank()) {
                    adminIntro = null
                    introLoadFailed = false
                } else {
                    adminIntro = Pair(ac?.title?.trim()?.takeIf { it.isNotBlank() }, body)
                    introLoadFailed = false
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            adminIntro = null
            introLoadFailed = true
        } finally {
            introLoading = false
        }
    }

    val badges = listOf(
        Badge(
            id = "streak3",
            title = "On a roll",
            subtitle = "Digest streak of 3+ days",
            unlocked = streak >= 3,
            icon = Icons.Rounded.LocalFireDepartment,
        ),
        Badge(
            id = "streak7",
            title = "Week warrior",
            subtitle = "Digest streak of 7+ days",
            unlocked = streak >= 7,
            icon = Icons.Rounded.LocalFireDepartment,
        ),
        Badge(
            id = "fullmarks",
            title = "Full marks",
            subtitle = "Any practice test with 100%",
            unlocked = false,
            icon = Icons.Rounded.Star,
        ),
        Badge(
            id = "topboard",
            title = "Leaderboard legend",
            subtitle = "Finish in top 10 leaderboard scope",
            unlocked = false,
            icon = Icons.Rounded.EmojiEvents,
        ),
    )

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(6.dp))
                Text(
                    text = "Achievements",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Current digest streak: $streak day(s)",
                color = p.textSecondary,
                fontSize = 13.sp,
            )
            Spacer(Modifier.height(14.dp))

            if (introLoading) {
                Text(
                    text = "Loading announcement…",
                    color = p.textSecondary,
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(10.dp))
            } else if (introLoadFailed) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = ACHIEVEMENTS_INTRO_LOAD_ERROR_MESSAGE,
                            color = p.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Button(
                            onClick = { introReloadKey += 1 },
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
                Spacer(Modifier.height(14.dp))
            }

            adminIntro?.let { (heading, bodyText) ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        heading?.let { h ->
                            Text(
                                text = h,
                                color = p.textPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                            )
                            Spacer(Modifier.height(6.dp))
                        }
                        Text(
                            text = bodyText,
                            color = p.textSecondary,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(badges, key = { it.id }) { b ->
                    BadgeRow(badge = b)
                }
            }
        }
    }
}

@Composable
private fun BadgeRow(badge: Badge) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    val alpha = if (badge.unlocked) 1f else 0.45f
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, p.border.copy(alpha = 0.14f), shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = badge.icon,
                contentDescription = null,
                tint = if (badge.unlocked) p.accent else p.textSecondary,
                modifier = Modifier.size(36.dp),
            )
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = badge.title,
                    color = p.textPrimary.copy(alpha = alpha),
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = badge.subtitle,
                    color = p.textSecondary.copy(alpha = alpha),
                    fontSize = 12.sp,
                )
            }
            Text(
                text = if (badge.unlocked) "Unlocked" else "Locked",
                color = if (badge.unlocked) p.accent else p.textSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
