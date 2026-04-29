package com.freemocktest.app

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.freemocktest.app.newui.navigation.AppNavGraphNew
import com.freemocktest.app.notifications.PushNavigationBridge
import com.freemocktest.app.newui.theme.MockTestThemeNew

/**
 * App entry activity (declared in AndroidManifest.xml).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()
        handlePushIntent(intent)
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
            return
        }
        val deeplinkRoute = intent?.data?.toAppRoute()
        if (!deeplinkRoute.isNullOrBlank()) {
            PushNavigationBridge.publish(deeplinkRoute)
        }
    }

    private fun Uri.toAppRoute(): String? {
        if (!scheme.equals("mocktestapp", ignoreCase = true)) return null
        val hostValue = host?.trim()?.lowercase().orEmpty()
        val pathValue = path.orEmpty().trim().lowercase()
        return when {
            hostValue == "complete-profile" -> "complete_profile"
            hostValue == "open" && pathValue == "/complete-profile" -> "complete_profile"
            else -> null
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val permission = android.Manifest.permission.POST_NOTIFICATIONS
        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(this, arrayOf(permission), 1401)
    }
}

