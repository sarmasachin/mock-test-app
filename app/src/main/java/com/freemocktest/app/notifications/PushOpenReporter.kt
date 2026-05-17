package com.freemocktest.app.notifications

import android.content.Context
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.remote.NotificationOpenRequest
import com.freemocktest.app.data.remote.RetrofitProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object PushOpenReporter {
    fun reportInBackground(context: Context, campaignId: String) {
        val id = campaignId.trim()
        if (id.isBlank()) return
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                AuthRepository.loadStoredTokens()
                if (AuthRepository.peekAccessToken().isNullOrBlank()) return@runCatching
                RetrofitProvider.appApi.recordNotificationOpen(NotificationOpenRequest(campaignId = id))
            }
        }
    }
}
