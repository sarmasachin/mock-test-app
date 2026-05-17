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
import com.freemocktest.app.notifications.PushOpenReporter
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
        intent.extractPushCampaignId().takeIf { it.isNotBlank() }?.let { campaignId ->
            PushOpenReporter.reportInBackground(applicationContext, campaignId)
        }
        val route = intent.extractPushRoute()
        if (route.isNotBlank()) {
            PushNavigationBridge.publish(route)
            return
        }
        val deeplinkRoute = intent?.data?.toAppRoute()
        if (!deeplinkRoute.isNullOrBlank()) {
            PushNavigationBridge.publish(deeplinkRoute)
        }
    }

    /**
     * Foreground/local notifications use [push_deep_link].
     * Background FCM (system tray) delivers data payload keys on the launch intent (e.g. deepLink).
     */
    private fun Intent?.extractPushRoute(): String {
        if (this == null) return ""
        getStringExtra("push_deep_link")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        getStringExtra("deepLink")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        val bundle = extras ?: return ""
        for (key in bundle.keySet()) {
            if (!key.equals("deepLink", ignoreCase = true)) continue
            bundle.getString(key)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        }
        return ""
    }

    private fun Intent?.extractPushCampaignId(): String {
        if (this == null) return ""
        getStringExtra("campaignId")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        getStringExtra("push_campaign_id")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        val bundle = extras ?: return ""
        for (key in bundle.keySet()) {
            if (!key.equals("campaignId", ignoreCase = true)) continue
            bundle.getString(key)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        }
        return ""
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

