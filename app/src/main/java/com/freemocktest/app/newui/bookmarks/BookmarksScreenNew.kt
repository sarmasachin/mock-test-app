package com.freemocktest.app.newui.bookmarks

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.view.MotionEvent
import android.widget.Toast
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.expandVertically
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlin.math.abs

private const val PdfToolTabName = "PDF Tools"
private const val PdfToolUrl = "https://mypdffile.onrender.com/"
private const val AgeCalculatorTabName = "Age Calculator"

@Composable
fun BookmarksScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    val context = LocalContext.current
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val tabs = remember {
        listOf(AgeCalculatorTabName, "Image Compress", "PDF Tools", "Unit Converter")
    }
    var selectedTab by remember { mutableStateOf(tabs.first()) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var showPdfHeader by remember { mutableStateOf(true) }
    BackHandler(enabled = selectedTab == PdfToolTabName && (webViewRef?.canGoBack() == true)) {
        webViewRef?.goBack()
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            val shouldShowHeader = selectedTab != PdfToolTabName || showPdfHeader
            AnimatedVisibility(
                visible = shouldShowHeader,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Column {
                    TopBar(
                        onBack = onBack,
                        title = "Tool",
                        onOpenProfile = onOpenProfile,
                    )
                    Spacer(Modifier.height(14.dp))
                    ToolTabRow(
                        tabs = tabs,
                        selected = selectedTab,
                        onSelect = {
                            selectedTab = it
                            showPdfHeader = true
                        },
                    )
                    Spacer(Modifier.height(14.dp))
                }
            }
            if (selectedTab == PdfToolTabName) {
                PdfToolWebViewCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    context = context,
                    onWebViewReady = { webViewRef = it },
                    onScrollDirectionChanged = { showOnUp ->
                        showPdfHeader = showOnUp
                    },
                )
            } else if (selectedTab == AgeCalculatorTabName) {
                AgeCalculatorToolCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else {
                ToolComingSoonCard(toolName = selectedTab)
            }
        }
    }
}

