package com.freemocktest.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Keeps push bootstrap state healthy after reboot/app update.
 */
class PushBootstrapReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action.orEmpty()
        if (
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) {
            MockTestNotificationChannels.ensure(context.applicationContext)
            PushTokenRegistrar.syncInBackground(context.applicationContext)
        }
    }
}

