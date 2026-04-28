package com.freemocktest.app

import android.content.Intent
import android.content.pm.PackageManager
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
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val permission = android.Manifest.permission.POST_NOTIFICATIONS
        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(this, arrayOf(permission), 1401)
    }
}

