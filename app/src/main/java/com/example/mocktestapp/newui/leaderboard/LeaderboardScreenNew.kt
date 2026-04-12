package com.example.mocktestapp.newui.leaderboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

@Composable
fun LeaderboardScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    var scope by remember { mutableStateOf(LeaderboardScope.Global) }
    val allUsers = demoLeaderboardUsers()
    val users = when (scope) {
        LeaderboardScope.Global -> allUsers
        LeaderboardScope.Friends -> allUsers.filterIndexed { index, user ->
            index % 4 == 0 || user.name.contains("Rahul", ignoreCase = true)
        }
    }

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
                    text = "Leaderboard",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                LeaderboardScopeChip(
                    label = "Global",
                    selected = scope == LeaderboardScope.Global,
                    onClick = { scope = LeaderboardScope.Global },
                    modifier = Modifier.weight(1f),
                )
                LeaderboardScopeChip(
                    label = "Friends",
                    selected = scope == LeaderboardScope.Friends,
                    onClick = { scope = LeaderboardScope.Friends },
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(Modifier.height(10.dp))
            Text(
                text = if (scope == LeaderboardScope.Friends) {
                    "Friends scope is demo-only until you add a backend friend list."
                } else {
                    "Showing global demo ranks."
                },
                color = p.textSecondary,
                fontSize = 12.sp,
            )

            Spacer(Modifier.height(16.dp))

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                itemsIndexed(users) { index, user ->
                    LeaderboardRow(
                        rank = index + 1,
                        name = user.name,
                        scoreText = "${user.score}/500",
                    )
                }
            }
        }
    }
}

private data class LeaderboardUser(
    val name: String,
    val score: Int,
)

private enum class LeaderboardScope {
    Global,
    Friends,
}

@Composable
private fun LeaderboardScopeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val bg = if (selected) p.primaryButton else p.surface
    val fg = if (selected) p.onPrimaryButton else p.textPrimary
    Box(
        modifier = modifier
            .height(40.dp)
            .clip(shape)
            .background(bg)
            .border(1.dp, p.border.copy(alpha = if (selected) 0.35f else 0.18f), shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = label, color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

private fun demoLeaderboardUsers(): List<LeaderboardUser> {
    val baseNames = listOf("Rahul Sharma", "Anjali Verma", "Rohan Singh", "Neha Gupta", "Aman Kumar")
    return (0 until 100).map { idx ->
        val name = baseNames[idx % baseNames.size] + " #${idx + 1}"
        val score = 500 - (idx * 3).coerceAtLeast(0)
        LeaderboardUser(name = name, score = score.coerceAtLeast(0))
    }
}

@Composable
private fun LeaderboardRow(
    rank: Int,
    name: String,
    scoreText: String,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "#$rank",
            color = p.accent,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            modifier = Modifier.width(52.dp),
        )

        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(p.surfaceElevated),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "U",
                color = p.textSecondary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
        }

        Spacer(Modifier.size(12.dp))

        Text(
            text = name,
            color = p.textPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )

        Text(
            text = scoreText,
            color = p.textSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
