package com.example.mocktestapp.notifications

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.mocktestapp.MainActivity
import com.example.mocktestapp.data.AppPreferencesRepository
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.runBlocking

/**
 * Receives FCM data/push when backend sends to device tokens.
 */
class MockTestFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        PushTokenRegistrar.sync(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        runCatching {
            val notificationsOn = runBlocking { AppPreferencesRepository.notificationsEnabledNow() }
            if (!notificationsOn) {
                Log.d(TAG, "Notification dropped: user notifications disabled")
                return@runCatching
            }
            val title = message.notification?.title ?: message.data["title"] ?: "MockTestApp"
            val body = message.notification?.body ?: message.data["body"] ?: "New update"
            val open = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pending = PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = NotificationCompat.Builder(this, MockTestNotificationChannels.EXAMS_JOBS_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build()
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (nm == null) {
                Log.w(TAG, "NotificationManager unavailable")
                return@runCatching
            }
            nm.notify(message.messageId?.hashCode() ?: 0, notification)
        }.onFailure { e ->
            Log.e(TAG, "FCM notification failed", e)
        }
    }

    private companion object {
        private const val TAG = "MockTestFCM"
    }
}
