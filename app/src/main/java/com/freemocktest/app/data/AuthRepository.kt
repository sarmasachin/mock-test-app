package com.freemocktest.app.data

import android.content.Context
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
import kotlinx.coroutines.Dispatchers
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
            val resp = RetrofitProvider.authApi.login(
                LoginRequest(identifier = identifier.trim(), password = password),
            )
            persistTokens(resp.accessToken, resp.refreshToken)
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = resp.user.displayName,
                email = resp.user.email,
                mobile = resp.user.phone,
                sixDigitPublicId = resp.user.sixDigitPublicId,
                isEmailVerified = !resp.user.emailVerifiedAt.isNullOrBlank(),
                passwordPlain = password,
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

    suspend fun patchProfileRemote(
        displayName: String? = null,
        email: String? = null,
        phone: String? = null,
        state: String? = null,
        district: String? = null,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext Result.failure(Exception("Sign in to sync your profile"))
        }
        if (displayName == null && email == null && phone == null && state == null && district == null) {
            return@withContext Result.failure(IllegalArgumentException("Nothing to update"))
        }
        try {
            val resp = RetrofitProvider.appApi.patchProfile(
                PatchProfileRequest(
                    displayName = displayName?.trim()?.takeIf { it.isNotEmpty() },
                    email = email?.trim()?.lowercase()?.takeIf { it.isNotEmpty() },
                    phone = phone?.filter(Char::isDigit)?.take(10)?.takeIf { it.length == 10 },
                    state = state?.trim()?.takeIf { it.isNotEmpty() },
                    district = district?.trim()?.takeIf { it.isNotEmpty() },
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
        try {
            RetrofitProvider.appApi.postAttempt(
                AttemptRequest(
                    testName = testName,
                    correct = correct,
                    total = total,
                    completedAtMillis = completedAtMillis,
                    testCatalogId = testCatalogId,
                    clientSubmissionId = clientSubmissionId,
                ),
            )
        } catch (e: Exception) {
            Log.w(TAG, "postAttemptRemote failed (offline or 401?)", e)
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
