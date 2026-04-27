package com.example.mocktestapp

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import com.example.mocktestapp.newui.navigation.AppNavGraphNew
import com.example.mocktestapp.notifications.PushTokenRegistrar
import com.example.mocktestapp.newui.theme.MockTestThemeNew
import com.google.firebase.messaging.FirebaseMessaging

/**
 * App entry activity (declared in AndroidManifest.xml).
 */
class MainActivity : ComponentActivity() {
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Log.i("MainActivity", "POST_NOTIFICATIONS denied — exam/job push may be limited")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        runCatching {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> PushTokenRegistrar.sync(token) }
        }
        setContent {
            // Follows system light/dark; UI colors come from theme palettes.
            MockTestThemeNew {
                AppNavGraphNew()
            }
        }
    }
}

