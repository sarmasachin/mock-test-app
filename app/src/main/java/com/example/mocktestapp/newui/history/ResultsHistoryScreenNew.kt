package com.example.mocktestapp.newui.history

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.example.mocktestapp.newui.leaderboard.LeaderboardScreenNew

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

