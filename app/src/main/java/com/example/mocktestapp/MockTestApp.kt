package com.example.mocktestapp

import android.app.Application
import android.util.Log
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.data.remote.RetrofitProvider
import com.example.mocktestapp.data.local.MockTestDatabase
import com.example.mocktestapp.notifications.MockTestNotificationChannels
import com.google.firebase.FirebaseApp

class MockTestApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppPreferencesRepository.init(this)
        AuthRepository.init(this)
        RetrofitProvider.init(this)
        TestHistoryRepository.init(MockTestDatabase.getInstance(this))
        MockTestNotificationChannels.ensureChannels(this)
        try {
            FirebaseApp.initializeApp(this)
        } catch (e: Exception) {
            Log.w(TAG, "Firebase init skipped or failed: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "MockTestApp"
    }
}
