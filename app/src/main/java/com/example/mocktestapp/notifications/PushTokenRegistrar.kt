package com.example.mocktestapp.notifications

import android.content.Context
import android.provider.Settings
import android.util.Log
import com.example.mocktestapp.BuildConfig
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.remote.DeviceTokenRegisterRequest
import com.example.mocktestapp.data.remote.RetrofitProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

object PushTokenRegistrar {
    private const val TAG = "PushTokenRegistrar"
    @Volatile
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun getDeviceIdOrNull(): String? {
        val ctx = appContext ?: return null
        val raw = runCatching {
            Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID)
        }.getOrNull()
        val value = raw?.trim().orEmpty()
        return value.takeIf { it.isNotBlank() && it.lowercase() != "unknown" }
    }

    fun sync(token: String) {
        val normalized = token.trim()
        if (normalized.length < 20) {
            Log.w(TAG, "Skip device token sync: token too short (len=${normalized.length})")
            Log.w("FCM_DEBUG", "SYNC_SKIP_SHORT len=${normalized.length}")
            return
        }
        val hasSession = !AuthRepository.peekAccessToken().isNullOrBlank()
        if (!hasSession) {
            Log.d(TAG, "Skip device token sync: no auth session yet")
            Log.d("FCM_DEBUG", "SYNC_SKIP_NO_SESSION len=${normalized.length}")
            return
        }
        val deviceId = getDeviceIdOrNull()
        if (deviceId.isNullOrBlank()) {
            // Keep backwards-compatible behavior: old server logic can still upsert by token.
            Log.w(TAG, "Device id unavailable; registering token without deviceId")
            Log.w("FCM_DEBUG", "SYNC_DEVICE_ID_MISSING len=${normalized.length}")
        }
        Log.d(
            "FCM_DEBUG",
            "SYNC_START len=${normalized.length} deviceId=${deviceId?.take(8)} tokenStart=${normalized.take(8)} tokenEnd=${normalized.takeLast(8)}",
        )
        CoroutineScope(Dispatchers.IO).launch {
            var done = false
            repeat(3) { attempt ->
                runCatching {
                    RetrofitProvider.appApi.registerDeviceToken(
                        DeviceTokenRegisterRequest(
                            token = normalized,
                            deviceId = deviceId,
                            platform = "android",
                            appVersion = BuildConfig.VERSION_NAME,
                        ),
                    )
                }.onSuccess {
                    done = true
                    Log.d(TAG, "Device token sync success (attempt ${attempt + 1})")
                    Log.d("FCM_DEBUG", "SYNC_SUCCESS attempt=${attempt + 1}")
                }.onFailure { e ->
                    Log.w(TAG, "Device token sync failed (attempt ${attempt + 1})", e)
                    Log.e("FCM_DEBUG", "SYNC_FAILED attempt=${attempt + 1}", e)
                }
                if (done) return@launch
                delay((attempt + 1) * 1500L)
            }
        }
    }
}
