package com.example.mocktestapp.newui.history

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.data.local.TestAttemptEntity
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun HistoryScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    title: String = "History",
    showAppBarBack: Boolean = true,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    val attempts by TestHistoryRepository.observeAttempts().collectAsState(initial = emptyList())
    val items = remember(attempts) { attempts.map { it.toHistoryItem() } }

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
            TopBar(onBack = onBack, title = title, showBack = showAppBarBack)
            Spacer(Modifier.height(14.dp))

            if (items.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No test attempts yet.\nFinish a quiz to see results here.",
                        color = p.textSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(items) { _, item ->
                        HistoryCard(
                            testName = item.testName,
                            dateText = item.dateText,
                            scoreText = item.scoreText,
                        )
                    }
                }
            }
        }
    }
}

private data class HistoryItem(
    val testName: String,
    val dateText: String,
    val scoreText: String,
)

private fun TestAttemptEntity.toHistoryItem(): HistoryItem {
    val zone = ZoneId.systemDefault()
    val dateText = DateTimeFormatter.ofPattern("MMM d, yyyy")
        .format(Instant.ofEpochMilli(completedAtMillis).atZone(zone).toLocalDate())
    return HistoryItem(
        testName = testName,
        dateText = dateText,
        scoreText = "$correct / $total",
    )
}

@Composable
private fun TopBar(
    onBack: () -> Unit,
    title: String,
    showBack: Boolean = true,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showBack) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.Rounded.ArrowBack,
                    contentDescription = "Back",
                    tint = p.textPrimary,
                )
            }
            Spacer(Modifier.width(6.dp))
        } else {
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = title,
            color = p.textPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun HistoryCard(
    testName: String,
    dateText: String,
    scoreText: String,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(20.dp)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(p.surfaceElevated)
                    .border(1.dp, p.border.copy(alpha = 0.12f), RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = scoreText.split(" ")[0],
                    color = p.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            Spacer(Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = testName,
                    color = p.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = dateText,
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Text(
                text = scoreText,
                color = p.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
    }
}
