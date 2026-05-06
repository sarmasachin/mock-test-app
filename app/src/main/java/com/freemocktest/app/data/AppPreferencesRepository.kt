package com.freemocktest.app.data

import android.content.Context
import android.util.Log
import com.freemocktest.app.BuildConfig
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import com.freemocktest.app.newui.auth.isValidEmail
import com.freemocktest.app.newui.auth.isValidMobile
import java.time.LocalDate
import java.util.Locale
import kotlin.random.Random
import org.json.JSONArray
import org.json.JSONObject

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "mocktest_prefs")

enum class FeedKind { Job, Exam, News }

object AppPreferencesRepository {
    private const val TAG = "MockTestPrefs"

    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.IO + CoroutineExceptionHandler { _, e ->
            Log.e(TAG, "Preferences coroutine failed", e)
        },
    )
    private lateinit var appContext: Context

    private val keyStreak = intPreferencesKey("streak_days")
    private val keyLastDigestDay = stringPreferencesKey("last_digest_day")
    private val keyLastTestName = stringPreferencesKey("last_opened_test_name")
    private val keyLastTestTime = longPreferencesKey("last_opened_test_time")
    private val keyLastFeedJob = stringPreferencesKey("last_feed_job_url")
    private val keyLastFeedExam = stringPreferencesKey("last_feed_exam_url")
    private val keyLastFeedNews = stringPreferencesKey("last_feed_news_url")
    private val keyEmailVerified = intPreferencesKey("email_verified")
    private val keyPhoneVerified = intPreferencesKey("phone_verified")
    private val keyProfileDisplayName = stringPreferencesKey("profile_display_name")
    private val keyProfileContact = stringPreferencesKey("profile_contact")
    private val keyProfileEmail = stringPreferencesKey("profile_email")
    private val keyProfileMobile = stringPreferencesKey("profile_mobile")
    private val keyProfileGender = stringPreferencesKey("profile_gender")
    /** Cached from server `birthdayDate` (YYYY-MM-DD). */
    private val keyProfileBirthdayDate = stringPreferencesKey("profile_birthday_date")
    private val keyProfileNotificationsEnabled = intPreferencesKey("profile_notifications_enabled")
    private val keyScoreVisibilityEnabled = intPreferencesKey("score_visibility_enabled")
    /** Stored numeric id: server `six_digit_public_id` (100000–999999) or legacy local 8-digit; 0 = not assigned. */
    private val keyProfileUserCode = intPreferencesKey("profile_user_code")
    private val keyPendingResultTestName = stringPreferencesKey("pending_result_test_name")
    private val keyPendingResultPublishAt = longPreferencesKey("pending_result_publish_at")
    private val keyPendingResultViewed = intPreferencesKey("pending_result_viewed")
    private val keyPendingResultAnswered = intPreferencesKey("pending_result_answered")
    private val keyPendingResultCorrect = intPreferencesKey("pending_result_correct")
    private val keyPendingResultWrong = intPreferencesKey("pending_result_wrong")
    private val keyPendingResultTotal = intPreferencesKey("pending_result_total")
    private val keyAppliedTestSeries = stringPreferencesKey("applied_test_series")
    /** Single JSON blob: recover quiz after process death / swipe away only (cleared on explicit back/submit). */
    private val keyInProgressQuizJson = stringPreferencesKey("in_progress_quiz_json")
    private val keyAuthBootstrapState = stringPreferencesKey("auth_bootstrap_state")
    private val keySeenNotificationIds = stringPreferencesKey("seen_notification_ids")
    // Keep "seen" state user-scoped. If a different user signs in on the same device,
    // old ids must not affect unread badges for the new account.
    private val keySeenNotificationIdsOwner = stringPreferencesKey("seen_notification_ids_owner")
    private val keySeenPollIds = stringPreferencesKey("seen_poll_ids")
    private val keySeenPollIdsOwner = stringPreferencesKey("seen_poll_ids_owner")
    private val keyVotedPollIds = stringPreferencesKey("voted_poll_ids")
    private val keyVotedPollIdsOwner = stringPreferencesKey("voted_poll_ids_owner")

    private const val DefaultStartSeriesLockMs = 20_000L
    private const val DefaultStartSeriesActiveWindowMs = 30 * 60 * 1000L
    private const val HourMs = 60 * 60 * 1000L

    /** Matches server `pickSixDigit()` in auth.js (100000–999999 inclusive). */
    private const val MIN_SIX_DIGIT_PUBLIC_ID = 100_000
    private const val MAX_SIX_DIGIT_PUBLIC_ID = 999_999

    /** Older builds assigned a local-only id in this range before server ids were persisted correctly. */
    private const val MIN_LEGACY_EIGHT_DIGIT_USER_CODE = 10_000_000
    private const val MAX_LEGACY_EIGHT_DIGIT_USER_CODE = 99_999_999

    data class EditableProfileState(
        val displayName: String,
        val email: String,
        val mobile: String,
        val gender: String,
        val birthdayDate: String,
    )

    val editableProfile: Flow<EditableProfileState>
        get() = storeOrNull()?.data?.map { prefs ->
            val legacyContact = prefs[keyProfileContact].orEmpty()
            val emailStored = prefs[keyProfileEmail].orEmpty()
            val email = emailStored.ifBlank {
                if (legacyContact.contains('@')) legacyContact else ""
            }
            val mobile = prefs[keyProfileMobile].orEmpty().ifBlank {
                if (legacyContact.isNotBlank() && !legacyContact.contains('@')) legacyContact else ""
            }
            EditableProfileState(
                displayName = prefs[keyProfileDisplayName].orEmpty(),
                email = email,
                mobile = mobile,
                gender = prefs[keyProfileGender].orEmpty(),
                birthdayDate = prefs[keyProfileBirthdayDate].orEmpty(),
            )
        } ?: flowOf(EditableProfileState("", "", "", "", ""))

    data class DrawerUserProfile(
        /** Username from signup / profile (shown first in drawer). */
        val displayName: String,
        /** Email line under name (Gmail etc.); drawer does not mix mobile here. */
        val emailLine: String,
        /** Formatted public id (6 digits when synced with server; legacy local may show 8); null if none. */
        val userIdFormatted: String?,
    )

    data class PendingResultState(
        val testName: String,
        val publishAtMillis: Long,
        val answered: Int,
        val correct: Int,
        val wrong: Int,
        val total: Int,
        val viewed: Boolean,
    )

    data class AppliedTestSeriesEntry(
        val testName: String,
        val unlockAtMillis: Long,
        val expiresAtMillis: Long,
    )

    /**
     * In-memory shape for a resumable quiz session (persisted as JSON under [keyInProgressQuizJson]).
     * [deadlineAtMillis] is wall-clock end time; remaining time = deadline - now.
     */
    data class InProgressQuizState(
        val ownerUserKey: String,
        val testName: String,
        val testCatalogId: String,
        val deadlineAtMillis: Long,
        val currentQuestionIndex: Int,
        val answers: Map<Int, Int>,
        val questionNavigationMode: String,
        val resultReleaseAtMillis: Long?,
        val configuredDurationSeconds: Int,
    )

    val drawerUserProfile: Flow<DrawerUserProfile>
        get() = storeOrNull()?.data?.map { prefs ->
            val code = prefs[keyProfileUserCode] ?: 0
            val formatted = formatUserIdForDisplay(code)
            val legacyContact = prefs[keyProfileContact].orEmpty()
            val email = prefs[keyProfileEmail].orEmpty().ifBlank {
                if (legacyContact.contains('@')) legacyContact.trim() else ""
            }
            DrawerUserProfile(
                displayName = prefs[keyProfileDisplayName].orEmpty(),
                emailLine = email,
                userIdFormatted = formatted,
            )
        } ?: flowOf(DrawerUserProfile("", "", null))

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun isSixDigitPublicId(code: Int): Boolean =
        code in MIN_SIX_DIGIT_PUBLIC_ID..MAX_SIX_DIGIT_PUBLIC_ID

    private fun isLegacyEightDigitUserCode(code: Int): Boolean =
        code in MIN_LEGACY_EIGHT_DIGIT_USER_CODE..MAX_LEGACY_EIGHT_DIGIT_USER_CODE

    private fun hasStoredUserCode(code: Int): Boolean =
        isSixDigitPublicId(code) || isLegacyEightDigitUserCode(code)

    /** Admin panel shows `six_digit_public_id` without leading zeros beyond the natural 6 digits. */
    private fun formatUserIdForDisplay(code: Int): String? = when {
        isSixDigitPublicId(code) -> String.format(Locale.US, "%06d", code)
        isLegacyEightDigitUserCode(code) -> String.format(Locale.US, "%08d", code)
        else -> null
    }

    /** Same allocation domain as server `pickSixDigit()`. */
    private fun randomSixDigitPublicId(): Int =
        Random.nextInt(MIN_SIX_DIGIT_PUBLIC_ID, MAX_SIX_DIGIT_PUBLIC_ID + 1)

    private fun deriveDisplayNameFromLogin(identifier: String): String {
        val trimmed = identifier.trim()
        val at = trimmed.indexOf('@')
        return if (at > 0) {
            trimmed.substring(0, at)
                .replace('.', ' ')
                .split(' ')
                .filter { it.isNotBlank() }
                .joinToString(" ") { word ->
                    word.replaceFirstChar { c ->
                        if (c.isLowerCase()) c.titlecase(Locale.getDefault()) else c.toString()
                    }
                }
                .ifBlank { "User" }
        } else {
            "User ${trimmed.takeLast(4)}"
        }
    }

    suspend fun applySignupProfile(username: String, email: String, mobile: String, password: String) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = username.trim()
                prefs[keyProfileEmail] = email.trim()
                prefs[keyProfileMobile] = mobile.trim()
                prefs[keyProfileGender] = prefs[keyProfileGender].orEmpty()
                prefs[keyProfileBirthdayDate] = ""
                prefs[keyProfileContact] = email.trim()
                val existing = prefs[keyProfileUserCode] ?: 0
                if (!hasStoredUserCode(existing)) {
                    prefs[keyProfileUserCode] = randomSixDigitPublicId()
                }
            }
        }.onFailure { Log.e(TAG, "applySignupProfile failed", it) }
    }

    suspend fun applyLoginProfile(identifier: String, password: String) {
        if (!::appContext.isInitialized) return
        val id = identifier.trim()
        runCatching {
            store().edit { prefs ->
                val nameExisting = prefs[keyProfileDisplayName].orEmpty()
                if (nameExisting.isBlank()) {
                    prefs[keyProfileDisplayName] = deriveDisplayNameFromLogin(id)
                }
                prefs[keyProfileContact] = id
                if (id.contains('@')) {
                    prefs[keyProfileEmail] = id
                } else {
                    prefs[keyProfileMobile] = id.filter(Char::isDigit).take(10)
                }
                prefs[keyProfileGender] = prefs[keyProfileGender].orEmpty()
                val existing = prefs[keyProfileUserCode] ?: 0
                if (!hasStoredUserCode(existing)) {
                    prefs[keyProfileUserCode] = randomSixDigitPublicId()
                }
            }
        }.onFailure { Log.e(TAG, "applyLoginProfile failed", it) }
    }

    /**
     * Syncs profile from backend after API login/register or token restore.
     */
    suspend fun applyServerAuthProfile(
        displayName: String,
        email: String,
        mobile: String,
        sixDigitPublicId: Int,
        isEmailVerified: Boolean,
        passwordPlain: String,
        birthdayDate: String? = null,
    ) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = displayName.trim()
                prefs[keyProfileEmail] = email.trim()
                prefs[keyProfileMobile] = mobile.trim().filter(Char::isDigit).take(10)
                prefs[keyProfileGender] = prefs[keyProfileGender].orEmpty()
                prefs[keyProfileBirthdayDate] = normalizeStoredBirthdayDate(birthdayDate)
                prefs[keyProfileContact] = email.trim()
                if (isSixDigitPublicId(sixDigitPublicId)) {
                    prefs[keyProfileUserCode] = sixDigitPublicId
                }
                // Never persist plain passwords on device storage.
                prefs[keyEmailVerified] = if (isEmailVerified) 1 else 0
            }
        }.onFailure { Log.e(TAG, "applyServerAuthProfile failed", it) }
    }

    /**
     * Normalizes server-provided DOB into strict `YYYY-MM-DD` for local caching/UI.
     * Handles occasional ISO-datetime strings (`2000-05-06T00:00:00.000Z`) by extracting the date part.
     */
    private fun normalizeStoredBirthdayDate(raw: String?): String {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return ""
        val isoDay = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        if (isoDay.matches(s)) return s
        val m = Regex("^(\\d{4}-\\d{2}-\\d{2})").find(s)
        val extracted = m?.groupValues?.getOrNull(1).orEmpty()
        return if (isoDay.matches(extracted)) extracted else ""
    }

    /**
     * Updates profile fields. [newPassword] blank = keep existing password.
     * Email cannot change after [keyEmailVerified] is set.
     */
    suspend fun updateProfile(
        displayName: String,
        email: String,
        mobile: String,
        newPassword: String,
    ): Result<Unit> {
        if (!::appContext.isInitialized) return Result.failure(IllegalStateException("Preferences not ready"))
        val name = displayName.trim()
        val em = email.trim()
        val mob = mobile.trim().filter(Char::isDigit).take(10)
        if (name.isBlank()) return Result.failure(IllegalArgumentException("Username required"))
        if (!isValidEmail(em)) return Result.failure(IllegalArgumentException("Enter a valid email"))
        if (mob.length != 10 || !isValidMobile(mob)) {
            return Result.failure(IllegalArgumentException("Enter a valid 10-digit mobile"))
        }
        if (newPassword.isNotBlank() && newPassword.length < 4) {
            return Result.failure(IllegalArgumentException("Password must be at least 4 characters"))
        }
        val prefsSnapshot = store().data.first()
        val verified = (prefsSnapshot[keyEmailVerified] ?: 0) == 1
        val currentEmail = prefsSnapshot[keyProfileEmail].orEmpty().ifBlank {
            val c = prefsSnapshot[keyProfileContact].orEmpty()
            if (c.contains('@')) c else ""
        }
        if (verified && em != currentEmail) {
            return Result.failure(IllegalStateException("Email cannot be changed after verification"))
        }
        return runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = name
                prefs[keyProfileEmail] = em
                prefs[keyProfileMobile] = mob
                prefs[keyProfileContact] = em
                // Password updates are handled server-side only.
            }
            Unit
        }.fold(
            onSuccess = { Result.success(Unit) },
            onFailure = { e ->
                Log.e(TAG, "updateProfile failed", e)
                Result.failure(e)
            },
        )
    }

    suspend fun updateGender(gender: String): Result<Unit> {
        if (!::appContext.isInitialized) return Result.failure(IllegalStateException("Preferences not ready"))
        val value = gender.trim()
        val allowed = setOf("Male", "Female", "Other")
        if (value !in allowed) {
            return Result.failure(IllegalArgumentException("Select a valid gender"))
        }
        return runCatching {
            store().edit { prefs ->
                prefs[keyProfileGender] = value
            }
            Unit
        }.fold(
            onSuccess = { Result.success(Unit) },
            onFailure = { e ->
                Log.e(TAG, "updateGender failed", e)
                Result.failure(e)
            },
        )
    }

    /** Password is intentionally not stored locally; no-op for safety. */
    suspend fun updateStoredPasswordPlain(plain: String) {
        Unit
    }

    suspend fun updatePasswordWithOldCheck(oldPassword: String, newPassword: String): Result<Unit> {
        if (newPassword.length < 4) {
            return Result.failure(IllegalArgumentException("New password must be at least 4 characters"))
        }
        return Result.success(Unit)
    }

    /** If profile exists without a code (e.g. migration), assign one once. */
    suspend fun ensureDrawerUserCode() {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                val existing = prefs[keyProfileUserCode] ?: 0
                if (!hasStoredUserCode(existing)) {
                    prefs[keyProfileUserCode] = randomSixDigitPublicId()
                }
            }
        }.onFailure { Log.e(TAG, "ensureDrawerUserCode failed", it) }
    }

    private fun store(): DataStore<Preferences> {
        check(::appContext.isInitialized) { "Call AppPreferencesRepository.init first" }
        return appContext.dataStore
    }

    private fun storeOrNull(): DataStore<Preferences>? =
        if (::appContext.isInitialized) appContext.dataStore else null

    val streakDays: Flow<Int>
        get() = storeOrNull()?.data?.map { it[keyStreak] ?: 0 } ?: flowOf(0)

    val lastOpenedTest: Flow<Pair<String?, Long>>
        get() = storeOrNull()?.data?.map { prefs ->
            prefs[keyLastTestName] to (prefs[keyLastTestTime] ?: 0L)
        } ?: flowOf(null to 0L)

    fun lastFeedUrl(kind: FeedKind): Flow<String?> {
        val key = when (kind) {
            FeedKind.Job -> keyLastFeedJob
            FeedKind.Exam -> keyLastFeedExam
            FeedKind.News -> keyLastFeedNews
        }
        return storeOrNull()?.data?.map { it[key] } ?: flowOf(null)
    }

    val emailVerified: Flow<Boolean>
        get() = storeOrNull()?.data?.map { (it[keyEmailVerified] ?: 0) == 1 } ?: flowOf(false)

    val phoneVerified: Flow<Boolean>
        get() = storeOrNull()?.data?.map { (it[keyPhoneVerified] ?: 0) == 1 } ?: flowOf(false)

    val notificationsEnabled: Flow<Boolean>
        get() = storeOrNull()?.data?.map { (it[keyProfileNotificationsEnabled] ?: 1) == 1 } ?: flowOf(true)

    val scoreVisibilityEnabled: Flow<Boolean>
        get() = storeOrNull()?.data?.map { (it[keyScoreVisibilityEnabled] ?: 1) == 1 } ?: flowOf(true)

    suspend fun notificationsEnabledNow(): Boolean {
        if (!::appContext.isInitialized) return true
        return runCatching {
            (store().data.first()[keyProfileNotificationsEnabled] ?: 1) == 1
        }.getOrDefault(true)
    }

    val pendingResultState: Flow<PendingResultState?>
        get() = storeOrNull()?.data?.map { prefs ->
            val name = prefs[keyPendingResultTestName].orEmpty().trim()
            val publishAt = prefs[keyPendingResultPublishAt] ?: 0L
            if (name.isBlank() || publishAt <= 0L) {
                null
            } else {
                PendingResultState(
                    testName = name,
                    publishAtMillis = publishAt,
                    answered = (prefs[keyPendingResultAnswered] ?: 0).coerceAtLeast(0),
                    correct = (prefs[keyPendingResultCorrect] ?: 0).coerceAtLeast(0),
                    wrong = (prefs[keyPendingResultWrong] ?: 0).coerceAtLeast(0),
                    total = (prefs[keyPendingResultTotal] ?: 0).coerceAtLeast(0),
                    viewed = (prefs[keyPendingResultViewed] ?: 0) == 1,
                )
            }
        } ?: flowOf(null)

    val appliedTestSeries: Flow<List<AppliedTestSeriesEntry>>
        get() = storeOrNull()?.data?.map { prefs ->
            parseAppliedTestSeries(prefs[keyAppliedTestSeries]).filter { it.testName.isNotBlank() }
        } ?: flowOf(emptyList())

    fun rememberTestOpened(testName: String) {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { prefs ->
                    prefs[keyLastTestName] = testName
                    prefs[keyLastTestTime] = System.currentTimeMillis()
                }
            }.onFailure { Log.e(TAG, "rememberTestOpened failed", it) }
        }
    }

    suspend fun markPendingResultSubmittedNow(
        testName: String,
        publishAtMillis: Long,
        answered: Int,
        correct: Int,
        wrong: Int,
        total: Int,
    ) {
        if (!::appContext.isInitialized) return
        val safeName = testName.trim().ifBlank { "Test" }
        val defaultReleaseAt = System.currentTimeMillis() + BuildConfig.RESULT_RELEASE_DELAY_HOURS * HourMs
        val safePublish = publishAtMillis.takeIf { it > 0L } ?: defaultReleaseAt
        val safeAnswered = answered.coerceAtLeast(0)
        val safeCorrect = correct.coerceAtLeast(0)
        val safeWrong = wrong.coerceAtLeast(0)
        val safeTotal = total.coerceAtLeast(safeAnswered).coerceAtLeast(safeCorrect + safeWrong)
        runCatching {
            store().edit { prefs ->
                prefs[keyPendingResultTestName] = safeName
                prefs[keyPendingResultPublishAt] = safePublish
                prefs[keyPendingResultAnswered] = safeAnswered
                prefs[keyPendingResultCorrect] = safeCorrect
                prefs[keyPendingResultWrong] = safeWrong
                prefs[keyPendingResultTotal] = safeTotal
                prefs[keyPendingResultViewed] = 0
            }
        }.onFailure { Log.e(TAG, "markPendingResultSubmittedNow failed", it) }
    }

    fun markPendingResultSubmitted(
        testName: String,
        publishAtMillis: Long,
        answered: Int,
        correct: Int,
        wrong: Int,
        total: Int,
    ) {
        if (!::appContext.isInitialized) return
        scope.launch {
            markPendingResultSubmittedNow(
                testName = testName,
                publishAtMillis = publishAtMillis,
                answered = answered,
                correct = correct,
                wrong = wrong,
                total = total,
            )
        }
    }

    fun addAppliedTestSeries(
        testName: String,
        lockMs: Long = DefaultStartSeriesLockMs,
        activeWindowMs: Long = DefaultStartSeriesActiveWindowMs,
    ) {
        if (!::appContext.isInitialized) return
        val safeName = testName.trim().ifBlank { "Test" }
        val now = System.currentTimeMillis()
        val safeLockMs = lockMs.coerceAtLeast(0L)
        val safeActiveWindowMs = activeWindowMs.coerceAtLeast(60_000L)
        scope.launch {
            runCatching {
                store().edit { prefs ->
                    val existing = parseAppliedTestSeries(prefs[keyAppliedTestSeries])
                        .filter { it.expiresAtMillis > now }
                    val nextUnlockBase = existing.maxOfOrNull { it.expiresAtMillis } ?: now
                    val unlockAt = maxOf(now + safeLockMs, nextUnlockBase)
                    val expiresAt = unlockAt + safeActiveWindowMs
                    val updated = existing + AppliedTestSeriesEntry(
                        testName = safeName,
                        unlockAtMillis = unlockAt,
                        expiresAtMillis = expiresAt,
                    )
                    prefs[keyAppliedTestSeries] = encodeAppliedTestSeries(updated)
                }
            }.onFailure { Log.e(TAG, "addAppliedTestSeries failed", it) }
        }
    }

    suspend fun removeAppliedTestSeriesNow(testName: String) {
        if (!::appContext.isInitialized) return
        val safeName = testName.trim()
        if (safeName.isBlank()) return
        val now = System.currentTimeMillis()
        runCatching {
            store().edit { prefs ->
                val existing = parseAppliedTestSeries(prefs[keyAppliedTestSeries])
                val updated = existing.filter { entry ->
                    entry.expiresAtMillis > now && !entry.testName.equals(safeName, ignoreCase = true)
                }
                prefs[keyAppliedTestSeries] = encodeAppliedTestSeries(updated)
            }
        }.onFailure { Log.e(TAG, "removeAppliedTestSeriesNow failed", it) }
    }

    fun markPendingResultViewedAndClear() {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { prefs ->
                    prefs[keyPendingResultViewed] = 1
                    prefs[keyPendingResultTestName] = ""
                    prefs[keyPendingResultPublishAt] = 0L
                    prefs[keyPendingResultAnswered] = 0
                    prefs[keyPendingResultCorrect] = 0
                    prefs[keyPendingResultWrong] = 0
                    prefs[keyPendingResultTotal] = 0
                }
            }.onFailure { Log.e(TAG, "markPendingResultViewedAndClear failed", it) }
        }
    }

    suspend fun saveInProgressQuizNow(state: InProgressQuizState) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyInProgressQuizJson] = encodeInProgressQuiz(state)
            }
        }.onFailure { Log.e(TAG, "saveInProgressQuizNow failed", it) }
    }

    suspend fun clearInProgressQuizNow() {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyInProgressQuizJson] = ""
            }
        }.onFailure { Log.e(TAG, "clearInProgressQuizNow failed", it) }
    }

    /**
     * Valid saved quiz for [currentOwnerUserKey] with a future deadline (cold-start auto navigation).
     */
    suspend fun peekValidInProgressQuiz(currentOwnerUserKey: String): InProgressQuizState? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyInProgressQuizJson].orEmpty().trim() }.getOrDefault("")
        if (raw.isBlank()) return null
        val parsed = parseInProgressQuiz(raw) ?: run {
            clearInProgressQuizNow()
            return null
        }
        val owner = currentOwnerUserKey.trim().ifBlank { "guest" }
        if (!parsed.ownerUserKey.equals(owner, ignoreCase = true)) {
            clearInProgressQuizNow()
            return null
        }
        val now = System.currentTimeMillis()
        if (parsed.deadlineAtMillis <= now) {
            clearInProgressQuizNow()
            return null
        }
        if (parsed.testName.isBlank()) {
            clearInProgressQuizNow()
            return null
        }
        return parsed
    }

    /** Resume payload only when saved session matches this test title (same user + deadline). */
    suspend fun getResumableQuizSession(currentOwnerUserKey: String, testName: String): InProgressQuizState? {
        val want = testName.trim().ifBlank { return null }
        val parsed = peekValidInProgressQuiz(currentOwnerUserKey) ?: return null
        return if (parsed.testName.equals(want, ignoreCase = true)) parsed else null
    }

    fun cacheFeedUrl(kind: FeedKind, url: String) {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { prefs ->
                    when (kind) {
                        FeedKind.Job -> prefs[keyLastFeedJob] = url
                        FeedKind.Exam -> prefs[keyLastFeedExam] = url
                        FeedKind.News -> prefs[keyLastFeedNews] = url
                    }
                }
            }.onFailure { Log.e(TAG, "cacheFeedUrl failed", it) }
        }
    }

    /**
     * Call when user opens Daily digest. Returns updated streak (same day = no change).
     */
    suspend fun recordDigestOpenedToday(): Int {
        if (!::appContext.isInitialized) return 0
        return runCatching {
            val today = LocalDate.now()
            val todayStr = today.toString()
            var result = 0
            store().edit { prefs ->
                val lastStr = prefs[keyLastDigestDay]
                val currentStreak = prefs[keyStreak] ?: 0
                val newStreak = when {
                    lastStr == null -> 1
                    lastStr == todayStr -> currentStreak
                    else -> {
                        val lastDay = runCatching { LocalDate.parse(lastStr) }.getOrNull()
                        if (lastDay != null && lastDay.plusDays(1) == today) currentStreak + 1 else 1
                    }
                }
                prefs[keyLastDigestDay] = todayStr
                prefs[keyStreak] = newStreak
                result = newStreak
            }
            result
        }.getOrElse { e ->
            Log.e(TAG, "recordDigestOpenedToday failed", e)
            0
        }
    }

    suspend fun clearAllLocalPreferences(): Boolean {
        if (!::appContext.isInitialized) return true
        return runCatching { store().edit { it.clear() } }
            .onFailure { Log.e(TAG, "clearAllLocalPreferences failed", it) }
            .isSuccess
    }

    private fun parseAppliedTestSeries(raw: String?): List<AppliedTestSeriesEntry> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val name = obj.optString("testName", "").trim()
                    val unlockAt = obj.optLong("unlockAtMillis", 0L)
                    val expiresAt = obj.optLong("expiresAtMillis", 0L)
                    if (name.isNotBlank() && unlockAt > 0L && expiresAt > unlockAt) {
                        add(
                            AppliedTestSeriesEntry(
                                testName = name,
                                unlockAtMillis = unlockAt,
                                expiresAtMillis = expiresAt,
                            ),
                        )
                    }
                }
            }
        }.getOrElse { emptyList() }
    }

    private fun encodeAppliedTestSeries(items: List<AppliedTestSeriesEntry>): String {
        val arr = JSONArray()
        items.forEach { item ->
            arr.put(
                JSONObject().apply {
                    put("testName", item.testName)
                    put("unlockAtMillis", item.unlockAtMillis)
                    put("expiresAtMillis", item.expiresAtMillis)
                },
            )
        }
        return arr.toString()
    }

    private fun encodeInProgressQuiz(state: InProgressQuizState): String {
        val o = JSONObject()
        o.put("ownerUserKey", state.ownerUserKey)
        o.put("testName", state.testName)
        o.put("testCatalogId", state.testCatalogId)
        o.put("deadlineAtMillis", state.deadlineAtMillis)
        o.put("currentQuestionIndex", state.currentQuestionIndex)
        o.put("questionNavigationMode", state.questionNavigationMode)
        o.put("configuredDurationSeconds", state.configuredDurationSeconds)
        val rr = state.resultReleaseAtMillis
        if (rr != null && rr > 0L) {
            o.put("resultReleaseAtMillis", rr)
        }
        val ansObj = JSONObject()
        state.answers.forEach { (k, v) -> ansObj.put(k.toString(), v) }
        o.put("answers", ansObj)
        return o.toString()
    }

    private fun parseInProgressQuiz(raw: String): InProgressQuizState? {
        return runCatching {
            val o = JSONObject(raw)
            val owner = o.optString("ownerUserKey", "").trim().ifBlank { return@runCatching null }
            val testName = o.optString("testName", "").trim().ifBlank { return@runCatching null }
            val catalogId = o.optString("testCatalogId", "").trim()
            val deadline = o.optLong("deadlineAtMillis", 0L)
            if (deadline <= 0L) return@runCatching null
            val currentIdx = o.optInt("currentQuestionIndex", 0).coerceAtLeast(0)
            val navMode = o.optString("questionNavigationMode", "sequential").trim()
                .takeIf { it == "free" || it == "sequential" } ?: "sequential"
            val durationSec = o.optInt("configuredDurationSeconds", 12 * 60).coerceAtLeast(60)
            val resultRelease =
                if (o.has("resultReleaseAtMillis")) {
                    o.optLong("resultReleaseAtMillis", 0L).takeIf { it > 0L }
                } else {
                    null
                }
            val ansObj = o.optJSONObject("answers") ?: JSONObject()
            val answers = buildMap {
                val keys = ansObj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val qi = key.toIntOrNull() ?: continue
                    val ai = ansObj.optInt(key, -1)
                    if (ai >= 0) put(qi, ai)
                }
            }
            InProgressQuizState(
                ownerUserKey = owner,
                testName = testName,
                testCatalogId = catalogId,
                deadlineAtMillis = deadline,
                currentQuestionIndex = currentIdx,
                answers = answers,
                questionNavigationMode = navMode,
                resultReleaseAtMillis = resultRelease,
                configuredDurationSeconds = durationSec,
            )
        }.getOrNull()
    }

    private fun parseStringSet(raw: String?): Set<String> {
        if (raw.isNullOrBlank()) return emptySet()
        return runCatching {
            val arr = JSONArray(raw)
            buildSet {
                for (i in 0 until arr.length()) {
                    val value = arr.optString(i).trim()
                    if (value.isNotBlank()) add(value)
                }
            }
        }.getOrElse { emptySet() }
    }

    private fun encodeStringSet(values: Set<String>): String {
        val arr = JSONArray()
        values.filter { it.isNotBlank() }.sorted().forEach { arr.put(it) }
        return arr.toString()
    }

    private fun currentContentStateOwnerId(prefs: Preferences): String {
        val email = prefs[keyProfileEmail].orEmpty().trim()
        val contact = prefs[keyProfileContact].orEmpty().trim()
        val userCodeRaw = prefs[keyProfileUserCode] ?: 0
        val userCode = formatUserIdForDisplay(userCodeRaw).orEmpty()
        return when {
            email.isNotBlank() -> email.lowercase(Locale.US)
            contact.isNotBlank() -> contact.lowercase(Locale.US)
            userCode.isNotBlank() -> "uid:$userCode"
            else -> "guest"
        }
    }

    private suspend fun readUserScopedIdSet(
        setKey: Preferences.Key<String>,
        ownerKey: Preferences.Key<String>,
    ): Set<String> {
        if (!::appContext.isInitialized) return emptySet()
        return runCatching {
            val prefs = store().data.first()
            val ownerNow = currentContentStateOwnerId(prefs)
            val ownerStored = prefs[ownerKey].orEmpty().trim()
            if (ownerStored.isNotBlank() && !ownerStored.equals(ownerNow, ignoreCase = true)) {
                // Different signed-in user: discard previous user's state.
                store().edit { next ->
                    next[ownerKey] = ownerNow
                    next[setKey] = "[]"
                }
                return@runCatching emptySet()
            }
            // First-time read after install / migration: pin owner.
            if (ownerStored.isBlank()) {
                store().edit { next -> next[ownerKey] = ownerNow }
            }
            parseStringSet(prefs[setKey])
        }.getOrDefault(emptySet())
    }

    private suspend fun writeUserScopedIdSet(
        setKey: Preferences.Key<String>,
        ownerKey: Preferences.Key<String>,
        addValues: Set<String>,
    ) {
        if (!::appContext.isInitialized) return
        if (addValues.isEmpty()) return
        runCatching {
            store().edit { prefs ->
                val ownerNow = currentContentStateOwnerId(prefs)
                val ownerStored = prefs[ownerKey].orEmpty().trim()
                val base =
                    if (ownerStored.isNotBlank() && !ownerStored.equals(ownerNow, ignoreCase = true)) {
                        emptySet()
                    } else {
                        parseStringSet(prefs[setKey])
                    }
                prefs[ownerKey] = ownerNow
                prefs[setKey] = encodeStringSet(base + addValues)
            }
        }.onFailure { Log.e(TAG, "writeUserScopedIdSet failed", it) }
    }

    suspend fun getSeenNotificationIdsNow(): Set<String> {
        return readUserScopedIdSet(
            setKey = keySeenNotificationIds,
            ownerKey = keySeenNotificationIdsOwner,
        )
    }

    suspend fun getSeenPollIdsNow(): Set<String> {
        return readUserScopedIdSet(
            setKey = keySeenPollIds,
            ownerKey = keySeenPollIdsOwner,
        )
    }

    suspend fun getVotedPollIdsNow(): Set<String> {
        return readUserScopedIdSet(
            setKey = keyVotedPollIds,
            ownerKey = keyVotedPollIdsOwner,
        )
    }

    suspend fun markNotificationsSeen(ids: Collection<String>) {
        val normalized = ids.map { it.trim() }.filter { it.isNotBlank() }.toSet()
        writeUserScopedIdSet(
            setKey = keySeenNotificationIds,
            ownerKey = keySeenNotificationIdsOwner,
            addValues = normalized,
        )
    }

    suspend fun markPollsSeen(ids: Collection<String>) {
        val normalized = ids.map { it.trim() }.filter { it.isNotBlank() }.toSet()
        writeUserScopedIdSet(
            setKey = keySeenPollIds,
            ownerKey = keySeenPollIdsOwner,
            addValues = normalized,
        )
    }

    suspend fun markPollVoted(pollId: String) {
        val normalized = pollId.trim().takeIf { it.isNotBlank() } ?: return
        writeUserScopedIdSet(
            setKey = keyVotedPollIds,
            ownerKey = keyVotedPollIdsOwner,
            addValues = setOf(normalized),
        )
    }

    /** Clears sign-in profile fields; keeps streak, digest, feed URLs, and seen/voted notification state. */
    suspend fun clearAuthSessionPrefs() {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = ""
                prefs[keyProfileContact] = ""
                prefs[keyProfileEmail] = ""
                prefs[keyProfileMobile] = ""
                prefs[keyProfileGender] = ""
                prefs[keyProfileBirthdayDate] = ""
                prefs[keyProfileUserCode] = 0
                prefs[keyEmailVerified] = 0
                prefs[keyPhoneVerified] = 0
                prefs[keyPendingResultTestName] = ""
                prefs[keyPendingResultPublishAt] = 0L
                prefs[keyPendingResultAnswered] = 0
                prefs[keyPendingResultCorrect] = 0
                prefs[keyPendingResultWrong] = 0
                prefs[keyPendingResultTotal] = 0
                prefs[keyPendingResultViewed] = 1
                prefs[keyAppliedTestSeries] = "[]"
                prefs[keyAuthBootstrapState] = RestoreSessionStatus.LoggedOut.name
                prefs[keyInProgressQuizJson] = ""
                // Reset ownership so the next signed-in user starts fresh for unread badges.
                prefs[keySeenNotificationIdsOwner] = ""
                prefs[keySeenPollIdsOwner] = ""
                prefs[keyVotedPollIdsOwner] = ""
            }
        }.onFailure { Log.e(TAG, "clearAuthSessionPrefs failed", it) }
    }

    suspend fun setAuthBootstrapState(status: RestoreSessionStatus) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyAuthBootstrapState] = status.name
            }
        }.onFailure { Log.e(TAG, "setAuthBootstrapState failed", it) }
    }

    suspend fun getAuthBootstrapState(): RestoreSessionStatus? {
        if (!::appContext.isInitialized) return null
        return runCatching {
            val raw = store().data.first()[keyAuthBootstrapState].orEmpty()
            RestoreSessionStatus.entries.firstOrNull { it.name == raw }
        }.getOrNull()
    }

    suspend fun exportSnapshotJson(): String {
        if (!::appContext.isInitialized) return "{}"
        val prefs = store().data.first()
        fun q(s: String?) = s?.replace("\\", "\\\\")?.replace("\"", "\\\"") ?: ""
        val streak = prefs[keyStreak] ?: 0
        val lastTest = prefs[keyLastTestName]
        val lastTestTime = prefs[keyLastTestTime] ?: 0L
        val job = prefs[keyLastFeedJob]
        val exam = prefs[keyLastFeedExam]
        val news = prefs[keyLastFeedNews]
        val emailV = (prefs[keyEmailVerified] ?: 0) == 1
        val phoneV = (prefs[keyPhoneVerified] ?: 0) == 1
        val display = prefs[keyProfileDisplayName]
        val contact = prefs[keyProfileContact]
        val email = prefs[keyProfileEmail]
        val mobile = prefs[keyProfileMobile]
        val gender = prefs[keyProfileGender]
        val birthday = prefs[keyProfileBirthdayDate]
        val uid = prefs[keyProfileUserCode] ?: 0
        return """
            {"streakDays":$streak,"lastOpenedTest":"${q(lastTest)}","lastOpenedTestTime":$lastTestTime,"cachedFeedJobUrl":"${q(job)}","cachedFeedExamUrl":"${q(exam)}","cachedFeedNewsUrl":"${q(news)}","emailVerified":$emailV,"phoneVerified":$phoneV,"displayName":"${q(display)}","contact":"${q(contact)}","email":"${q(email)}","mobile":"${q(mobile)}","gender":"${q(gender)}","birthdayDate":"${q(birthday)}","userCode":$uid}
        """.trimIndent().replace("\n", "")
    }

    fun setEmailVerified(verified: Boolean) {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { it[keyEmailVerified] = if (verified) 1 else 0 }
            }.onFailure { Log.e(TAG, "setEmailVerified failed", it) }
        }
    }

    fun setPhoneVerified(verified: Boolean) {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { it[keyPhoneVerified] = if (verified) 1 else 0 }
            }.onFailure { Log.e(TAG, "setPhoneVerified failed", it) }
        }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { it[keyProfileNotificationsEnabled] = if (enabled) 1 else 0 }
            }.onFailure { Log.e(TAG, "setNotificationsEnabled failed", it) }
        }
    }

    fun setScoreVisibilityEnabled(enabled: Boolean) {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { it[keyScoreVisibilityEnabled] = if (enabled) 1 else 0 }
            }.onFailure { Log.e(TAG, "setScoreVisibilityEnabled failed", it) }
        }
    }
}
