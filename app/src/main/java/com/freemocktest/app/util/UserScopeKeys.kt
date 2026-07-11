package com.freemocktest.app.util

import java.util.Locale

/**
 * Canonical per-user local storage key (mock test history, quiz cache, etc.).
 * Matches [com.freemocktest.app.data.AppPreferencesRepository] content-state owner id.
 */
object UserScopeKeys {

    private val UID_ONLY_PATTERN = Regex("^\\d{6,8}$")

    /**
     * Primary owner id: lowercase email/contact, else `uid:123456`.
     */
    fun resolveCanonicalKey(
        email: String,
        contact: String,
        userIdFormatted: String?,
    ): String {
        val mail = email.trim()
        if (mail.isNotBlank()) return mail.lowercase(Locale.US)
        val phoneOrContact = contact.trim()
        if (phoneOrContact.isNotBlank()) return phoneOrContact.lowercase(Locale.US)
        val uid = userIdFormatted?.trim().orEmpty()
        if (uid.isNotBlank()) return "uid:$uid"
        return ""
    }

    /** Normalize any legacy stored/saved key to the canonical form. */
    fun canonicalizeLegacyKey(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return ""
        if (trimmed.contains('@')) return trimmed.lowercase(Locale.US)
        val lower = trimmed.lowercase(Locale.US)
        if (lower.startsWith("uid:")) {
            val digits = trimmed.substringAfter(':').trim()
            return if (digits.isNotBlank()) "uid:$digits" else ""
        }
        if (UID_ONLY_PATTERN.matches(trimmed)) return "uid:$trimmed"
        return lower
    }

    /**
     * Keys that may exist in Room from older builds (raw uid, mixed-case email, etc.).
     */
    fun lookupKeys(canonicalScopeKey: String, userIdFormatted: String?): List<String> {
        val canonical = canonicalScopeKey.trim().let { canonicalizeLegacyKey(it) }
        if (canonical.isBlank()) return emptyList()
        val keys = linkedSetOf(canonical)
        val uid = userIdFormatted?.trim().orEmpty()
        if (uid.isNotBlank()) {
            keys.add(uid)
            keys.add("uid:$uid")
        }
        if (canonical.startsWith("uid:", ignoreCase = true)) {
            val digits = canonical.substringAfter(':').trim()
            if (digits.isNotBlank()) keys.add(digits)
        }
        return keys.toList()
    }
}
