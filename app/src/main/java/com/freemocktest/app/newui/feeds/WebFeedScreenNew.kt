package com.freemocktest.app.newui.feeds

import android.annotation.SuppressLint
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.rounded.ArrowBack
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
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.FeedKind
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

object WebFeedDefaults {
    /** Replace with your job / exam portal; WebView loads the live site. */
    const val JOB_URL = "https://www.sarkariresult.com/latestjob/"
    const val EXAM_URL = "https://ssc.nic.in/"
}

@Composable
fun WebFeedScreenNew(
    modifier: Modifier = Modifier,
    title: String,
    initialUrl: String,
    feedKind: FeedKind,
    onBack: () -> Unit,
    /** Optional block above WebView (e.g. News title + feature image). */
    heroHeader: (@Composable () -> Unit)? = null,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val cachedUrl by AppPreferencesRepository.lastFeedUrl(feedKind).collectAsState(initial = null)

    val loadError: MutableState<String?> = remember { mutableStateOf(null) }
    val webViewRef: MutableState<WebView?> = remember { mutableStateOf(null) }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(4.dp))
                Text(
                    text = title,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Live page (WebView). Offline: last loaded URL is cached on device.",
                color = p.textSecondary,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
            if (!cachedUrl.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Last opened: $cachedUrl",
                    color = p.textSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
            if (heroHeader != null) {
                Spacer(Modifier.height(12.dp))
                heroHeader()
            }
            Spacer(Modifier.height(10.dp))
            val shape = RoundedCornerShape(16.dp)
            Card(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, p.border.copy(alpha = 0.14f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                val err by loadError
                Box(Modifier.fillMaxSize()) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            WebView(context).apply {
                                webViewRef.value = this
                                webChromeClient = WebChromeClient()
                                webViewClient = object : WebViewClient() {
                                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                                        super.onPageStarted(view, url, favicon)
                                        loadError.value = null
                                    }

                                    override fun onPageFinished(view: WebView?, url: String?) {
                                        super.onPageFinished(view, url)
                                        if (!url.isNullOrBlank()) {
                                            AppPreferencesRepository.cacheFeedUrl(feedKind, url)
                                        }
                                    }

                                    override fun onReceivedError(
                                        view: WebView?,
                                        request: WebResourceRequest?,
                                        error: WebResourceError?,
                                    ) {
                                        super.onReceivedError(view, request, error)
                                        if (request?.isForMainFrame != true) return
                                        val desc = error?.description?.toString()
                                        loadError.value = (desc ?: "Page could not load").take(220)
                                    }

                                    override fun onReceivedHttpError(
                                        view: WebView?,
                                        request: WebResourceRequest?,
                                        errorResponse: WebResourceResponse?,
                                    ) {
                                        super.onReceivedHttpError(view, request, errorResponse)
                                        if (request?.isForMainFrame != true) return
                                        val code = errorResponse?.statusCode ?: return
                                        if (code >= 400) {
                                            loadError.value = "Could not load page (HTTP $code)"
                                        }
                                    }

                                    override fun onRenderProcessGone(
                                        view: WebView?,
                                        detail: RenderProcessGoneDetail?,
                                    ): Boolean {
                                        loadError.value = "Page stopped unexpectedly. Tap Retry."
                                        webViewRef.value = null
                                        return true
                                    }
                                }
                                @SuppressLint("SetJavaScriptEnabled")
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                            }
                        },
                        update = { wv ->
                            webViewRef.value = wv
                        },
                    )

                    LaunchedEffect(initialUrl) {
                        loadError.value = null
                        webViewRef.value?.loadUrl(initialUrl)
                    }

                    err?.let { message ->
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(p.surface.copy(alpha = 0.97f))
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                text = message,
                                color = p.error,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(14.dp))
                            Button(
                                onClick = {
                                    loadError.value = null
                                    webViewRef.value?.loadUrl(initialUrl)
                                },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.primaryButton,
                                    contentColor = p.onPrimaryButton,
                                ),
                            ) {
                                Text(text = "Retry", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
