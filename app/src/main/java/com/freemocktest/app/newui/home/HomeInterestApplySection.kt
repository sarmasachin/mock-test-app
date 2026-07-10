package com.freemocktest.app.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.util.AppliedTestHomeUi
import com.freemocktest.app.util.UserInterestUtils
import com.freemocktest.app.newui.theme.palette.mockTestPalette

/**
 * Phase 3 — quick apply chips for login interests not yet in applied list.
 */
@Composable
fun HomeInterestApplySection(
    interests: List<String>,
    appliedHomeState: AppliedTestHomeUi.HomeAppliedTestsUiState,
    onApplyInterest: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val normalizedInterests = remember(interests) {
        UserInterestUtils.normalizeInterestSubcategories(interests)
    }
    val pendingInterests = remember(normalizedInterests, appliedHomeState.activeEntries) {
        normalizedInterests.filter { interest ->
            appliedHomeState.activeEntries.none { entry ->
                entry.testName.equals(interest, ignoreCase = true) ||
                    UserInterestUtils.subcategoryMatchesAnyInterest(entry.testName, listOf(interest))
            }
        }.take(4)
    }
    if (pendingInterests.isEmpty()) return

    val p = mockTestPalette()
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Quick Apply",
            color = p.textPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.padding(horizontal = 14.dp),
        )
        Text(
            text = "Your selected exams — tap to apply",
            color = p.textSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(
                items = pendingInterests,
                key = { it.lowercase() },
            ) { interest ->
                val shape = RoundedCornerShape(999.dp)
                Text(
                    text = interest,
                    color = p.systemBlue,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .clip(shape)
                        .border(1.dp, p.systemBlue.copy(alpha = 0.35f), shape)
                        .background(p.surface)
                        .clickable { onApplyInterest(interest) }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                )
            }
        }
    }
}
