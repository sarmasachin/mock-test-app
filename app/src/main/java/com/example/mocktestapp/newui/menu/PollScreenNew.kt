package com.example.mocktestapp.newui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.launch

@Composable
fun PollScreenNew(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var polls by remember { mutableStateOf<List<ContentRepository.PollItemRemote>>(emptyList()) }
    var selected by remember { mutableStateOf(0) }
    val voted = remember { mutableStateMapOf<String, Set<Int>>() }
    val pollResultCounts = remember { mutableStateMapOf<String, List<Int>>() }
    var submitMessage by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val rows = ContentRepository.loadPollItems()
        polls = rows
        AppPreferencesRepository.markPollsSeen(rows.map { it.id })
    }

    val active = polls.getOrNull(selected)

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
                Text("Poll", color = p.textPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            }
            Spacer(Modifier.height(12.dp))

            if (polls.isEmpty()) {
                Text("No active poll.", color = p.textSecondary, fontSize = 14.sp)
                return@Column
            }

            if (polls.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                val normalizedCounts = active.options.mapIndexed { index, _ -> resultCounts.getOrElse(index) { 0 } }
                val totalVotes = normalizedCounts.sum().coerceAtLeast(0)
                Text(active.question, color = p.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                active.options.forEachIndexed { idx, option ->
                    val checked = currentVotes.contains(idx)
                    val optionVotes = normalizedCounts.getOrElse(idx) { 0 }
                    val optionRatio = if (totalVotes > 0) optionVotes.toFloat() / totalVotes.toFloat() else 0f
                    val optionPercent = (optionRatio * 100f).toInt()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (checked) p.systemBlue.copy(alpha = 0.18f) else p.surface)
                            .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(14.dp))
                            .clickable {
                                voted[active.id] = if (active.allowMultiple) {
                                    if (checked) currentVotes - idx else currentVotes + idx
                                } else {
                                    setOf(idx)
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(18.dp)
                                        .clip(RoundedCornerShape(9.dp))
                                        .background(if (checked) p.systemBlue else p.surfaceElevated),
                                )
                                Spacer(Modifier.size(10.dp))
                                Text(
                                    option,
                                    color = p.textPrimary,
                                    fontSize = 14.sp,
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
                            if (resultCounts.isNotEmpty()) {
                                Spacer(Modifier.height(8.dp))
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(8.dp)
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(p.border.copy(alpha = 0.35f)),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(optionRatio.coerceIn(0f, 1f))
                                            .height(8.dp)
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(if (checked) p.systemBlue else p.systemBlue.copy(alpha = 0.65f)),
                                    )
                                }
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
                            val result = ContentRepository.submitPollVote(active.id, currentVotes.toList())
                            if (result?.ok == true) {
                                pollResultCounts[active.id] = result.counts
                                submitMessage = "Vote submitted successfully."
                            } else {
                                submitMessage = "Failed to submit vote."
                            }
                            submitting = false
                        }
                    },
                    enabled = currentVotes.isNotEmpty() && !submitting,
                    colors = ButtonDefaults.buttonColors(containerColor = p.primaryButton, contentColor = p.onPrimaryButton),
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text(if (submitting) "Submitting..." else "Submit Vote", fontWeight = FontWeight.Bold)
                }
                if (!submitMessage.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(submitMessage!!, color = p.textSecondary, fontSize = 12.sp)
                }
            }
        }
    }
}
