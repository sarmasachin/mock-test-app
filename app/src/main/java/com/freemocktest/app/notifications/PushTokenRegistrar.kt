package com.freemocktest.app.notifications

import android.content.Context
import android.os.Build
import android.util.Log
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.remote.DeviceTokenUpsertRequest
import com.freemocktest.app.data.remote.RetrofitProvider
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import retrofit2.HttpException

object PushTokenRegistrar {
    private const val TAG = "PushTokenRegistrar"
    private const val MAX_ATTEMPTS = 3
    private val syncMutex = Mutex()

    fun syncInBackground(context: Context, knownToken: String? = null) {
        CoroutineScope(Dispatchers.IO).launch {
            syncMutex.withLock {
                syncOnce(knownToken)
            }
        }
    }

    private suspend fun syncOnce(knownToken: String?) {
        AuthRepository.loadStoredTokens()
        if (AuthRepository.peekAccessToken().isNullOrBlank()) {
            Log.d(TAG, "skip: not logged in")
            return
        }

        val fcmToken = runCatching {
            knownToken?.trim().orEmpty().ifBlank {
                FirebaseMessaging.getInstance().token.await().trim()
            }
        }.getOrElse { error ->
            Log.w(TAG, "FCM token fetch failed", error)
            return
        }
        if (fcmToken.length < 20) {
            Log.w(TAG, "skip: FCM token too short")
            return
        }

        if (AuthRepository.peekAccessToken().isNullOrBlank()) {
            Log.d(TAG, "skip: logged out before upsert")
            return
        }

        var lastError: Throwable? = null
        for (attempt in 1..MAX_ATTEMPTS) {
            try {
                val response = RetrofitProvider.appApi.upsertDeviceToken(
                    DeviceTokenUpsertRequest(
                        deviceToken = fcmToken,
                        platform = "android",
                        appVersion = Build.VERSION.RELEASE ?: "",
                        deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                    ),
                )
                if (response.ok) {
                    Log.i(TAG, "device token synced (attempt $attempt)")
                    return
                }
                Log.w(TAG, "upsert returned ok=false (attempt $attempt)")
            } catch (error: HttpException) {
                lastError = error
                if (error.code() == 401 && attempt < MAX_ATTEMPTS) {
                    val refreshed = AuthRepository.silentRefreshAccessToken()
                    if (refreshed.isNullOrBlank()) {
                        Log.w(TAG, "upsert 401 and token refresh failed (attempt $attempt)", error)
                        return
                    }
                    delay(300L)
                    continue
                }
                Log.w(TAG, "upsert http ${error.code()} (attempt $attempt)", error)
            } catch (error: Exception) {
                lastError = error
                Log.w(TAG, "upsert failed (attempt $attempt)", error)
            }
            if (attempt < MAX_ATTEMPTS) {
                delay(if (attempt == 1) 1_000L else 3_000L)
            }
        }
        Log.e(TAG, "device token sync failed after $MAX_ATTEMPTS attempts", lastError)
    }
}
