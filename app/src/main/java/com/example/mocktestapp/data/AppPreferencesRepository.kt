package com.example.mocktestapp.data

import android.content.Context
import android.util.Log
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
import com.example.mocktestapp.newui.auth.isValidEmail
import com.example.mocktestapp.newui.auth.isValidMobile
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
    private val keyProfileNotificationsEnabled = intPreferencesKey("profile_notifications_enabled")
    private val keyProfilePassword = stringPreferencesKey("profile_password")
    /** Eight-digit numeric id (10000000–99999999), 0 = not assigned yet. */
    private val keyProfileUserCode = intPreferencesKey("profile_user_code")
    private val keyPendingResultTestName = stringPreferencesKey("pending_result_test_name")
    private val keyPendingResultPublishAt = longPreferencesKey("pending_result_publish_at")
    private val keyPendingResultSessionHiddenAt = longPreferencesKey("pending_result_session_hidden_at")
    private val keyPendingResultViewed = intPreferencesKey("pending_result_viewed")
    private val keyPendingResultAnswered = intPreferencesKey("pending_result_answered")
    private val keyPendingResultCorrect = intPreferencesKey("pending_result_correct")
    private val keyPendingResultWrong = intPreferencesKey("pending_result_wrong")
    private val keyAppliedTestSeries = stringPreferencesKey("applied_test_series")
    private val keyAuthBootstrapState = stringPreferencesKey("auth_bootstrap_state")

    private const val DefaultStartSeriesLockMs = 20_000L
    private const val DefaultStartSeriesActiveWindowMs = 30 * 60 * 1000L

    data class EditableProfileState(
        val displayName: String,
        val email: String,
        val mobile: String,
        val gender: String,
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
            )
        } ?: flowOf(EditableProfileState("", "", "", ""))

    data class DrawerUserProfile(
        /** Username from signup / profile (shown first in drawer). */
        val displayName: String,
        /** Email line under name (Gmail etc.); drawer does not mix mobile here. */
        val emailLine: String,
        /** Formatted eight digits from server or local, or null until assigned. */
        val userIdFormatted: String?,
    )

    data class PendingResultState(
        val testName: String,
        val publishAtMillis: Long,
        val answered: Int,
        val correct: Int,
        val wrong: Int,
        val sessionHiddenAtMillis: Long,
        val viewed: Boolean,
    )

    data class AppliedTestSeriesEntry(
        val testName: String,
        val unlockAtMillis: Long,
        val expiresAtMillis: Long,
    )

    val drawerUserProfile: Flow<DrawerUserProfile>
        get() = storeOrNull()?.data?.map { prefs ->
            val code = prefs[keyProfileUserCode] ?: 0
            val formatted =
                if (code in 10_000_000..99_999_999) String.format(Locale.US, "%08d", code) else null
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

    private fun randomEightDigitUserCode(): Int = Random.nextInt(10_000_000, 100_000_000)

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
                prefs[keyProfileContact] = email.trim()
                prefs[keyProfilePassword] = password
                val existing = prefs[keyProfileUserCode] ?: 0
                if (existing !in 10_000_000..99_999_999) {
                    prefs[keyProfileUserCode] = randomEightDigitUserCode()
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
                prefs[keyProfilePassword] = password
                val existing = prefs[keyProfileUserCode] ?: 0
                if (existing !in 10_000_000..99_999_999) {
                    prefs[keyProfileUserCode] = randomEightDigitUserCode()
                }
            }
        }.onFailure { Log.e(TAG, "applyLoginProfile failed", it) }
    }

    /**
     * Syncs profile from backend after API login/register or token restore.
     * If [passwordPlain] is blank, the saved password preference is left unchanged.
     */
    suspend fun applyServerAuthProfile(
        displayName: String,
        email: String,
        mobile: String,
        sixDigitPublicId: Int,
        isEmailVerified: Boolean,
        passwordPlain: String,
    ) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = displayName.trim()
                prefs[keyProfileEmail] = email.trim()
                prefs[keyProfileMobile] = mobile.trim().filter(Char::isDigit).take(10)
                prefs[keyProfileGender] = prefs[keyProfileGender].orEmpty()
                prefs[keyProfileContact] = email.trim()
                if (sixDigitPublicId in 10_000_000..99_999_999) {
                    prefs[keyProfileUserCode] = sixDigitPublicId
                }
                if (passwordPlain.isNotBlank()) {
                    prefs[keyProfilePassword] = passwordPlain
                }
                prefs[keyEmailVerified] = if (isEmailVerified) 1 else 0
            }
        }.onFailure { Log.e(TAG, "applyServerAuthProfile failed", it) }
    }

    /**
     * Updates profile fields. [newPassword] blank = keep existing password.
     * Email cannot change after [keyEmailVerified] is set (demo: after "verify email").
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
                if (newPassword.isNotBlank()) {
                    prefs[keyProfilePassword] = newPassword
                }
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

    /**
     * Updates password after verifying [oldPassword] matches the stored value.
     * Fails if no password is stored locally (e.g. session restored without saving password).
     */
    /** Updates the locally mirrored login password after a successful server password change. */
    suspend fun updateStoredPasswordPlain(plain: String) {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfilePassword] = plain
            }
        }.onFailure { Log.e(TAG, "updateStoredPasswordPlain failed", it) }
    }

    suspend fun updatePasswordWithOldCheck(oldPassword: String, newPassword: String): Result<Unit> {
        if (!::appContext.isInitialized) return Result.failure(IllegalStateException("Preferences not ready"))
        if (newPassword.length < 4) {
            return Result.failure(IllegalArgumentException("New password must be at least 4 characters"))
        }
        val prefsSnapshot = store().data.first()
        val current = prefsSnapshot[keyProfilePassword].orEmpty()
        if (current.isBlank()) {
            return Result.failure(IllegalStateException("No password on this device — sign in again with password."))
        }
        if (current != oldPassword) {
            return Result.failure(IllegalArgumentException("Old password does not match"))
        }
        return runCatching {
            store().edit { prefs ->
                prefs[keyProfilePassword] = newPassword
            }
            Unit
        }.fold(
            onSuccess = { Result.success(Unit) },
            onFailure = { e ->
                Log.e(TAG, "updatePasswordWithOldCheck failed", e)
                Result.failure(e)
            },
        )
    }

    /** If profile exists without a code (e.g. migration), assign one once. */
    suspend fun ensureDrawerUserCode() {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                val existing = prefs[keyProfileUserCode] ?: 0
                if (existing !in 10_000_000..99_999_999) {
                    prefs[keyProfileUserCode] = randomEightDigitUserCode()
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
                    sessionHiddenAtMillis = prefs[keyPendingResultSessionHiddenAt] ?: 0L,
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

    fun markPendingResultSubmitted(
        testName: String,
        publishAtMillis: Long,
        answered: Int,
        correct: Int,
        wrong: Int,
    ) {
        if (!::appContext.isInitialized) return
        val safeName = testName.trim().ifBlank { "Test" }
        val safePublish = publishAtMillis.takeIf { it > 0L } ?: (System.currentTimeMillis() + 2 * 60 * 1000L)
        val safeAnswered = answered.coerceAtLeast(0)
        val safeCorrect = correct.coerceAtLeast(0)
        val safeWrong = wrong.coerceAtLeast(0)
        scope.launch {
            runCatching {
                store().edit { prefs ->
                    prefs[keyPendingResultTestName] = safeName
                    prefs[keyPendingResultPublishAt] = safePublish
                    prefs[keyPendingResultAnswered] = safeAnswered
                    prefs[keyPendingResultCorrect] = safeCorrect
                    prefs[keyPendingResultWrong] = safeWrong
                    prefs[keyPendingResultSessionHiddenAt] = 0L
                    prefs[keyPendingResultViewed] = 0
                }
            }.onFailure { Log.e(TAG, "markPendingResultSubmitted failed", it) }
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

    fun hidePendingResultCardForSession() {
        if (!::appContext.isInitialized) return
        scope.launch {
            runCatching {
                store().edit { prefs ->
                    prefs[keyPendingResultSessionHiddenAt] = System.currentTimeMillis()
                }
            }.onFailure { Log.e(TAG, "hidePendingResultCardForSession failed", it) }
        }
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
                    prefs[keyPendingResultSessionHiddenAt] = 0L
                }
            }.onFailure { Log.e(TAG, "markPendingResultViewedAndClear failed", it) }
        }
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

    /** Clears sign-in profile fields; keeps streak, digest, and cached feed URLs. */
    suspend fun clearAuthSessionPrefs() {
        if (!::appContext.isInitialized) return
        runCatching {
            store().edit { prefs ->
                prefs[keyProfileDisplayName] = ""
                prefs[keyProfileContact] = ""
                prefs[keyProfileEmail] = ""
                prefs[keyProfileMobile] = ""
                prefs[keyProfileGender] = ""
                prefs[keyProfilePassword] = ""
                prefs[keyProfileUserCode] = 0
                prefs[keyEmailVerified] = 0
                prefs[keyPhoneVerified] = 0
                prefs[keyAuthBootstrapState] = RestoreSessionStatus.LoggedOut.name
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
        val uid = prefs[keyProfileUserCode] ?: 0
        return """
            {"streakDays":$streak,"lastOpenedTest":"${q(lastTest)}","lastOpenedTestTime":$lastTestTime,"cachedFeedJobUrl":"${q(job)}","cachedFeedExamUrl":"${q(exam)}","cachedFeedNewsUrl":"${q(news)}","emailVerified":$emailV,"phoneVerified":$phoneV,"displayName":"${q(display)}","contact":"${q(contact)}","email":"${q(email)}","mobile":"${q(mobile)}","gender":"${q(gender)}","userCode":$uid}
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
}
