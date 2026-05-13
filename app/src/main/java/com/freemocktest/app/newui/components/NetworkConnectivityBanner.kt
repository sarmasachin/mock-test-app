package com.freemocktest.app.newui.components

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private enum class ConnectivityBannerKind {
    /** No banner (online since open, or after "Connected" dismissed). */
    Hidden,

    /** No default internet — red strip. */
    Offline,

    /** Came back from offline — green strip, then auto-hide. */
    OnlineAck,
}

private fun Context.readDefaultHasInternet(): Boolean {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
    val network = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(network) ?: return false
    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } else {
        true
    }
}

/**
 * Thin top strip: offline → red + warning; after reconnect → green "Connected" then hides.
 * Registers [ConnectivityManager] on the main thread; does not shift layout when hidden (height 0).
 */
@Composable
fun NetworkConnectivityBanner() {
    val context = LocalContext.current
    val stripState: MutableState<ConnectivityBannerKind> = remember(context) {
        mutableStateOf(
            if (context.readDefaultHasInternet()) ConnectivityBannerKind.Hidden
            else ConnectivityBannerKind.Offline,
        )
    }
    val kind by stripState

    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    DisposableEffect(context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (cm == null) {
            return@DisposableEffect onDispose { }
        }

        fun syncFromSystem() {
            val online = context.readDefaultHasInternet()
            mainHandler.post {
                val current = stripState.value
                stripState.value = when {
                    !online -> ConnectivityBannerKind.Offline
                    else -> when (current) {
                        ConnectivityBannerKind.Offline -> ConnectivityBannerKind.OnlineAck
                        ConnectivityBannerKind.OnlineAck -> ConnectivityBannerKind.OnlineAck
                        ConnectivityBannerKind.Hidden -> ConnectivityBannerKind.Hidden
                    }
                }
            }
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = syncFromSystem()
            override fun onLost(network: Network) = syncFromSystem()
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                syncFromSystem()
            }
        }

        runCatching { cm.registerDefaultNetworkCallback(callback) }
        mainHandler.post { syncFromSystem() }

        onDispose {
            runCatching { cm.unregisterNetworkCallback(callback) }
        }
    }

    LaunchedEffect(kind) {
        if (kind != ConnectivityBannerKind.OnlineAck) return@LaunchedEffect
        kotlinx.coroutines.delay(2_200)
        if (stripState.value == ConnectivityBannerKind.OnlineAck) {
            stripState.value = ConnectivityBannerKind.Hidden
        }
    }

    val visible = kind != ConnectivityBannerKind.Hidden
    AnimatedVisibility(
        visible = visible,
        enter = expandVertically(
            expandFrom = Alignment.Top,
            animationSpec = tween(240),
        ) + fadeIn(tween(220)),
        exit = shrinkVertically(
            shrinkTowards = Alignment.Top,
            animationSpec = tween(200),
        ) + fadeOut(tween(180)),
    ) {
        Crossfade(
            targetState = kind,
            modifier = Modifier.fillMaxWidth(),
            label = "connectivity_banner",
        ) { state ->
            when (state) {
                ConnectivityBannerKind.Offline -> {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color(0xFFB91C1C),
                        shadowElevation = 0.dp,
                        tonalElevation = 0.dp,
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Warning,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "Could Not Connect Internet",
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
                ConnectivityBannerKind.OnlineAck -> {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color(0xFF15803D),
                        shadowElevation = 0.dp,
                        tonalElevation = 0.dp,
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Wifi,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "Connected",
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
                ConnectivityBannerKind.Hidden -> {
                    Spacer(Modifier.height(0.dp))
                }
            }
        }
    }
}
