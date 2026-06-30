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
import com.freemocktest.app.util.TestScheduleUtils
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
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
    /** Cached from server `createdAt` on the user row (ISO string). */
    private val keyAccountCreatedAtIso = stringPreferencesKey("account_created_at_iso")
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
    /** Last successful CMS home payload, persisted so cold start can render instantly while refresh runs in the background. */
    private val keyCachedHomeContentJson = stringPreferencesKey("cached_home_content_json")
    /** Last successful news list payloads per feed kind (all / job / exam) for stale-while-revalidate on feed screens. */
    private val keyCachedNewsFeedAllJson = stringPreferencesKey("cached_news_feed_all_json")
    private val keyCachedNewsFeedJobJson = stringPreferencesKey("cached_news_feed_job_json")
    private val keyCachedNewsFeedExamJson = stringPreferencesKey("cached_news_feed_exam_json")
    /** Last successful CMS profile menu (from home payload) for instant Profile screen paint. */
    private val keyCachedProfileMenuJson = stringPreferencesKey("cached_profile_menu_json_v1")
    /** Exam category hierarchy (level1/2/3) for instant Exam Categories screen. */
    private val keyCachedExamCategoriesJson = stringPreferencesKey("cached_exam_categories_json_v1")
    /** Last successful tests lists per subcategory (bottom Tests tab + Apply fallback). */
    private val keyCachedTestsListsBlob = stringPreferencesKey("cached_tests_lists_blob_v1")
    /** Per-test-title quiz question lists from last successful API (answer key / review / result). */
    private val keyCachedQuizQuestionsBlob = stringPreferencesKey("cached_quiz_questions_blob_v1")
    private val keyAuthBootstrapState = stringPreferencesKey("auth_bootstrap_state")
    private val keySeenNotificationIds = stringPreferencesKey("seen_notification_ids")
    // Keep "seen" state user-scoped. If a different user signs in on the same device,
    // old ids must not affect unread badges for the new account.
    private val keySeenNotificationIdsOwner = stringPreferencesKey("seen_notification_ids_owner")
    private val keySeenPollIds = stringPreferencesKey("seen_poll_ids")
    private val keySeenPollIdsOwner = stringPreferencesKey("seen_poll_ids_owner")
    private val keyVotedPollIds = stringPreferencesKey("voted_poll_ids")
    private val keyVotedPollIdsOwner = stringPreferencesKey("voted_poll_ids_owner")
    private val keyNotificationsClearedAtMs = longPreferencesKey("notifications_cleared_at_ms")
    /** 1 after user finishes post-login test multi-select (cleared on logout). */
    private val keyLoginTestPickDone = intPreferencesKey("login_test_pick_done")
    /** JSON array of test titles the user selected after login. */
    private val keyLoginTestPickTitles = stringPreferencesKey("login_test_pick_titles")
    /** Daily Quiz only — not mock-test attempts. JSON object: date (yyyy-MM-dd) → result blob. */
    private val keyDailyQuizResultsByDayJson = stringPreferencesKey("daily_quiz_results_by_day_v1")

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

    private fun mapPrefsToEditableProfile(prefs: Preferences): EditableProfileState {
        val legacyContact = prefs[keyProfileContact].orEmpty()
        val emailStored = prefs[keyProfileEmail].orEmpty()
        val email = emailStored.ifBlank {
            if (legacyContact.contains('@')) legacyContact else ""
        }
        val mobile = prefs[keyProfileMobile].orEmpty().ifBlank {
            if (legacyContact.isNotBlank() && !legacyContact.contains('@')) legacyContact else ""
        }
        return EditableProfileState(
            displayName = prefs[keyProfileDisplayName].orEmpty(),
            email = email,
            mobile = mobile,
            gender = prefs[keyProfileGender].orEmpty(),
            birthdayDate = prefs[keyProfileBirthdayDate].orEmpty(),
        )
    }

    val editableProfile: Flow<EditableProfileState>
        get() = storeOrNull()?.data?.map { mapPrefsToEditableProfile(it) }
            ?: flowOf(EditableProfileState("", "", "", "", ""))

    /** One-shot read for Profile screen so DataStore-backed fields paint before first Flow emission. */
    suspend fun peekEditableProfileNow(): EditableProfileState {
        if (!::appContext.isInitialized) return EditableProfileState("", "", "", "", "")
        val prefs = runCatching { store().data.first() }.getOrNull()
            ?: return EditableProfileState("", "", "", "", "")
        return mapPrefsToEditableProfile(prefs)
    }

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

    /** True when [testName] already has a submitted attempt awaiting scheduled result release. */
    fun isTestBlockedByPendingResult(testName: String, pending: PendingResultState?): Boolean {
        if (pending == null) return false
        val name = testName.trim()
        if (name.isBlank()) return false
        return pending.testName.equals(name, ignoreCase = true)
    }

    fun canStartTest(testName: String, pending: PendingResultState?): Boolean =
        !isTestBlockedByPendingResult(testName, pending)

    data class AppliedTestSeriesEntry(
        val testName: String,
        val unlockAtMillis: Long,
        val expiresAtMillis: Long,
        /** Future exam start from admin exam date + slot; 0 when not scheduled. */
        val scheduledStartAtMillis: Long = 0L,
    ) {
        fun startUnlockAtMillis(nowMs: Long = System.currentTimeMillis()): Long {
            if (scheduledStartAtMillis > nowMs) return scheduledStartAtMillis
            return unlockAtMillis
        }
    }

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
        gender: String? = null,
        birthdayDate: String? = null,
        accountCreatedAtIso: String? = null,
    ) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = displayName.trim()
                prefs[keyProfileEmail] = email.trim()
                prefs[keyProfileMobile] = mobile.trim().filter(Char::isDigit).take(10)
                val g = (gender ?: prefs[keyProfileGender].orEmpty()).trim()
                prefs[keyProfileGender] = g
                prefs[keyProfileBirthdayDate] = normalizeStoredBirthdayDate(birthdayDate)
                prefs[keyProfileContact] = email.trim()
                if (isSixDigitPublicId(sixDigitPublicId)) {
                    prefs[keyProfileUserCode] = sixDigitPublicId
                }
                val createdTrim = accountCreatedAtIso?.trim().orEmpty()
                if (createdTrim.isNotEmpty()) {
                    prefs[keyAccountCreatedAtIso] = createdTrim
                }
                // Never persist plain passwords on device storage.
                prefs[keyEmailVerified] = if (isEmailVerified) 1 else 0
            }
        }.onFailure { Log.e(TAG, "applyServerAuthProfile failed", it) }
    }

    /**
     * Instant after which inbox notifications should be shown for this account.
     * Null if unknown (guest / not synced yet) — caller shows full feed like before.
     */
    suspend fun getAccountSignupInstantOrNull(): Instant? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching {
            store().data.first()[keyAccountCreatedAtIso].orEmpty().trim()
        }.getOrNull().orEmpty()
        if (raw.isBlank()) return null
        return parseFlexibleInstant(raw)
    }

    private fun parseFlexibleInstant(raw: String): Instant? {
        val s = raw.trim()
        if (s.isBlank()) return null
        runCatching { Instant.parse(s) }.getOrNull()?.let { return it }
        return runCatching {
            if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(s)) {
                LocalDate.parse(s).atStartOfDay(ZoneOffset.UTC).toInstant()
            } else {
                null
            }
        }.getOrNull()
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

    val notificationsClearedAtMs: Flow<Long>
        get() = storeOrNull()?.data?.map { it[keyNotificationsClearedAtMs] ?: 0L } ?: flowOf(0L)

    suspend fun clearAllNotificationsInbox() {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyNotificationsClearedAtMs] = System.currentTimeMillis()
            }
        }.onFailure { Log.e(TAG, "clearAllNotificationsInbox failed", it) }
    }

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

    /** Titles saved from post-login test picker (empty until picker submitted with picks). */
    val loginPickedTestTitles: Flow<List<String>>
        get() = storeOrNull()?.data?.map { prefs ->
            if ((prefs[keyLoginTestPickDone] ?: 0) != 1) {
                emptyList()
            } else {
                parseLoginPickedTestTitlesJson(prefs[keyLoginTestPickTitles].orEmpty())
            }
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
        scope.launch {
            runCatching {
                addAppliedTestSeriesNow(testName, lockMs, activeWindowMs)
            }.onFailure { Log.e(TAG, "addAppliedTestSeries failed", it) }
        }
    }

    /**
     * Persist an applied test locally and await the DataStore write. Skips duplicate active entries
     * for the same test title (case-insensitive).
     */
    suspend fun addAppliedTestSeriesNow(
        testName: String,
        lockMs: Long = DefaultStartSeriesLockMs,
        activeWindowMs: Long = DefaultStartSeriesActiveWindowMs,
        examDate: String? = null,
        slotLabel: String? = null,
    ): Boolean {
        if (!::appContext.isInitialized) return false
        val safeName = testName.trim()
        if (safeName.isBlank()) return false
        val now = System.currentTimeMillis()
        val safeLockMs = lockMs.coerceAtLeast(0L)
        val safeActiveWindowMs = activeWindowMs.coerceAtLeast(60_000L)
        return runCatching {
            store().edit { prefs ->
                val existing = parseAppliedTestSeries(prefs[keyAppliedTestSeries])
                    .filter { it.expiresAtMillis > now }
                val nextUnlockBase = existing
                    .filterNot { it.testName.equals(safeName, ignoreCase = true) }
                    .maxOfOrNull { it.expiresAtMillis } ?: now
                val applyLockAt = maxOf(now + safeLockMs, nextUnlockBase)
                val prior = existing.firstOrNull { it.testName.equals(safeName, ignoreCase = true) }
                val scheduledFromInput = TestScheduleUtils.parseExamStartMillis(examDate, slotLabel)
                val (unlockAt, scheduledStored) = when {
                    scheduledFromInput != null -> {
                        TestScheduleUtils.resolveUnlockAtMillis(
                            nowMs = now,
                            applyLockAtMillis = applyLockAt,
                            examDate = examDate,
                            slotLabel = slotLabel,
                        )
                    }
                    prior != null && prior.scheduledStartAtMillis > now -> {
                        prior.unlockAtMillis to prior.scheduledStartAtMillis
                    }
                    else -> {
                        TestScheduleUtils.resolveUnlockAtMillis(
                            nowMs = now,
                            applyLockAtMillis = applyLockAt,
                            examDate = null,
                            slotLabel = null,
                        )
                    }
                }
                val expiresAt = TestScheduleUtils.resolveExpiresAtMillis(
                    unlockAtMillis = unlockAt,
                    activeWindowMs = safeActiveWindowMs,
                    scheduledStartAtMillis = scheduledStored,
                )
                val nextEntry = AppliedTestSeriesEntry(
                    testName = safeName,
                    unlockAtMillis = unlockAt,
                    expiresAtMillis = expiresAt,
                    scheduledStartAtMillis = scheduledStored,
                )
                val updated = existing
                    .filterNot { it.testName.equals(safeName, ignoreCase = true) } + nextEntry
                prefs[keyAppliedTestSeries] = encodeAppliedTestSeries(updated)
            }
            true
        }.onFailure { Log.e(TAG, "addAppliedTestSeriesNow failed", it) }
            .getOrDefault(false)
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

    /** Persist the last successful CMS home payload for stale-while-revalidate rendering on the next cold start. */
    suspend fun saveCachedHomeContentNow(json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        runCatching {
            store().edit { prefs ->
                prefs[keyCachedHomeContentJson] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedHomeContentNow failed", it) }
    }

    /** Returns the last cached CMS home payload (raw JSON) or null if no cache yet / read failed. */
    suspend fun peekCachedHomeContent(): String? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyCachedHomeContentJson].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
    }

    suspend fun saveCachedExamCategoriesNow(json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        runCatching {
            store().edit { prefs ->
                prefs[keyCachedExamCategoriesJson] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedExamCategoriesNow failed", it) }
    }

    suspend fun peekCachedExamCategories(): String? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyCachedExamCategoriesJson].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
    }

    private fun cachedNewsFeedKey(feedKind: String): Preferences.Key<String> = when (feedKind.lowercase(Locale.US)) {
        "job" -> keyCachedNewsFeedJobJson
        "exam" -> keyCachedNewsFeedExamJson
        else -> keyCachedNewsFeedAllJson
    }

    /** Persist last successful API news list for [feedKind] (all / job / exam). */
    suspend fun saveCachedNewsFeedNow(feedKind: String, json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        val key = cachedNewsFeedKey(feedKind)
        runCatching {
            store().edit { prefs ->
                prefs[key] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedNewsFeedNow failed", it) }
    }

    suspend fun peekCachedNewsFeed(feedKind: String): String? {
        if (!::appContext.isInitialized) return null
        val key = cachedNewsFeedKey(feedKind)
        val raw = runCatching { store().data.first()[key].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
    }

    /** JSON blob: last resolved test cards by normalized title (LRU, for Start Test preview cold start). */
    private val keyCachedTestCardsBlob = stringPreferencesKey("cached_test_cards_blob_v1")

    suspend fun saveCachedTestCardsBlobNow(json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        runCatching {
            store().edit { prefs ->
                prefs[keyCachedTestCardsBlob] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedTestCardsBlobNow failed", it) }
    }

    suspend fun peekCachedTestCardsBlob(): String? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyCachedTestCardsBlob].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
    }

    suspend fun saveCachedProfileMenuJsonNow(json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        runCatching {
            store().edit { prefs ->
                prefs[keyCachedProfileMenuJson] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedProfileMenuJsonNow failed", it) }
    }

    suspend fun peekCachedProfileMenuJson(): String? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyCachedProfileMenuJson].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
    }

    suspend fun saveCachedTestsListsBlobNow(json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        runCatching {
            store().edit { prefs ->
                prefs[keyCachedTestsListsBlob] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedTestsListsBlobNow failed", it) }
    }

    suspend fun peekCachedTestsListsBlob(): String? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyCachedTestsListsBlob].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
    }

    suspend fun saveCachedQuizQuestionsBlobNow(json: String) {
        if (!::appContext.isInitialized) return
        if (json.isBlank()) return
        runCatching {
            store().edit { prefs ->
                prefs[keyCachedQuizQuestionsBlob] = json
            }
        }.onFailure { Log.e(TAG, "saveCachedQuizQuestionsBlobNow failed", it) }
    }

    suspend fun peekCachedQuizQuestionsBlob(): String? {
        if (!::appContext.isInitialized) return null
        val raw = runCatching { store().data.first()[keyCachedQuizQuestionsBlob].orEmpty().trim() }.getOrDefault("")
        return raw.takeIf { it.isNotBlank() }
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

    data class DailyQuizQuestionResult(
        val itemId: String = "",
        val selectedOptionIndex: Int?,
        val correctIndex: Int,
        val isCorrect: Boolean,
        val questionPrompt: String,
        val options: List<String>,
        val explanation: String,
        val timeTakenSeconds: Long = 0L,
    ) {
        val isAnswered: Boolean get() = selectedOptionIndex != null
    }

    /** Local snapshot for Daily Quiz result UI (separate from mock-test [PendingResultState]). */
    data class DailyQuizDayResult(
        val day: LocalDate,
        val questions: List<DailyQuizQuestionResult>,
        val totalTimeTakenSeconds: Long,
        val savedAtMillis: Long = System.currentTimeMillis(),
        /** Daily Quiz leaderboard for that calendar day only (not mock-test rank). */
        val rank: Int? = null,
        val rankTotal: Int? = null,
    ) {
        val correctCount: Int get() = questions.count { it.isAnswered && it.isCorrect }
        val wrongCount: Int get() = questions.count { it.isAnswered && !it.isCorrect }
        val skippedCount: Int get() = questions.count { !it.isAnswered }
        val totalQuestions: Int get() = questions.size.coerceAtLeast(1)

        /** Legacy single-question fields (first question) for older call sites. */
        val selectedOptionIndex: Int? get() = questions.firstOrNull()?.selectedOptionIndex
        val correctIndex: Int get() = questions.firstOrNull()?.correctIndex ?: 0
        val isCorrect: Boolean get() = questions.size == 1 && correctCount == 1
        val timeTakenSeconds: Long get() = totalTimeTakenSeconds
        val questionPrompt: String get() = questions.firstOrNull()?.questionPrompt.orEmpty()
        val options: List<String> get() = questions.firstOrNull()?.options.orEmpty()
        val explanation: String get() = questions.firstOrNull()?.explanation.orEmpty()
    }

    suspend fun loadDailyQuizAttemptedDates(): Set<LocalDate> {
        if (!::appContext.isInitialized) return emptySet()
        return runCatching {
            val raw = store().data.first()[keyDailyQuizResultsByDayJson].orEmpty()
            val root = parseDailyQuizResultsRoot(raw)
            val keyIter = root.keys()
            val dates = mutableSetOf<LocalDate>()
            while (keyIter.hasNext()) {
                val key = keyIter.next()
                runCatching { LocalDate.parse(key) }.getOrNull()?.let { dates.add(it) }
            }
            dates
        }.getOrElse { e ->
            Log.e(TAG, "loadDailyQuizAttemptedDates failed", e)
            emptySet()
        }
    }

    suspend fun loadDailyQuizDayResult(day: LocalDate): DailyQuizDayResult? {
        if (!::appContext.isInitialized) return null
        return runCatching {
            val raw = store().data.first()[keyDailyQuizResultsByDayJson].orEmpty()
            parseDailyQuizDayResult(day, parseDailyQuizResultsRoot(raw))
        }.getOrElse { e ->
            Log.e(TAG, "loadDailyQuizDayResult failed", e)
            null
        }
    }

    suspend fun saveDailyQuizDayResult(result: DailyQuizDayResult): Boolean {
        if (!::appContext.isInitialized) return false
        return runCatching {
            store().edit { prefs ->
                val root = parseDailyQuizResultsRoot(prefs[keyDailyQuizResultsByDayJson].orEmpty())
                val dayKey = result.day.toString()
                val questionsArr = JSONArray()
                result.questions.forEach { q ->
                    val optionsArr = JSONArray()
                    q.options.forEach { optionsArr.put(it) }
                    questionsArr.put(
                        JSONObject()
                            .put("itemId", q.itemId)
                            .put("selectedOptionIndex", q.selectedOptionIndex ?: JSONObject.NULL)
                            .put("correctIndex", q.correctIndex)
                            .put("isCorrect", q.isCorrect)
                            .put("timeTakenSeconds", q.timeTakenSeconds)
                            .put("questionPrompt", q.questionPrompt)
                            .put("options", optionsArr)
                            .put("explanation", q.explanation),
                    )
                }
                root.put(
                    dayKey,
                    JSONObject()
                        .put("questions", questionsArr)
                        .put("totalTimeTakenSeconds", result.totalTimeTakenSeconds)
                        .put("savedAtMillis", result.savedAtMillis)
                        .put("rank", result.rank ?: JSONObject.NULL)
                        .put("rankTotal", result.rankTotal ?: JSONObject.NULL),
                )
                prefs[keyDailyQuizResultsByDayJson] = root.toString()
            }
            true
        }.getOrElse { e ->
            Log.e(TAG, "saveDailyQuizDayResult failed", e)
            false
        }
    }

    private fun parseDailyQuizResultsRoot(raw: String): JSONObject {
        if (raw.isBlank()) return JSONObject()
        return runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
    }

    private fun parseDailyQuizQuestionResult(obj: JSONObject): DailyQuizQuestionResult {
        val options = mutableListOf<String>()
        val optArr = obj.optJSONArray("options")
        if (optArr != null) {
            for (i in 0 until optArr.length()) {
                options.add(optArr.optString(i, ""))
            }
        }
        val selectedRaw = obj.opt("selectedOptionIndex")
        val selectedOptionIndex = when (selectedRaw) {
            null, JSONObject.NULL -> null
            else -> obj.optInt("selectedOptionIndex", -1).takeIf { it in 0..3 }
        }
        return DailyQuizQuestionResult(
            itemId = obj.optString("itemId", ""),
            selectedOptionIndex = selectedOptionIndex,
            correctIndex = obj.optInt("correctIndex", 0).coerceIn(0, 3),
            isCorrect = obj.optBoolean("isCorrect", false),
            questionPrompt = obj.optString("questionPrompt", ""),
            options = options,
            explanation = obj.optString("explanation", ""),
            timeTakenSeconds = obj.optLong("timeTakenSeconds", 0L).coerceAtLeast(0L),
        )
    }

    private fun parseDailyQuizDayResult(day: LocalDate, root: JSONObject): DailyQuizDayResult? {
        val entry = root.optJSONObject(day.toString()) ?: return null
        val questionsArr = entry.optJSONArray("questions")
        val questions = if (questionsArr != null && questionsArr.length() > 0) {
            buildList {
                for (i in 0 until questionsArr.length()) {
                    val qObj = questionsArr.optJSONObject(i) ?: continue
                    add(parseDailyQuizQuestionResult(qObj))
                }
            }
        } else {
            // Legacy single-question format
            listOf(parseDailyQuizQuestionResult(entry))
        }
        if (questions.isEmpty()) return null
        val rankRaw = entry.opt("rank")
        val rank = when (rankRaw) {
            null, JSONObject.NULL -> null
            else -> entry.optInt("rank", 0).takeIf { it > 0 }
        }
        val rankTotalRaw = entry.opt("rankTotal")
        val rankTotal = when (rankTotalRaw) {
            null, JSONObject.NULL -> null
            else -> entry.optInt("rankTotal", 0).takeIf { it > 0 }
        }
        return DailyQuizDayResult(
            day = day,
            questions = questions,
            totalTimeTakenSeconds = entry.optLong(
                "totalTimeTakenSeconds",
                entry.optLong("timeTakenSeconds", 0L),
            ).coerceAtLeast(0L),
            savedAtMillis = entry.optLong("savedAtMillis", 0L),
            rank = rank,
            rankTotal = rankTotal,
        )
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
                                scheduledStartAtMillis = obj.optLong("scheduledStartAtMillis", 0L),
                            ),
                        )
                    }
                }
            }
        }.getOrElse { emptyList() }
    }

    private fun parseLoginPickedTestTitlesJson(raw: String): List<String> {
        if (raw.isBlank()) return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            val seen = mutableSetOf<String>()
            buildList {
                for (i in 0 until arr.length()) {
                    val t = arr.optString(i).trim()
                    if (t.isNotBlank() && seen.add(t.lowercase(Locale.US))) {
                        add(t)
                    }
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun encodeAppliedTestSeries(items: List<AppliedTestSeriesEntry>): String {
        val arr = JSONArray()
        items.forEach { item ->
            arr.put(
                JSONObject().apply {
                    put("testName", item.testName)
                    put("unlockAtMillis", item.unlockAtMillis)
                    put("expiresAtMillis", item.expiresAtMillis)
                    if (item.scheduledStartAtMillis > 0L) {
                        put("scheduledStartAtMillis", item.scheduledStartAtMillis)
                    }
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
                prefs[keyAccountCreatedAtIso] = ""
                prefs[keyLoginTestPickDone] = 0
                prefs[keyLoginTestPickTitles] = "[]"
            }
        }.onFailure { Log.e(TAG, "clearAuthSessionPrefs failed", it) }
    }

    /** True until the user submits the post-login test picker (once per session after install / logout). */
    suspend fun shouldShowLoginTestPicker(): Boolean {
        if (!::appContext.isInitialized) return false
        return runCatching {
            val prefs = store().data.first()
            (prefs[keyLoginTestPickDone] ?: 0) != 1
        }.getOrDefault(false)
    }

    suspend fun saveLoginTestPick(selectedTitles: List<String>): Boolean {
        if (!::appContext.isInitialized) return false
        val arr = JSONArray()
        selectedTitles.map { it.trim() }.filter { it.isNotBlank() }.distinct().forEach { arr.put(it) }
        return runCatching {
            store().edit { prefs ->
                prefs[keyLoginTestPickTitles] = arr.toString()
                prefs[keyLoginTestPickDone] = 1
            }
            true
        }.onFailure { Log.e(TAG, "saveLoginTestPick failed", it) }
            .getOrDefault(false)
    }

    suspend fun peekLoginPickedTestTitles(): List<String> {
        if (!::appContext.isInitialized) return emptyList()
        val prefs = runCatching { store().data.first() }.getOrNull() ?: return emptyList()
        if ((prefs[keyLoginTestPickDone] ?: 0) != 1) return emptyList()
        return parseLoginPickedTestTitlesJson(prefs[keyLoginTestPickTitles].orEmpty())
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
