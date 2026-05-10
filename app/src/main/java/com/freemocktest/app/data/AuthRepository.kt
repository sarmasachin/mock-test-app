package com.freemocktest.app.data

import android.content.Context
import android.provider.Settings
import android.util.Log
import com.freemocktest.app.data.remote.AttemptRequest
import com.freemocktest.app.data.remote.EmailVerificationConfirmBody
import com.freemocktest.app.data.remote.AuthTokenStore
import com.freemocktest.app.data.remote.LoginRequest
import com.freemocktest.app.data.remote.PatchPasswordRequest
import com.freemocktest.app.data.remote.PatchProfileRequest
import com.freemocktest.app.data.remote.PasswordResetCompleteBody
import com.freemocktest.app.data.remote.PasswordResetRequestBody
import com.freemocktest.app.data.remote.PasswordResetRequestResponse
import com.freemocktest.app.data.remote.RefreshRequest
import com.freemocktest.app.data.remote.GoogleSignInRequestBody
import com.freemocktest.app.data.remote.RegisterRequest
import com.freemocktest.app.data.remote.AuthUserDto
import com.freemocktest.app.data.remote.RetrofitProvider
import com.freemocktest.app.data.remote.TextMessageBody
import com.freemocktest.app.data.remote.ApplyTestResponse
import com.freemocktest.app.data.remote.TestWaitlistStatusResponse
import com.freemocktest.app.notifications.PushTokenRegistrar
import com.google.gson.JsonParser
import java.io.IOException
import java.net.UnknownHostException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import retrofit2.HttpException

enum class RestoreSessionStatus {
    LoggedOut,
    Ready,
    ProfileIncomplete,
}

/**
 * Remote auth + token lifecycle. Call [init] from [MockTestApp], then [RetrofitProvider.init].
 */
object AuthRepository {
    private const val TAG = "AuthRepository"
    private const val RESTORE_TIMEOUT_MS = 3500L

    /** Long-lived scope for fire-and-forget background refreshes (e.g. SWR /me sync after instant boot). */
    private val backgroundScope = CoroutineScope(
        SupervisorJob() + Dispatchers.IO + CoroutineExceptionHandler { _, e ->
            Log.e(TAG, "Background auth task failed", e)
        },
    )

    private fun loginDeviceFingerprint(): String {
        return try {
            val id = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            if (id.isNullOrBlank()) "" else "android:$id"
        } catch (_: Exception) {
            ""
        }
    }

    @Volatile
    private var accessTokenMem: String? = null

    @Volatile
    private var refreshTokenMem: String? = null

