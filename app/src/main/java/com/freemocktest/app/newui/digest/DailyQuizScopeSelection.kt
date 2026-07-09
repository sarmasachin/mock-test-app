package com.freemocktest.app.newui.digest

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.DailyQuizScopeSelection

private val ScopeDailyBlue = Color(0xFF1652D4)

object DailyQuizScopeUi {
    private const val FEATURED_TARGET = 6

    private val featuredSeed: List<String> = listOf(
        "Himachal Pradesh",
        "Punjab",
        "Uttar Pradesh",
        "Bihar",
        "Rajasthan",
        "Delhi",
    )

    fun canonicalStateName(raw: String, allStates: List<String>): String {
        val needle = raw.trim()
        if (needle.isBlank()) return ""
        return allStates.firstOrNull { it.equals(needle, ignoreCase = true) } ?: needle
    }

    fun resolveInitialSelection(
        signupState: String,
        saved: DailyQuizScopeSelection?,
        allStates: List<String>,
    ): DailyQuizScopeSelection {
        saved?.let { savedSelection ->
            if (savedSelection.isAllIndia) return DailyQuizScopeSelection.AllIndia
            val canonicalSaved = canonicalStateName(savedSelection.stateName, allStates)
            if (canonicalSaved.isNotBlank()) return DailyQuizScopeSelection.state(canonicalSaved)
        }
        val canonicalSignup = canonicalStateName(signupState, allStates)
        if (canonicalSignup.isNotBlank()) return DailyQuizScopeSelection.state(canonicalSignup)
        return DailyQuizScopeSelection.AllIndia
    }

    /** Featured row (max 6) + remaining states for "See all". */
    fun buildStateLists(
        signupState: String,
        allStates: List<String>,
    ): Pair<List<String>, List<String>> {
        val ordered = allStates.distinctBy { it.lowercase() }.sortedBy { it.lowercase() }
        if (ordered.isEmpty()) return emptyList<String>() to emptyList()

        val featured = linkedSetOf<String>()
        val canonicalSignup = canonicalStateName(signupState, ordered)
        if (canonicalSignup.isNotBlank()) featured.add(canonicalSignup)
        for (seed in featuredSeed) {
            if (featured.size >= FEATURED_TARGET) break
            canonicalStateName(seed, ordered).takeIf { it.isNotBlank() }?.let { featured.add(it) }
        }
        for (state in ordered) {
            if (featured.size >= FEATURED_TARGET) break
            featured.add(state)
        }
        val remaining = ordered.filter { it !in featured }
        return featured.toList() to remaining
    }

    fun label(selection: DailyQuizScopeSelection): String {
        if (selection.isAllIndia) return "All India"
        return selection.stateName.ifBlank { "State" }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DailyQuizScopeSelectorCard(
    selection: DailyQuizScopeSelection,
    featuredStates: List<String>,
    expandedStates: List<String>,
    showAllStates: Boolean,
    enabled: Boolean,
    onSelectAllIndia: () -> Unit,
    onSelectState: (String) -> Unit,
    onToggleSeeAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cardShape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(cardShape)
            .background(Color.White)
            .border(1.dp, Color(0xFFE5E7EB), cardShape)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text = "Quiz scope",
            color = Color(0xFF272727),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Choose once — applies to today's quiz.",
            color = Color(0xFF6B7280),
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 2.dp, bottom = 8.dp),
        )

        ScopeOptionRow(
            label = "All India",
            selected = selection.isAllIndia,
            enabled = enabled,
            onClick = onSelectAllIndia,
        )

        if (featuredStates.isNotEmpty()) {
            Text(
                text = "State-specific",
                color = Color(0xFF4B5563),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                featuredStates.forEach { stateName ->
                    StateChip(
                        stateName = stateName,
                        selected = selection.isState && selection.stateName.equals(stateName, ignoreCase = true),
                        enabled = enabled,
                        onClick = { onSelectState(stateName) },
                    )
                }
            }
        }

        if (expandedStates.isNotEmpty()) {
            TextButton(
                onClick = onToggleSeeAll,
                enabled = enabled,
                modifier = Modifier.padding(top = 4.dp),
            ) {
                Text(
                    text = if (showAllStates) "Show less" else "See all states",
                    color = ScopeDailyBlue,
                    fontSize = 14.sp,
                )
            }
            if (showAllStates) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    expandedStates.forEach { stateName ->
                        StateChip(
                            stateName = stateName,
                            selected = selection.isState && selection.stateName.equals(stateName, ignoreCase = true),
                            enabled = enabled,
                            onClick = { onSelectState(stateName) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ScopeOptionRow(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null, enabled = enabled)
        Text(
            text = label,
            color = if (selected) Color(0xFF1F2937) else Color(0xFF4B5563),
            fontSize = 15.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun StateChip(
    stateName: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    val bg = if (selected) ScopeDailyBlue else Color(0xFFF3F4F6)
    val fg = if (selected) Color.White else Color(0xFF374151)
    val borderColor = if (selected) ScopeDailyBlue else Color(0xFFD1D5DB)
    Text(
        text = stateName,
        color = fg,
        fontSize = 13.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        modifier = Modifier
            .clip(shape)
            .background(bg)
            .border(1.dp, borderColor, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}
