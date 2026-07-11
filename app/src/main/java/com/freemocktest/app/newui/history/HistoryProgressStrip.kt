package com.freemocktest.app.newui.history

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.util.HistoryAttemptUi
import com.freemocktest.app.newui.theme.palette.mockTestPalette

@Composable
fun HistoryProgressStrip(
    summary: HistoryAttemptUi.ProgressSummary,
    maxStored: Int,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
        ) {
            Text(
                text = "Your progress",
                color = p.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "${summary.attemptsCount} attempt${if (summary.attemptsCount == 1) "" else "s"} · " +
                    "${summary.uniqueTestsCount} test${if (summary.uniqueTestsCount == 1) "" else "s"} · " +
                    "latest $maxStored kept",
                color = p.textSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                HistoryProgressStat(
                    title = "Attempts",
                    value = summary.attemptsCount.toString(),
                    modifier = Modifier.weight(1f),
                )
                HistoryProgressStat(
                    title = "Tests tried",
                    value = summary.uniqueTestsCount.toString(),
                    modifier = Modifier.weight(1f),
                )
                HistoryProgressStat(
                    title = "Avg score",
                    value = summary.avgPercentText,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                HistoryProgressStat(
                    title = "Best",
                    value = summary.bestScoreText,
                    modifier = Modifier.weight(1f),
                )
                HistoryProgressStat(
                    title = "Last",
                    value = summary.lastScoreText,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun HistoryProgressStat(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(12.dp)
    Card(
        modifier = modifier,
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.12f)),
    ) {
        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp)) {
            Text(
                text = title,
                color = p.textSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = value,
                color = p.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
