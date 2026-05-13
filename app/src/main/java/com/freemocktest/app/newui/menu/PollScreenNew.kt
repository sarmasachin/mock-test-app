package com.freemocktest.app.newui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
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
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val PollOptionFillPalette: List<Color> = listOf(
    Color(0xFF2563EB),
    Color(0xFF7C3AED),
    Color(0xFF059669),
    Color(0xFFD97706),
    Color(0xFFDC2626),
    Color(0xFF0891B2),
    Color(0xFFDB2777),
    Color(0xFF4F46E5),
)

private fun pollOptionFillColor(optionIndex: Int): Color =
    PollOptionFillPalette[optionIndex % PollOptionFillPalette.size]

/** Original option indices, sorted by vote count (desc) when totals exist — API indexes unchanged. */
private fun pollSortedOptionIndices(
    optionCount: Int,
    normalizedCounts: List<Int>,
    countsLoaded: Boolean,
): List<Int> {
    if (optionCount <= 0) return emptyList()
    val indices = (0 until optionCount).toList()
    if (!countsLoaded) return indices
    val total = normalizedCounts.sum()
    if (total <= 0) return indices
    return indices.sortedWith(
        compareByDescending<Int> { normalizedCounts.getOrElse(it) { 0 } }
            .thenBy { it },
    )
}

private const val POLLS_LOAD_ERROR_MESSAGE =
    "Couldn't load polls. Check your connection and try again."

