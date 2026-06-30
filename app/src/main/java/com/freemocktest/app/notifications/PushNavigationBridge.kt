package com.freemocktest.app.notifications

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object PushNavigationBridge {
    private const val PREFS_NAME = "push_navigation_bridge"
    private const val KEY_PENDING_ROUTE = "pending_route"

    private val _pendingRoute = MutableStateFlow<String?>(null)
    val pendingRoute: StateFlow<String?> = _pendingRoute

    fun publish(context: Context?, route: String?) {
        val normalized = PushRouteNormalizer.normalize(route) ?: return
        _pendingRoute.value = normalized
        val appContext = context?.applicationContext ?: return
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PENDING_ROUTE, normalized)
            .apply()
    }

    fun peek(context: Context): String? {
        _pendingRoute.value?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        return context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_PENDING_ROUTE, null)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }

    fun consume(context: Context?) {
        _pendingRoute.value = null
        val appContext = context?.applicationContext ?: return
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_PENDING_ROUTE)
            .apply()
    }
}
