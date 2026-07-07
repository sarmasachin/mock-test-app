package com.freemocktest.app.notifications

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.freemocktest.app.MainActivity
import com.freemocktest.app.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.random.Random

class MockTestFirebaseMessagingService : FirebaseMessagingService() {
    override fun onCreate() {
        super.onCreate()
        MockTestNotificationChannels.ensure(this)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        PushTokenRegistrar.syncInBackground(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val title = message.notification?.title?.trim().orEmpty()
            .ifBlank { data["title"]?.trim().orEmpty() }
            .ifBlank { "Gov Mock Test" }
        val body = message.notification?.body?.trim().orEmpty()
            .ifBlank { data["message"]?.trim().orEmpty() }
        if (body.isBlank()) return
        val deepLink = data["deepLink"]?.trim().orEmpty()
        val campaignId = data["campaignId"]?.trim().orEmpty()
        val dedupeKey = PushNotificationIdentity.resolveDedupeKey(data, title, body, deepLink)
        LocalNotificationInbox.save(
            context = applicationContext,
            title = title,
            message = body,
            deepLink = deepLink,
            dedupeKey = dedupeKey.takeIf { it.isNotBlank() },
        )
        if (!canShowTrayNotification()) return
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (deepLink.isNotBlank()) putExtra("push_deep_link", deepLink)
            if (campaignId.isNotBlank()) putExtra("campaignId", campaignId)
        }
        val notificationId = resolveTrayNotificationId(dedupeKey)
        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val largeIcon = NotificationBitmaps.largeIcon(this)
        val notification = NotificationCompat.Builder(this, MockTestNotificationChannels.GENERAL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .apply { largeIcon?.let { setLargeIcon(it) } }
            .setColor(ContextCompat.getColor(this@MockTestFirebaseMessagingService, R.color.launcher_icon_blue))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(notificationId, notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "tray notify blocked: missing POST_NOTIFICATIONS", e)
        }
    }

    private fun resolveTrayNotificationId(dedupeKey: String): Int {
        val stableId = PushNotificationIdentity.stableTrayNotificationId(dedupeKey)
        if (stableId > 0) return stableId
        return Random.nextInt(1, Int.MAX_VALUE)
    }

    private fun canShowTrayNotification(): Boolean {
        val manager = NotificationManagerCompat.from(this)
        if (!manager.areNotificationsEnabled()) {
            Log.w(TAG, "tray skipped: notifications disabled in system settings")
            return false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                Log.w(TAG, "tray skipped: POST_NOTIFICATIONS not granted")
                return false
            }
        }
        return true
    }

    private companion object {
        private const val TAG = "MockTestFcmService"
    }
}
