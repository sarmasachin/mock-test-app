package com.freemocktest.app.notifications

import android.content.Context
import android.graphics.Bitmap
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import com.freemocktest.app.R

object NotificationBitmaps {
    fun largeIcon(context: Context): Bitmap? {
        val drawable = ContextCompat.getDrawable(context, R.drawable.ic_notification_large) ?: return null
        val density = context.resources.displayMetrics.density
        val size = (48f * density).toInt().coerceAtLeast(128)
        return drawable.toBitmap(size, size, Bitmap.Config.ARGB_8888)
    }
}
