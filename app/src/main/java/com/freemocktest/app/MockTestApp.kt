package com.freemocktest.app

import android.app.Application
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.TestHistoryRepository
import com.freemocktest.app.data.remote.RetrofitProvider
import com.freemocktest.app.data.local.MockTestDatabase
import com.freemocktest.app.notifications.MockTestNotificationChannels
import com.freemocktest.app.notifications.PushTokenRegistrar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking

class MockTestApp : Application() {
    override fun onCreate() {
        super.onCreate()
        appLaunchTimeMillis = System.currentTimeMillis()
        AppPreferencesRepository.init(this)
        AuthRepository.init(this)
        RetrofitProvider.init(this)
        runBlocking(Dispatchers.IO) {
            AppPreferencesRepository.applyInterestCatalogDefaultsMigration()
            AuthRepository.loadStoredTokens()
            ContentRepository.warmCachesFromDisk()
        }
        TestHistoryRepository.init(MockTestDatabase.getInstance(this))
        MockTestNotificationChannels.ensure(this)
        PushTokenRegistrar.syncInBackground(this)
    }

    companion object {
        var appLaunchTimeMillis: Long = 0L
            private set
    }
}
