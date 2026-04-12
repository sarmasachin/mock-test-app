package com.example.mocktestapp.newui.history

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun ResultsHistoryScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    showAppBarBack: Boolean = true,
) {
    HistoryScreenNew(
        modifier = modifier,
        onBack = onBack,
        title = "Results",
        showAppBarBack = showAppBarBack,
    )
}

