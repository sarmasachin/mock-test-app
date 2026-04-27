package com.example.mocktestapp.notifications

import android.util.Log
import com.example.mocktestapp.BuildConfig
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.remote.DeviceTokenRegisterRequest
import com.example.mocktestapp.data.remote.RetrofitProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object PushTokenRegistrar {
    private const val TAG = "PushTokenRegistrar"

    fun sync(token: String) {
        val normalized = token.trim()
        if (normalized.length < 20) return
        val hasSession = !AuthRepository.peekAccessToken().isNullOrBlank()
        if (!hasSession) return
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                RetrofitProvider.appApi.registerDeviceToken(
                    DeviceTokenRegisterRequest(
                        token = normalized,
                        platform = "android",
                        appVersion = BuildConfig.VERSION_NAME,
                    ),
                )
            }.onFailure { e ->
                Log.w(TAG, "Device token sync failed", e)
            }
        }
    }
}
