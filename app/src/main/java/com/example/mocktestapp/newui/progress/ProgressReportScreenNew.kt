package com.example.mocktestapp.newui.progress

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.PieChart
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.data.local.TestAttemptEntity
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlin.math.roundToInt

/** Shown as a simple “target line” in UI; not persisted yet. */
private const val DisplayGoalPercent = 80

private fun scorePercent(correct: Int, total: Int): Int =
    if (total <= 0) 0 else ((correct * 100f) / total).roundToInt().coerceIn(0, 100)

private data class TestAggregate(
    val testName: String,
    val attemptCount: Int,
    val avgPercent: Int,
    val bestPercent: Int,
)

/** Static benchmark bands used for peer comparison display. */
private enum class ComparePeer(
    val chipLabel: String,
    val benchmarkPercent: Int,
    val description: String,
) {
    Topper(
        chipLabel = "Range 88-100",
        benchmarkPercent = 92,
        description = "High performance reference range.",
    ),
    Average(
        chipLabel = "Range 60-76",
        benchmarkPercent = 68,
        description = "Mid performance reference range.",
    ),
    Bottom(
        chipLabel = "Range 0-45",
        benchmarkPercent = 38,
        description = "Lower performance reference range.",
    ),
}

@Composable
fun ProgressReportScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onStartPractice: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    val profile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    val attemptsUserKey = remember(profile.emailLine, profile.userIdFormatted) {
        profile.emailLine.ifBlank { profile.userIdFormatted ?: "guest" }
    }
    val attempts by TestHistoryRepository.observeAttempts(attemptsUserKey).collectAsState(initial = emptyList())
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)

    val sortedChrono = remember(attempts) {
        attempts.sortedBy { it.completedAtMillis }
    }
    val percents = remember(sortedChrono) { sortedChrono.map { scorePercent(it.correct, it.total) } }
    val lastPct = percents.lastOrNull()
    val bestPct = percents.maxOrNull() ?: 0
    val avgPct = if (percents.isNotEmpty()) percents.average().roundToInt() else 0
    val recentTen = remember(sortedChrono) { sortedChrono.takeLast(10) }
    val aggregates = remember(sortedChrono) {
        sortedChrono
            .groupBy { it.testName }
            .map { (name, list) ->
                val pcts = list.map { scorePercent(it.correct, it.total) }
                TestAggregate(
                    testName = name,
                    attemptCount = list.size,
                    avgPercent = pcts.average().roundToInt(),
                    bestPercent = pcts.maxOrNull() ?: 0,
                )
            }
            .sortedByDescending { it.attemptCount }
    }
    val weakest = remember(aggregates) {
        aggregates.sortedBy { it.avgPercent }.take(3)
    }
    val gapToGoal = (DisplayGoalPercent - bestPct).coerceAtLeast(0)
    val bestVsGoalProgress = (bestPct / DisplayGoalPercent.toFloat()).coerceIn(0f, 1f)
    val lastVsGoalProgress = ((lastPct ?: 0) / DisplayGoalPercent.toFloat()).coerceIn(0f, 1f)
    val recentPercents = remember(recentTen) { recentTen.map { scorePercent(it.correct, it.total) } }
    var comparePeer by remember { mutableStateOf(ComparePeer.Average) }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.width(4.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = "Progress report",
                        color = p.textPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Text(
                        text = "From your saved mock tests",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                    )
                }
                Icon(
                    imageVector = Icons.Outlined.BarChart,
                    contentDescription = null,
                    tint = p.accent,
                    modifier = Modifier.size(28.dp),
                )
            }

            Spacer(Modifier.height(14.dp))

            if (sortedChrono.isEmpty()) {
                CompactGraphCard(
                    title = "Performance graph",
                    subtitle = "Graph will appear after your first test",
                    content = {
                        ProgressReportInsightSection(
                            title = "TEST SCORES (LAST 10 ATTEMPTS)",
                            icon = Icons.AutoMirrored.Outlined.ShowChart,
                            emptyMainText = "No Records",
                            emptySubText = "Attempt a test to view graph",
                        )
                    },
                )
                Spacer(Modifier.height(12.dp))
                CompactGraphCard(
                    title = "Series overview",
                    subtitle = "Average and best by test will show here",
                    content = {
                        ProgressReportInsightSection(
                            title = "TEST SERIES PERFORMANCE",
                            icon = Icons.Outlined.PieChart,
                            emptyMainText = "No Records",
                            emptySubText = "Insights appear after attempts",
                        )
                    },
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = onStartPractice,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                ) {
                    Text("Start a practice test", color = Color.White)
                }
            } else {

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatMini(
                    title = "Last",
                    value = if (scoreVisible) "${lastPct ?: 0}%" else "-",
                    modifier = Modifier.weight(1f),
                )
                StatMini(
                    title = "Best",
                    value = if (scoreVisible) "$bestPct%" else "-",
                    modifier = Modifier.weight(1f),
                )
                StatMini(
                    title = "Avg",
                    value = if (scoreVisible) "$avgPct%" else "-",
                    modifier = Modifier.weight(1f),
                )
                StatMini(
                    title = "Tests",
                    value = "${sortedChrono.size}",
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = if (scoreVisible) "Toward goal ($DisplayGoalPercent%)" else "Toward goal (-)",
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (scoreVisible) {
                    if (bestPct >= DisplayGoalPercent) {
                        "Best score meets or beats your $DisplayGoalPercent% target"
                    } else {
                        "Best score vs target · $gapToGoal pts below goal"
                    }
                } else {
                    "Best score vs target · -"
                },
                color = p.textSecondary,
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { bestVsGoalProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = p.accent,
                trackColor = p.border.copy(alpha = 0.2f),
                strokeCap = StrokeCap.Round,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Latest attempt vs target",
                color = p.textSecondary,
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { lastVsGoalProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = p.systemBlue,
                trackColor = p.border.copy(alpha = 0.2f),
                strokeCap = StrokeCap.Round,
            )

            Spacer(Modifier.height(14.dp))

            CompactGraphCard(
                title = "Performance graph",
                subtitle = "Bars = attempts, line = trend (last 10)",
                content = {
                    ScoreBarRow(attempts = recentTen, scoreVisible = scoreVisible)
                    Spacer(Modifier.height(10.dp))
                    LastTenTrendLineChart(percents = recentPercents, scoreVisible = scoreVisible)
                },
            )

            Spacer(Modifier.height(14.dp))
            PeerComparePanel(
                selected = comparePeer,
                onSelected = { comparePeer = it },
                userAvg = avgPct,
                userBest = bestPct,
                userLast = lastPct ?: 0,
                scoreVisible = scoreVisible,
            )

            Spacer(Modifier.height(14.dp))

            Text(
                text = "TEST SERIES PERFORMANCE",
                color = p.textSecondary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
                letterSpacing = 0.4.sp,
            )
            Spacer(Modifier.height(6.dp))
            aggregates.take(6).forEach { agg ->
                TestBreakdownRow(aggregate = agg, scoreVisible = scoreVisible)
                Spacer(Modifier.height(6.dp))
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Weakest averages (review these)",
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(6.dp))
            if (weakest.isEmpty()) {
                Text("—", color = p.textSecondary, fontSize = 13.sp)
            } else {
                weakest.forEachIndexed { i, w ->
                    Text(
                        text = "${i + 1}. ${w.testName} — avg ${if (scoreVisible) "${w.avgPercent}%" else "-"} (${w.attemptCount} attempt(s))",
                        color = p.textSecondary,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(vertical = 2.dp),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = onStartPractice,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
            ) {
                Text("Recommended: run a timed practice test", color = Color.White)
            }

            Spacer(Modifier.height(20.dp))
            }
        }
    }
}

@Composable
private fun CompactGraphCard(
    title: String,
    subtitle: String,
    content: @Composable () -> Unit,
) {
    val p = mockTestPalette()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = BorderStroke(1.dp, p.border.copy(alpha = 0.14f)),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                text = title,
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = subtitle,
                color = p.textSecondary,
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

/**
 * Single “insight panel” used on this screen only — empty state (reference layout) or
 * could be extended later with chart content in the same frame.
 */
@Composable
private fun ProgressReportInsightSection(
    title: String,
    icon: ImageVector,
    emptyMainText: String,
    emptySubText: String,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = BorderStroke(1.dp, p.border.copy(alpha = 0.14f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 28.dp, horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = title,
                color = p.textSecondary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
                letterSpacing = 0.35.sp,
            )
            Spacer(Modifier.height(20.dp))
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = p.textSecondary.copy(alpha = 0.45f),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = emptyMainText,
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 17.sp,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = emptySubText,
                color = p.textSecondary,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
    }
}

@Composable
private fun StatMini(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.14f), shape)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = title, color = p.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(text = value, color = p.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun ScoreBarRow(
    attempts: List<TestAttemptEntity>,
    scoreVisible: Boolean,
) {
    val p = mockTestPalette()
    val rowH = 108.dp
    val maxBar = 78.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(rowH)
            .clip(RoundedCornerShape(12.dp))
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
            .padding(horizontal = 6.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.Bottom,
    ) {
        attempts.forEach { a ->
            val pct = scorePercent(a.correct, a.total)
            val frac = (pct / 100f).coerceIn(0.08f, 1f)
            val barH = (maxBar * frac).coerceAtLeast(8.dp)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Bottom,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(horizontal = 2.dp),
            ) {
                Box(
                    modifier = Modifier
                        .width(11.dp)
                        .height(barH)
                        .clip(RoundedCornerShape(5.dp))
                        .background(
                            Brush.verticalGradient(
                                listOf(p.accent, p.systemBlue.copy(alpha = 0.85f)),
                            ),
                        ),
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    text = if (scoreVisible) "$pct" else "-",
                    color = p.textSecondary,
                    fontSize = 9.sp,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun LastTenTrendLineChart(
    percents: List<Int>,
    scoreVisible: Boolean,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.12f), shape)
            .padding(horizontal = 10.dp, vertical = 10.dp),
    ) {
        Text(
            text = "Score trend",
            color = p.textPrimary,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(6.dp))
        if (percents.isEmpty()) {
            Text("No points yet", color = p.textSecondary, fontSize = 12.sp)
            return
        }
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(132.dp),
        ) {
            val padL = 6.dp.toPx()
            val padR = 6.dp.toPx()
            val padT = 8.dp.toPx()
            val padB = 22.dp.toPx()
            val w = size.width - padL - padR
            val h = size.height - padT - padB
            fun yFor(pct: Int) = padT + h * (1f - (pct / 100f).coerceIn(0f, 1f))
            if (percents.size == 1) {
                val cx = padL + w / 2f
                val cy = yFor(percents.first())
                drawCircle(color = p.accent, radius = 7.dp.toPx(), center = Offset(cx, cy))
                return@Canvas
            }
            val path = Path()
            percents.forEachIndexed { i, pct ->
                val x = padL + w * i / (percents.size - 1).coerceAtLeast(1)
                val y = yFor(pct)
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(
                path = path,
                color = p.accent,
                style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
            )
            percents.forEachIndexed { i, pct ->
                val x = padL + w * i / (percents.size - 1).coerceAtLeast(1)
                val y = yFor(pct)
                drawCircle(color = Color.White, radius = 4.5.dp.toPx(), center = Offset(x, y))
                drawCircle(color = p.accent, radius = 3.dp.toPx(), center = Offset(x, y))
            }
        }
        Text(
            text = if (scoreVisible) "0% bottom · 100% top" else "- bottom · - top",
            color = p.textSecondary,
            fontSize = 10.sp,
        )
    }
}

@Composable
private fun PeerComparePanel(
    selected: ComparePeer,
    onSelected: (ComparePeer) -> Unit,
    userAvg: Int,
    userBest: Int,
    userLast: Int,
    scoreVisible: Boolean,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val bench = selected.benchmarkPercent
    val deltaAvg = userAvg - bench
    val deltaText = when {
        deltaAvg > 0 -> "Your average is ${if (scoreVisible) "${deltaAvg}%" else "-"} above this benchmark."
        deltaAvg < 0 -> "Your average is ${if (scoreVisible) "${-deltaAvg}%" else "-"} below this benchmark."
        else -> "Your average matches this benchmark."
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = BorderStroke(1.dp, p.border.copy(alpha = 0.14f)),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                text = "Compare yourself",
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Pick a reference band and see how your scores line up.",
                color = p.textSecondary,
                fontSize = 11.sp,
                lineHeight = 15.sp,
            )
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ComparePeer.entries.forEach { peer ->
                    FilterChip(
                        selected = selected == peer,
                        onClick = { onSelected(peer) },
                        label = { Text(peer.chipLabel, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = p.accent.copy(alpha = 0.22f),
                            selectedLabelColor = p.textPrimary,
                            containerColor = p.surfaceElevated,
                            labelColor = p.textSecondary,
                        ),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(selected.description, color = p.textSecondary, fontSize = 12.sp, lineHeight = 16.sp)
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Reference: ${if (scoreVisible) "$bench%" else "-"} · $deltaText",
                color = p.textPrimary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = 16.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text("Your average (${if (scoreVisible) "$userAvg%" else "-"})", color = p.textSecondary, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { (userAvg / 100f).coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = p.accent,
                trackColor = p.border.copy(alpha = 0.2f),
                strokeCap = StrokeCap.Round,
            )
            Spacer(Modifier.height(8.dp))
            Text("Benchmark (${if (scoreVisible) "$bench%" else "-"})", color = p.textSecondary, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { (bench / 100f).coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = p.systemBlue,
                trackColor = p.border.copy(alpha = 0.2f),
                strokeCap = StrokeCap.Round,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Also: last attempt ${if (scoreVisible) "$userLast%" else "-"} · your best ${if (scoreVisible) "$userBest%" else "-"}",
                color = p.textSecondary,
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun TestBreakdownRow(
    aggregate: TestAggregate,
    scoreVisible: Boolean,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(p.surface.copy(alpha = 0.65f))
            .border(1.dp, p.border.copy(alpha = 0.1f), RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = aggregate.testName,
                color = p.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "${aggregate.attemptCount} attempt(s)",
                color = p.textSecondary,
                fontSize = 11.sp,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("avg ${if (scoreVisible) "${aggregate.avgPercent}%" else "-"}", color = p.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("best ${if (scoreVisible) "${aggregate.bestPercent}%" else "-"}", color = p.textSecondary, fontSize = 11.sp)
        }
    }
}
