package com.freemocktest.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object MockTestNotificationChannels {
    const val GENERAL_CHANNEL_ID: String = "general_notifications"

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            GENERAL_CHANNEL_ID,
            "General Notifications",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Important alerts and updates from admin"
        }
        manager.createNotificationChannel(channel)
    }
}
