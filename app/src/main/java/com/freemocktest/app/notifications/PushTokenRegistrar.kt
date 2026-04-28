package com.freemocktest.app.notifications

import android.content.Context
import android.os.Build
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.remote.DeviceTokenUpsertRequest
import com.freemocktest.app.data.remote.RetrofitProvider
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

object PushTokenRegistrar {
    fun syncInBackground(context: Context, knownToken: String? = null) {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                AuthRepository.loadStoredTokens()
                if (AuthRepository.peekAccessToken().isNullOrBlank()) return@runCatching
                val token = knownToken?.trim().orEmpty().ifBlank {
                    FirebaseMessaging.getInstance().token.await().trim()
                }
                if (token.isBlank()) return@runCatching
                RetrofitProvider.appApi.upsertDeviceToken(
                    DeviceTokenUpsertRequest(
                        deviceToken = token,
                        platform = "android",
                        appVersion = Build.VERSION.RELEASE ?: "",
                        deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                    ),
                )
            }
        }
    }
}
