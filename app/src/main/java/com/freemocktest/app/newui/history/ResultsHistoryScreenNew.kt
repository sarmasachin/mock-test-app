package com.freemocktest.app.newui.history

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.freemocktest.app.newui.leaderboard.LeaderboardScreenNew

@Composable
fun ResultsHistoryScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    showAppBarBack: Boolean = true,
) {
    LeaderboardScreenNew(
        modifier = modifier,
        onBack = onBack,
    )
}

