package com.example.mocktestapp.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object MockTestNotificationChannels {
    const val EXAMS_JOBS_ID = "exams_jobs_alerts_v2"
    const val DAILY_DIGEST_ID = "daily_digest"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val exams = NotificationChannel(
            EXAMS_JOBS_ID,
            "Exam & job alerts",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Exam dates, deadlines, and job alerts (FCM + local)."
            enableVibration(true)
            setShowBadge(true)
        }
        val daily = NotificationChannel(
            DAILY_DIGEST_ID,
            "Daily digest",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Question of the day and reminders." }
        manager.createNotificationChannel(exams)
        manager.createNotificationChannel(daily)
    }
}
