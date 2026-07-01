package com.freemocktest.app.util

import java.util.concurrent.TimeUnit

data class AttemptAccessResult(
    val allowed: Boolean,
    val message: String? = null,
    val retryAtMillis: Long? = null,
    val attemptsUsed: Int = 0,
    val attemptsAllowed: Int = 1,
)

/**
 * Client-side attempt limit checks (mirrors server [evaluateAttemptAccess]).
 *
 * - [attemptsAllowed]: max scored submissions per test catalog id (typical default 1).
 * - [reattemptCooldownMinutes]: minimum gap before another try in the same cycle.
 * - Does **not** control shuffle; new shuffle order comes from a new catalog cycle + re-apply.
 *
 * @see com.freemocktest.app.util.ShuffleAttemptRules
 */
object TestAttemptPolicy {
    fun evaluate(
        attemptsAllowed: Int,
        reattemptCooldownMinutes: Int,
        attemptsUsed: Int,
        lastAttemptAtMillis: Long?,
        nowMillis: Long = System.currentTimeMillis(),
    ): AttemptAccessResult {
        val allowedAttempts = attemptsAllowed.coerceAtLeast(1)
        val used = attemptsUsed.coerceAtLeast(0)
        if (used >= allowedAttempts) {
            return AttemptAccessResult(
                allowed = false,
                message = "You have used all allowed attempts for this test",
                attemptsUsed = used,
                attemptsAllowed = allowedAttempts,
            )
        }
        val cooldownMinutes = reattemptCooldownMinutes.coerceAtLeast(0)
        if (cooldownMinutes > 0 && used > 0 && lastAttemptAtMillis != null && lastAttemptAtMillis > 0L) {
            val retryAt = lastAttemptAtMillis + TimeUnit.MINUTES.toMillis(cooldownMinutes.toLong())
            if (nowMillis < retryAt) {
                return AttemptAccessResult(
                    allowed = false,
                    message = "Please wait before reattempting this test",
                    retryAtMillis = retryAt,
                    attemptsUsed = used,
                    attemptsAllowed = allowedAttempts,
                )
            }
        }
        return AttemptAccessResult(
            allowed = true,
            attemptsUsed = used,
            attemptsAllowed = allowedAttempts,
        )
    }
}
