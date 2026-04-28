package com.freemocktest.app.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.CalendarContract
import android.util.Log

/**
 * Opens the device calendar app to add an event (exam reminder).
 * Replace fixed times with your backend exam schedule.
 */
object CalendarEventHelper {
    private const val TAG = "CalendarEventHelper"

    /**
     * @return true if a calendar handler was started, false if no app could handle the intent.
     */
    fun openInsertExamReminder(
        context: Context,
        title: String,
        description: String,
        beginTimeMillis: Long,
        endTimeMillis: Long,
    ): Boolean {
        val intent = Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, title)
            putExtra(CalendarContract.Events.DESCRIPTION, description)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginTimeMillis)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTimeMillis)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val chooser = Intent.createChooser(intent, "Add to calendar")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            context.startActivity(chooser)
            true
        }.getOrElse { e ->
            if (e is ActivityNotFoundException) {
                Log.w(TAG, "No calendar app available", e)
            } else {
                Log.e(TAG, "Could not open calendar", e)
            }
            false
        }
    }
}