    private val refreshMutex = Mutex()
    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
        AuthTokenStore.init(appContext)
    }

    fun peekAccessToken(): String? = accessTokenMem

    suspend fun loadStoredTokens() {
        accessTokenMem = AuthTokenStore.readAccess()
        refreshTokenMem = AuthTokenStore.readRefresh()
    }

    suspend fun persistTokens(access: String, refresh: String) {
        accessTokenMem = access
        refreshTokenMem = refresh
        AuthTokenStore.save(access, refresh)
    }

    suspend fun clearSession() {
        accessTokenMem = null
        refreshTokenMem = null
        AuthTokenStore.clear()
        AppPreferencesRepository.setAuthBootstrapState(RestoreSessionStatus.LoggedOut)
    }

    suspend fun restoreSession(): RestoreSessionStatus = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            AppPreferencesRepository.setAuthBootstrapState(RestoreSessionStatus.LoggedOut)
            return@withContext RestoreSessionStatus.LoggedOut
        }
        val cachedStatus = AppPreferencesRepository.getAuthBootstrapState()
        // Stale-while-revalidate: if we already know this user is signed in (Ready or
        // ProfileIncomplete), navigate immediately using the cached bootstrap state and refresh
        // the server profile in the background. This eliminates the 3.5s cold-start spinner that
        // was waiting on /me to respond. We never short-circuit when the cached state is missing
        // or LoggedOut – those still go through the original network-confirm path below.
        if (cachedStatus == RestoreSessionStatus.Ready ||
            cachedStatus == RestoreSessionStatus.ProfileIncomplete
        ) {
            refreshSessionInBackground()
            return@withContext cachedStatus
        }
        return@withContext try {
            val me = withTimeoutOrNull(RESTORE_TIMEOUT_MS) { RetrofitProvider.appApi.me() }
            if (me == null) {
                Log.w(TAG, "restoreSession timed out, using cached status")
                return@withContext cachedStatus ?: RestoreSessionStatus.Ready
            }
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = me.user.displayName,
                email = me.user.email,
                mobile = me.user.phone,
                sixDigitPublicId = me.user.sixDigitPublicId,
                isEmailVerified = !me.user.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = "",
                gender = me.user.gender,
                birthdayDate = me.user.birthdayDate,
                accountCreatedAtIso = me.user.createdAt,
            )
            val status = if (me.user.needsProfileCompletion()) {
                RestoreSessionStatus.ProfileIncomplete
            } else {
                RestoreSessionStatus.Ready
            }
            AppPreferencesRepository.setAuthBootstrapState(status)
            PushTokenRegistrar.syncInBackground(appContext)
            status
        } catch (e: HttpException) {
            if (e.code() == 401) {
                clearSession()
                AppPreferencesRepository.setAuthBootstrapState(RestoreSessionStatus.LoggedOut)
            }
            Log.w(TAG, "restoreSession http ${e.code()}", e)
            RestoreSessionStatus.LoggedOut
        } catch (e: Exception) {
            Log.w(TAG, "restoreSession failed (network?)", e)
            cachedStatus ?: RestoreSessionStatus.Ready
        }
    }

    /**
     * Fire-and-forget /me refresh used by the SWR cold-start path. Updates the local profile
     * snapshot, syncs the cached bootstrap state, and clears the session on a real 401. Other
     * failures (timeouts, offline) are intentionally swallowed so the user keeps the cached UI.
     */
    private fun refreshSessionInBackground() {
        backgroundScope.launch {
            runCatching {
                val me = withTimeoutOrNull(RESTORE_TIMEOUT_MS) { RetrofitProvider.appApi.me() }
                    ?: return@runCatching
                AppPreferencesRepository.applyServerAuthProfile(
                    displayName = me.user.displayName,
                    email = me.user.email,
                    mobile = me.user.phone,
                    sixDigitPublicId = me.user.sixDigitPublicId,
                    isEmailVerified = !me.user.emailVerifiedAt.isNullOrBlank(),
                    passwordPlain = "",
                    gender = me.user.gender,
                    birthdayDate = me.user.birthdayDate,
                    accountCreatedAtIso = me.user.createdAt,
                )
                val status = if (me.user.needsProfileCompletion()) {
                    RestoreSessionStatus.ProfileIncomplete
                } else {
                    RestoreSessionStatus.Ready
                }
                AppPreferencesRepository.setAuthBootstrapState(status)
                PushTokenRegistrar.syncInBackground(appContext)
            }.onFailure { e ->
                if (e is HttpException && e.code() == 401) {
                    runCatching { clearSession() }
                        .onFailure { Log.w(TAG, "background clearSession failed", it) }
                    runCatching { AppPreferencesRepository.setAuthBootstrapState(RestoreSessionStatus.LoggedOut) }
                        .onFailure { Log.w(TAG, "background setAuthBootstrapState failed", it) }
                } else {
                    Log.w(TAG, "background restoreSession refresh failed", e)
                }
            }
        }
    }

    suspend fun silentRefreshAccessToken(): String? = refreshMutex.withLock {
        try {
            val rt = refreshTokenMem ?: AuthTokenStore.readRefresh() ?: return@withLock null
            val body = RetrofitProvider.authApi.refresh(RefreshRequest(rt))
            persistTokens(body.accessToken, body.refreshToken)
            body.accessToken
        } catch (e: Exception) {
            Log.w(TAG, "silentRefreshAccessToken failed", e)
            null
        }
    }

    suspend fun login(identifier: String, password: String): Result<AuthUserDto> = withContext(Dispatchers.IO) {
        try {
            val fp = loginDeviceFingerprint()
            val resp = RetrofitProvider.authApi.login(
                LoginRequest(
                    identifier = identifier.trim(),
                    password = password,
                    deviceFingerprint = fp.takeIf { it.isNotBlank() },
                ),
            )
            persistTokens(resp.accessToken, resp.refreshToken)
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = resp.user.displayName,
                email = resp.user.email,
                mobile = resp.user.phone,
                sixDigitPublicId = resp.user.sixDigitPublicId,
                isEmailVerified = !resp.user.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = password,
                gender = resp.user.gender,
                birthdayDate = resp.user.birthdayDate,
                accountCreatedAtIso = resp.user.createdAt,
            )
            AppPreferencesRepository.setAuthBootstrapState(
                if (resp.user.needsProfileCompletion()) {
                    RestoreSessionStatus.ProfileIncomplete
                } else {
                    RestoreSessionStatus.Ready
                },
            )
            PushTokenRegistrar.syncInBackground(appContext)
            Result.success(resp.user)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun signInWithGoogle(idToken: String): Result<AuthUserDto> = withContext(Dispatchers.IO) {
        try {
            val resp = RetrofitProvider.authApi.googleSignIn(
                GoogleSignInRequestBody(idToken = idToken.trim()),
            )
            persistTokens(resp.accessToken, resp.refreshToken)
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = resp.user.displayName,
                email = resp.user.email,
                mobile = resp.user.phone,
                sixDigitPublicId = resp.user.sixDigitPublicId,
                isEmailVerified = !resp.user.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = "",
                gender = resp.user.gender,
                birthdayDate = resp.user.birthdayDate,
                accountCreatedAtIso = resp.user.createdAt,
            )
            AppPreferencesRepository.setAuthBootstrapState(
                if (resp.user.needsProfileCompletion()) {
                    RestoreSessionStatus.ProfileIncomplete
                } else {
                    RestoreSessionStatus.Ready
                },
            )
            PushTokenRegistrar.syncInBackground(appContext)
            Result.success(resp.user)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun register(
        displayName: String,
        email: String,
        phone: String,
        password: String,
        state: String,
        district: String,
    ): Result<AuthUserDto> = withContext(Dispatchers.IO) {
        try {
            val resp = RetrofitProvider.authApi.register(
                RegisterRequest(
                    displayName = displayName.trim(),
                    email = email.trim(),
                    phone = phone.trim().filter(Char::isDigit).take(10),
                    password = password,
                    state = state.trim().ifBlank { null },
                    district = district.trim().ifBlank { null },
                ),
            )
            persistTokens(resp.accessToken, resp.refreshToken)
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = resp.user.displayName,
                email = resp.user.email,
                mobile = resp.user.phone,
                sixDigitPublicId = resp.user.sixDigitPublicId,
                isEmailVerified = !resp.user.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = password,
                gender = resp.user.gender,
                birthdayDate = resp.user.birthdayDate,
                accountCreatedAtIso = resp.user.createdAt,
            )
            AppPreferencesRepository.setAuthBootstrapState(
                if (resp.user.needsProfileCompletion()) {
                    RestoreSessionStatus.ProfileIncomplete
                } else {
                    RestoreSessionStatus.Ready
                },
            )
            PushTokenRegistrar.syncInBackground(appContext)
            Result.success(resp.user)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            clearSession()
            AppPreferencesRepository.clearAuthSessionPrefs()
        }.fold(
            onSuccess = { Result.success(Unit) },
            onFailure = { Result.failure(it) },
        )
    }

    /**
     * Pulls latest profile from `GET /v1/me` (including `birthdayDate`) into local prefs.
     * Used so Tools / Calculator see server DOB without a separate network layer there.
     */
    suspend fun syncProfileFromServer(): Result<Unit> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Not signed in"))
        }
        try {
            val me = RetrofitProvider.appApi.me()
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = me.user.displayName,
                email = me.user.email,
                mobile = me.user.phone,
                sixDigitPublicId = me.user.sixDigitPublicId,
                isEmailVerified = !me.user.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = "",
                gender = me.user.gender,
                birthdayDate = me.user.birthdayDate,
                accountCreatedAtIso = me.user.createdAt,
            )
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun patchProfileRemote(
        displayName: String? = null,
        email: String? = null,
        phone: String? = null,
        state: String? = null,
        district: String? = null,
        gender: String? = null,
        /** Pass `""` to clear on server; `null` = do not send this field. */
        birthdayDate: String? = null,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in to sync your profile"))
        }
        if (displayName == null && email == null && phone == null && state == null && district == null && gender == null && birthdayDate == null) {
            return@withContext Result.failure(IllegalArgumentException("Nothing to update"))
        }
        try {
            val birthdayPayload: String? =
                when (birthdayDate) {
                    null -> null
                    else -> birthdayDate.trim()
                }
            val genderPayload: String? =
                when (gender) {
                    null -> null
                    else -> gender.trim()
                }
            val resp = RetrofitProvider.appApi.patchProfile(
                PatchProfileRequest(
                    displayName = displayName?.trim()?.takeIf { it.isNotEmpty() },
                    email = email?.trim()?.lowercase()?.takeIf { it.isNotEmpty() },
                    phone = phone?.filter(Char::isDigit)?.take(10)?.takeIf { it.length == 10 },
                    state = state?.trim()?.takeIf { it.isNotEmpty() },
                    district = district?.trim()?.takeIf { it.isNotEmpty() },
                    gender = genderPayload,
                    birthdayDate = birthdayPayload,
                ),
            )
            val u = resp.user
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = u.displayName,
                email = u.email,
                mobile = u.phone,
                sixDigitPublicId = u.sixDigitPublicId,
                isEmailVerified = !u.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = "",
                gender = u.gender,
                birthdayDate = u.birthdayDate,
                accountCreatedAtIso = u.createdAt,
            )
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun requestEmailVerificationOtp(): Result<String> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        try {
            val resp = RetrofitProvider.appApi.requestEmailVerificationOtp()
            Result.success(resp.message ?: "Verification code sent")
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun confirmEmailVerification(otp: String): Result<String> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        try {
            val resp = RetrofitProvider.appApi.confirmEmailVerification(
                EmailVerificationConfirmBody(otp = otp.trim()),
            )
            AppPreferencesRepository.setEmailVerified(true)
            Result.success(
                if (resp.alreadyVerified) "Email already verified" else (resp.message ?: "Email verified successfully"),
            )
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun changePasswordRemote(currentPassword: String, newPassword: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            loadStoredTokens()
            if (accessTokenMem.isNullOrBlank()) {
                return@withContext Result.failure(Exception("Sign in to sync your profile"))
            }
            try {
                RetrofitProvider.appApi.patchPassword(
                    PatchPasswordRequest(currentPassword = currentPassword, newPassword = newPassword),
                )
                AppPreferencesRepository.updateStoredPasswordPlain(newPassword)
                Result.success(Unit)
            } catch (e: HttpException) {
                Result.failure(Exception(parseHttpError(e)))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun requestPasswordResetOtp(email: String): Result<PasswordResetRequestResponse> =
        withContext(Dispatchers.IO) {
            try {
                val body = RetrofitProvider.authApi.passwordResetRequest(
                    PasswordResetRequestBody(email = email.trim().lowercase()),
                )
                Result.success(body)
            } catch (e: HttpException) {
                Result.failure(Exception(parseHttpError(e)))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun completePasswordReset(email: String, otp: String, newPassword: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                RetrofitProvider.authApi.passwordResetComplete(
                    PasswordResetCompleteBody(
                        email = email.trim().lowercase(),
                        otp = otp.trim(),
                        newPassword = newPassword,
                    ),
                )
                Result.success(Unit)
            } catch (e: HttpException) {
                Result.failure(Exception(parseHttpError(e)))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun deleteAccountOnServer(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val resp = RetrofitProvider.appApi.deleteMe()
            if (resp.isSuccessful) {
                Result.success(Unit)
            } else {
                val raw = resp.errorBody()?.use { it.string() }.orEmpty()
                val msg = parseErrorJsonString(raw).ifBlank { "Delete failed (${resp.code()})" }
                Result.failure(Exception(msg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun submitHelpSupport(message: String): Result<Unit> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        try {
            RetrofitProvider.appApi.submitSupport(TextMessageBody(message.trim()))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun submitFeedback(message: String): Result<Unit> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        try {
            RetrofitProvider.appApi.submitFeedback(TextMessageBody(message.trim()))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun submitIssueReport(message: String): Result<Unit> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        try {
            RetrofitProvider.appApi.submitReportIssue(TextMessageBody(message.trim()))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun postAttemptRemote(
        testName: String,
        correct: Int,
        total: Int,
        completedAtMillis: Long,
        testCatalogId: String,
        clientSubmissionId: String,
    ) = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext
        }
        val body =
            AttemptRequest(
                testName = testName,
                correct = correct,
                total = total,
                completedAtMillis = completedAtMillis,
                testCatalogId = testCatalogId,
                clientSubmissionId = clientSubmissionId,
            )
        val maxAttempts = 4
        for (attempt in 0 until maxAttempts) {
            try {
                RetrofitProvider.appApi.postAttempt(body)
                return@withContext
            } catch (e: HttpException) {
                val code = e.code()
                val retryableHttp = code == 429 || code == 502 || code == 503 || code == 504
                if (!retryableHttp || attempt == maxAttempts - 1) {
                    Log.w(TAG, "postAttemptRemote failed HTTP $code", e)
                    return@withContext
                }
                val headerSec = e.response()?.headers()?.get("Retry-After")?.trim()?.toLongOrNull()
                val waitMs =
                    when {
                        headerSec != null && headerSec > 0 -> (headerSec * 1000L).coerceAtMost(30_000L)
                        else -> (500L shl attempt).coerceAtMost(10_000L)
                    }
                delay(waitMs.coerceAtLeast(200L))
            } catch (e: UnknownHostException) {
                Log.w(TAG, "postAttemptRemote offline", e)
                return@withContext
            } catch (e: IOException) {
                if (attempt >= maxAttempts - 1) {
                    Log.w(TAG, "postAttemptRemote network error after retries", e)
                    return@withContext
                }
                delay((500L shl attempt).coerceAtMost(10_000L))
            } catch (e: Exception) {
                Log.w(TAG, "postAttemptRemote failed", e)
                return@withContext
            }
        }
    }

    suspend fun applyForTest(testId: String): Result<ApplyTestResponse> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        if (testId.isBlank()) {
            return@withContext Result.failure(Exception("Test details not found"))
        }
        try {
            val resp = RetrofitProvider.appApi.applyForTest(testId.trim())
            Result.success(resp)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getTestWaitlistStatus(testId: String): Result<TestWaitlistStatusResponse> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in required"))
        }
        if (testId.isBlank()) {
            return@withContext Result.failure(Exception("Test details not found"))
        }
        try {
            val resp = RetrofitProvider.appApi.getTestWaitlistStatus(testId.trim())
            Result.success(resp)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseHttpError(e: HttpException): String {
        val raw = e.response()?.errorBody()?.use { it.string() }.orEmpty()
        return parseErrorJsonString(raw).ifBlank {
            e.message ?: "Request failed (${e.code()})"
        }
    }

    private fun parseErrorJsonString(raw: String): String {
        if (raw.isBlank()) return ""
        if (raw.contains("<html", ignoreCase = true) || raw.contains("<!doctype", ignoreCase = true)) {
            return "Server is temporarily unavailable"
        }
        return try {
            JsonParser.parseString(raw).asJsonObject.get("error")?.asString ?: raw
        } catch (_: Exception) {
            raw
        }
    }
}
