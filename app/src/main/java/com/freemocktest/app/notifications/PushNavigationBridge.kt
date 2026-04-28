package com.freemocktest.app.notifications

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object PushNavigationBridge {
    private val _pendingRoute = MutableStateFlow<String?>(null)
    val pendingRoute: StateFlow<String?> = _pendingRoute

    fun publish(route: String?) {
        val normalized = route?.trim().orEmpty()
        if (normalized.isBlank()) return
        _pendingRoute.value = normalized
    }

    fun consume() {
        _pendingRoute.value = null
    }
}