@Composable
private fun TopBar(
    onBack: () -> Unit,
    title: String,
    onOpenProfile: () -> Unit,
) {
    val p = mockTestPalette()
    val profileShape = RoundedCornerShape(10.dp)
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
        Spacer(Modifier.width(6.dp))
        Text(
            text = title,
            color = p.textPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.weight(1f),
        )
        Row(
            modifier = Modifier
                .clip(profileShape)
                .clickable(onClick = onOpenProfile)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.Person,
                contentDescription = "Open profile",
                tint = p.accent,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = "Profile",
                color = p.accent,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun ToolTabRow(
    tabs: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    val p = mockTestPalette()
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(tabs) { tab ->
            val isSelected = tab == selected
            val shape = RoundedCornerShape(14.dp)
            Box(
                modifier = Modifier
                    .height(40.dp)
                    .wrapContentWidth()
                    .clip(shape)
                    .background(if (isSelected) p.systemBlue else p.surface)
                    .border(1.dp, p.border.copy(alpha = 0.2f), shape)
                    .clickable { onSelect(tab) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = tab,
                    color = if (isSelected) Color.White else p.textPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun ToolComingSoonCard(
    toolName: String,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape)
            .padding(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = toolName,
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Coming Soon",
                color = p.textSecondary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun PdfToolStatusCard(
    modifier: Modifier = Modifier,
    title: String,
    message: String,
    primaryActionLabel: String,
    onPrimaryAction: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape)
            .padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
            color = p.textPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = message,
            color = p.textSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = onPrimaryAction,
            colors = ButtonDefaults.buttonColors(
                containerColor = p.primaryButton,
                contentColor = p.onPrimaryButton,
            ),
        ) {
            Text(primaryActionLabel)
        }
    }
}

@Composable
private fun PdfToolWebViewCard(
    modifier: Modifier = Modifier,
    context: Context,
    onWebViewReady: (WebView?) -> Unit,
    onScrollDirectionChanged: (Boolean) -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(22.dp)
    var networkRecheckKey by remember { mutableIntStateOf(0) }
    val isOnline = remember(networkRecheckKey) { isNetworkAvailable(context) }

    var isLoading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var lastTouchY by remember { mutableStateOf(0f) }
    var filePathCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var webViewHolder by remember { mutableStateOf<WebView?>(null) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = filePathCallback
        filePathCallback = null
        if (callback == null) return@rememberLauncherForActivityResult
        val uris = if (result.resultCode == Activity.RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                ?: result.data?.data?.let { arrayOf(it) }
        } else {
            null
        }
        callback.onReceiveValue(uris)
    }

    if (!isOnline) {
        DisposableEffect(Unit) {
            onDispose {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = null
                onWebViewReady(null)
            }
        }
        PdfToolStatusCard(
            modifier = modifier,
            title = "PDF Tools",
            message = "Internet is required to use this tool.",
            primaryActionLabel = "Check connection",
            onPrimaryAction = { networkRecheckKey++ },
        )
        return
    }

    Box(
        modifier = modifier
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { webContext ->
                WebView(webContext).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.loadsImagesAutomatically = true
                    settings.allowFileAccess = true
                    settings.builtInZoomControls = false
                    settings.displayZoomControls = false
                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallbackParam: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?,
                        ): Boolean {
                            filePathCallback?.onReceiveValue(null)
                            filePathCallback = filePathCallbackParam
                            val chooserIntent = try {
                                fileChooserParams?.createIntent()
                            } catch (_: Exception) {
                                null
                            } ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                                type = "*/*"
                            }
                            return try {
                                filePickerLauncher.launch(chooserIntent)
                                true
                            } catch (_: ActivityNotFoundException) {
                                filePathCallback = null
                                Toast.makeText(context, "No file picker app available", Toast.LENGTH_SHORT).show()
                                false
                            }
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                            loadFailed = false
                            isLoading = true
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            if (!loadFailed) {
                                isLoading = false
                            }
                        }

                        override fun onReceivedHttpError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            errorResponse: WebResourceResponse?,
                        ) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                                request?.isForMainFrame == true &&
                                (errorResponse?.statusCode ?: 0) >= 400
                            ) {
                                isLoading = false
                                loadFailed = true
                            }
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request?.isForMainFrame == true) {
                                isLoading = false
                                loadFailed = true
                            }
                        }

                        @Suppress("DEPRECATION")
                        override fun onReceivedError(
                            view: WebView?,
                            errorCode: Int,
                            description: String?,
                            failingUrl: String?,
                        ) {
                            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                                isLoading = false
                                loadFailed = true
                            }
                        }

                        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                isLoading = false
                                loadFailed = true
                                return true
                            }
                            return super.onRenderProcessGone(view, detail)
                        }
                    }
                    setOnScrollChangeListener { _, _, scrollY, _, oldScrollY ->
                        when {
                            scrollY < oldScrollY -> onScrollDirectionChanged(true)
                            scrollY > oldScrollY -> onScrollDirectionChanged(false)
                        }
                    }
                    setOnTouchListener { _, event ->
                        when (event.actionMasked) {
                            MotionEvent.ACTION_DOWN -> {
                                lastTouchY = event.y
                            }
                            MotionEvent.ACTION_MOVE -> {
                                val dy = event.y - lastTouchY
                                if (abs(dy) > 6f) {
                                    onScrollDirectionChanged(dy > 0f)
                                    lastTouchY = event.y
                                }
                            }
                        }
                        false
                    }
                    webViewHolder = this
                    onWebViewReady(this)
                    runCatching { loadUrl(PdfToolUrl) }.onFailure {
                        isLoading = false
                        loadFailed = true
                    }
                }
            },
            update = { onWebViewReady(it) },
        )
        if (isLoading && !loadFailed) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(p.surface.copy(alpha = 0.9f)),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = p.accent)
            }
        }
        if (loadFailed) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(p.surface.copy(alpha = 0.96f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = 22.dp),
                ) {
                    Text(
                        text = "Couldn't load PDF Tools",
                        color = p.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Check your connection and try again.",
                        color = p.textSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = {
                            if (!isNetworkAvailable(context)) {
                                Toast.makeText(
                                    context,
                                    "Internet required to open PDF Tool",
                                    Toast.LENGTH_SHORT,
                                ).show()
                                return@Button
                            }
                            loadFailed = false
                            isLoading = true
                            val w = webViewHolder
                            if (w != null) {
                                runCatching { w.reload() }.onFailure {
                                    isLoading = false
                                    loadFailed = true
                                }
                            } else {
                                isLoading = false
                                loadFailed = true
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = p.primaryButton,
                            contentColor = p.onPrimaryButton,
                        ),
                    ) {
                        Text("Try again")
                    }
                }
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
            webViewHolder = null
            onWebViewReady(null)
        }
    }
}

private fun isNetworkAvailable(context: Context): Boolean {
    return runCatching {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return@runCatching false
        val network = manager.activeNetwork ?: return@runCatching false
        val capabilities = manager.getNetworkCapabilities(network) ?: return@runCatching false
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }.getOrDefault(false)
}
