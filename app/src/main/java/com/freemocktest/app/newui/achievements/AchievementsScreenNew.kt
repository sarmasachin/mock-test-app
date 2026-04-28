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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

private data class Badge(
    val id: String,
    val title: String,
    val subtitle: String,
    val unlocked: Boolean,
    val icon: ImageVector,
)

@Composable
fun AchievementsScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val streak by AppPreferencesRepository.streakDays.collectAsState(initial = 0)

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
