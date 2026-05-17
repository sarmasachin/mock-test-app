package com.freemocktest.app.notifications

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
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
        val title = message.notification?.title?.trim().orEmpty().ifBlank { "MockTestApp" }
        val body = message.notification?.body?.trim().orEmpty()
            .ifBlank { message.data["message"]?.trim().orEmpty() }
        if (body.isBlank()) return
        val deepLink = message.data["deepLink"]?.trim().orEmpty()
        val campaignId = message.data["campaignId"]?.trim().orEmpty()
        LocalNotificationInbox.save(
            context = applicationContext,
            title = title,
            message = body,
            deepLink = deepLink,
        )
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (deepLink.isNotBlank()) putExtra("push_deep_link", deepLink)
            if (campaignId.isNotBlank()) putExtra("campaignId", campaignId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            Random.nextInt(100000, 999999),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, MockTestNotificationChannels.GENERAL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .build()
        NotificationManagerCompat.from(this).notify(Random.nextInt(1, Int.MAX_VALUE), notification)
    }
}
