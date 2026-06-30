package com.freemocktest.app.notifications

import android.net.Uri

object PushRouteNormalizer {
    fun normalize(raw: String?): String? {
        val route = raw?.trim().orEmpty()
        if (route.isBlank()) return null
        val lower = route.lowercase()
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            val path = runCatching { Uri.parse(route).path?.trim('/')?.lowercase().orEmpty() }
                .getOrDefault("")
            if (path.isNotBlank()) return normalize(path)
            return null
        }
        return when (lower) {
            "home", "main/home" -> "main/home"
            "tests", "main/tests" -> "main/tests"
            "news", "main/news" -> "main/news"
            "profile", "main/profile" -> "main/profile"
            "poll" -> "poll"
            "notifications", "notification" -> "notifications"
            "menu_quiz", "daily", "daily_quiz" -> "menu_quiz"
            "job_alert", "jobs" -> "job_alert"
            "exam_alert", "exams" -> "exam_alert"
            else -> route
        }
    }
}
