package com.example.mocktestapp

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import com.example.mocktestapp.newui.navigation.AppNavGraphNew
import com.example.mocktestapp.notifications.PushTokenRegistrar
import com.example.mocktestapp.notifications.PushNavigationBridge
import com.example.mocktestapp.newui.theme.MockTestThemeNew
import com.google.firebase.messaging.FirebaseMessaging

/**
 * App entry activity (declared in AndroidManifest.xml).
 */
class MainActivity : ComponentActivity() {
    private companion object {
        private const val TAG = "MainActivity"
    }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Log.i(TAG, "POST_NOTIFICATIONS denied — exam/job push may be limited")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handlePushIntent(intent)
        if (Build.VERSION.SDK_INT >= 33) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        runCatching {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    Log.d(TAG, "FCM token fetch success (len=${token.length})")
                    PushTokenRegistrar.sync(token)
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "FCM token fetch failed", e)
                }
        }
        setContent {
            // Follows system light/dark; UI colors come from theme palettes.
            MockTestThemeNew {
                AppNavGraphNew()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePushIntent(intent)
    }

    private fun handlePushIntent(intent: Intent?) {
        val route = intent?.getStringExtra("push_deep_link")?.trim().orEmpty()
        if (route.isNotBlank()) {
            PushNavigationBridge.publish(route)
        }
    }
}

