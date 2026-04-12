package com.example.mocktestapp.newui.news

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.example.mocktestapp.data.ContentRepository

@Composable
fun NewsDetailRouteNew(
    articleId: String,
    onBack: () -> Unit,
    imageSeedPrefix: String = NewsFeedImageSeedPrefix,
    modifier: Modifier = Modifier,
) {
    var item by remember(articleId) { mutableStateOf<ManualNewsItem?>(null) }
    var loading by remember(articleId) { mutableStateOf(true) }

    LaunchedEffect(articleId) {
        loading = true
        item = ContentRepository.resolveArticle(articleId)
        loading = false
    }

    when {
        loading -> {
            Box(
                modifier = modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }
        item != null -> {
            NewsArticleDetailScreen(
                item = item!!,
                onBack = onBack,
                imageSeedPrefix = imageSeedPrefix,
                modifier = modifier,
            )
        }
        else -> {
            NewsArticleDetailMissingScreen(onBack = onBack)
        }
    }
}