@Composable
fun PollScreenNew(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var polls by remember { mutableStateOf<List<ContentRepository.PollItemRemote>>(emptyList()) }
    var selected by remember { mutableIntStateOf(0) }
    val voted = remember { mutableStateMapOf<String, Set<Int>>() }
    val pollResultCounts = remember { mutableStateMapOf<String, List<Int>>() }
    val pollSubmitted = remember { mutableStateMapOf<String, Boolean>() }
    var loadingPolls by remember { mutableStateOf(true) }
    var pollsLoadFailed by remember { mutableStateOf(false) }
    var pollListReloadKey by remember { mutableIntStateOf(0) }
    var submitMessage by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(pollListReloadKey) {
        loadingPolls = true
        pollsLoadFailed = false
        try {
            val loadResult = runCatching { ContentRepository.loadPollItems() }
            val rows = loadResult.getOrElse { emptyList() }
            pollsLoadFailed = loadResult.isFailure
            polls = rows
            if (rows.isNotEmpty()) {
                selected = selected.coerceIn(0, rows.lastIndex)
            }
            runCatching { AppPreferencesRepository.markPollsSeen(rows.map { it.id }) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            polls = emptyList()
            pollsLoadFailed = true
        } finally {
            loadingPolls = false
        }
    }

    val active = polls.getOrNull(selected)
    LaunchedEffect(active?.id, pollListReloadKey) {
        val current = active ?: return@LaunchedEffect
        runCatching {
            val status = ContentRepository.loadPollVoteStatus(current.id) ?: return@runCatching
            if (status.hasVoted) {
                voted[current.id] = status.optionIndexes.toSet()
                pollResultCounts[current.id] = status.counts
                pollSubmitted[current.id] = true
            }
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        val scrollState = rememberScrollState()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = p.textPrimary)
                }
                Column {
                    Text("Poll", color = p.textPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    Text("Vote and view live audience trends", color = p.textSecondary, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(12.dp))

            if (loadingPolls) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(p.surface)
                        .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(14.dp),
                ) {
                    Text("Loading poll...", color = p.textSecondary, fontSize = 14.sp)
                }
                return@Column
            }

            if (pollsLoadFailed && polls.isEmpty()) {
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
                            text = POLLS_LOAD_ERROR_MESSAGE,
                            color = p.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Button(
                            onClick = { pollListReloadKey += 1 },
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
                return@Column
            }

            if (polls.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(p.surface)
                        .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(14.dp),
                ) {
                    Text("No active poll.", color = p.textSecondary, fontSize = 14.sp)
                }
                return@Column
            }

            if (polls.size > 1) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    polls.forEachIndexed { index, _ ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (index == selected) p.systemBlue else p.surface)
                                .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(999.dp))
                                .clickable { selected = index }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Text("Poll ${index + 1}", color = if (index == selected) Color.White else p.textPrimary, fontSize = 12.sp)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            if (active != null) {
                val currentVotes = voted[active.id] ?: emptySet()
                val resultCounts = pollResultCounts[active.id] ?: emptyList()
                val hasSubmitted = pollSubmitted[active.id] == true
                val normalizedCounts = active.options.mapIndexed { index, _ -> resultCounts.getOrElse(index) { 0 } }
                val totalVotes = normalizedCounts.sum().coerceAtLeast(0)
                if (hasSubmitted) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xFFDCFCE7))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text(
                            text = "You voted",
                            color = Color(0xFF166534),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(p.surface)
                        .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(18.dp))
                        .padding(14.dp),
                ) {
                    Column {
                        Text(active.question, color = p.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(12.dp))
                        val countsLoaded = resultCounts.isNotEmpty()
                        val displayIndices =
                            pollSortedOptionIndices(active.options.size, normalizedCounts, countsLoaded)
                        for (idx in displayIndices) {
                            val option = active.options[idx]
                            val checked = currentVotes.contains(idx)
                            val optionVotes = normalizedCounts.getOrElse(idx) { 0 }
                            val optionRatio = if (totalVotes > 0) optionVotes.toFloat() / totalVotes.toFloat() else 0f
                            val optionPercent = (optionRatio * 100f).toInt()
                            val fillColor = pollOptionFillColor(idx)
                            val borderW = if (checked && !hasSubmitted) 2.dp else 1.dp
                            val borderC =
                                when {
                                    checked && !hasSubmitted -> p.systemBlue
                                    checked && hasSubmitted -> Color(0xFF22C55E).copy(alpha = 0.75f)
                                    else -> p.border.copy(alpha = 0.2f)
                                }
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(52.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .border(borderW, borderC, RoundedCornerShape(14.dp))
                                    .clickable(enabled = !hasSubmitted) {
                                        voted[active.id] = if (active.allowMultiple) {
                                            if (checked) currentVotes - idx else currentVotes + idx
                                        } else {
                                            setOf(idx)
                                        }
                                    },
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxSize()
                                        .background(p.surfaceElevated.copy(alpha = 0.55f)),
                                )
                                if (totalVotes > 0) {
                                    Box(
                                        Modifier
                                            .fillMaxHeight()
                                            .fillMaxWidth(optionRatio.coerceIn(0f, 1f))
                                            .align(Alignment.CenterStart)
                                            .background(fillColor.copy(alpha = 0.34f)),
                                    )
                                }
                                Row(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        option,
                                        color = p.textPrimary,
                                        fontSize = 15.sp,
                                        modifier = Modifier.weight(1f),
                                    )
                                    if (resultCounts.isNotEmpty()) {
                                        Text(
                                            "$optionPercent% • $optionVotes",
                                            color = p.textSecondary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                        }
                        if (resultCounts.isNotEmpty()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "Total votes: $totalVotes",
                                color = p.textSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                        Spacer(Modifier.height(12.dp))
                        Button(
                            onClick = {
                                scope.launch {
                                    submitting = true
                                    submitMessage = null
                                    runCatching {
                                        val result = ContentRepository.submitPollVote(active.id, currentVotes.toList())
                                        if (result?.ok == true) {
                                            pollResultCounts[active.id] = result.counts
                                            pollSubmitted[active.id] = true
                                            AppPreferencesRepository.markPollVoted(active.id)
                                            submitMessage = "Vote submitted successfully."
                                        } else {
                                            submitMessage = "Failed to submit vote."
                                        }
                                    }.onFailure {
                                        submitMessage =
                                            "Failed to submit vote. Check your connection and try again."
                                    }
                                    submitting = false
                                }
                            },
                            enabled = currentVotes.isNotEmpty() && !submitting && !hasSubmitted,
                            colors = ButtonDefaults.buttonColors(containerColor = p.primaryButton, contentColor = p.onPrimaryButton),
                            modifier = Modifier.fillMaxWidth().height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(
                                when {
                                    submitting -> "Submitting..."
                                    hasSubmitted -> "Already Voted"
                                    else -> "Submit Vote"
                                },
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        if (!submitMessage.isNullOrBlank()) {
                            Spacer(Modifier.height(10.dp))
                            val isFailure = submitMessage!!.contains("Failed", ignoreCase = true)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (isFailure) Color(0xFFFEE2E2) else Color(0xFFDCFCE7))
                                    .border(
                                        1.dp,
                                        if (isFailure) Color(0xFFFCA5A5) else Color(0xFF86EFAC),
                                        RoundedCornerShape(12.dp),
                                    )
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                            ) {
                                Text(
                                    submitMessage!!,
                                    color = if (isFailure) Color(0xFF991B1B) else Color(0xFF166534),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
