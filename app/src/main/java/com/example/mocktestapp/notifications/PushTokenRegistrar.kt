package com.example.mocktestapp.notifications

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

    fun sync(token: String) {
        val normalized = token.trim()
        if (normalized.length < 20) return
        val hasSession = !AuthRepository.peekAccessToken().isNullOrBlank()
        if (!hasSession) return
        CoroutineScope(Dispatchers.IO).launch {
            var done = false
            repeat(3) { attempt ->
                runCatching {
                    RetrofitProvider.appApi.registerDeviceToken(
                        DeviceTokenRegisterRequest(
                            token = normalized,
                            platform = "android",
                            appVersion = BuildConfig.VERSION_NAME,
                        ),
                    )
                }.onSuccess {
                    done = true
                    Log.d(TAG, "Device token sync success (attempt ${attempt + 1})")
                }.onFailure { e ->
                    Log.w(TAG, "Device token sync failed (attempt ${attempt + 1})", e)
                }
                if (done) return@launch
                delay((attempt + 1) * 1500L)
            }
        }
    }
}
