package com.example.mocktestapp.data

import android.content.Context
import android.util.Log
import com.example.mocktestapp.data.remote.AttemptRequest
import com.example.mocktestapp.data.remote.AuthTokenStore
import com.example.mocktestapp.data.remote.GoogleSignInRequest
import com.example.mocktestapp.data.remote.LoginRequest
import com.example.mocktestapp.data.remote.PatchPasswordRequest
import com.example.mocktestapp.data.remote.PatchProfileRequest
import com.example.mocktestapp.data.remote.PasswordResetCompleteBody
import com.example.mocktestapp.data.remote.PasswordResetRequestBody
import com.example.mocktestapp.data.remote.PasswordResetRequestResponse
import com.example.mocktestapp.data.remote.RefreshRequest
import com.example.mocktestapp.data.remote.RegisterRequest
import com.example.mocktestapp.data.remote.AuthUserDto
import com.example.mocktestapp.data.remote.RetrofitProvider
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
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

    @Volatile
    private var accessTokenMem: String? = null

    @Volatile
    private var refreshTokenMem: String? = null

    private val refreshMutex = Mutex()

    fun init(context: Context) {
        AuthTokenStore.init(context.applicationContext)
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
    }

    suspend fun restoreSession(): RestoreSessionStatus = withContext(Dispatchers.IO) {
        loadStoredTokens()
        if (accessTokenMem.isNullOrBlank()) {
            return@withContext RestoreSessionStatus.LoggedOut
        }
        return@withContext try {
            val me = RetrofitProvider.appApi.me()
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = me.user.displayName,
                email = me.user.email,
                mobile = me.user.phone,
                sixDigitPublicId = me.user.sixDigitPublicId,
                passwordPlain = "",
            )
            if (me.user.needsProfileCompletion()) {
                RestoreSessionStatus.ProfileIncomplete
            } else {
                RestoreSessionStatus.Ready
            }
        } catch (e: HttpException) {
            if (e.code() == 401) {
                clearSession()
            }
            Log.w(TAG, "restoreSession http ${e.code()}", e)
            RestoreSessionStatus.LoggedOut
        } catch (e: Exception) {
            Log.w(TAG, "restoreSession failed (network?)", e)
            RestoreSessionStatus.LoggedOut
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
                passwordPlain = password,
            )
            Result.success(resp.user)
        } catch (e: HttpException) {
            Result.failure(Exception(parseHttpError(e)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun loginWithGoogle(idToken: String): Result<AuthUserDto> = withContext(Dispatchers.IO) {
        try {
            val resp = RetrofitProvider.authApi.loginWithGoogle(GoogleSignInRequest(idToken = idToken.trim()))
            persistTokens(resp.accessToken, resp.refreshToken)
            AppPreferencesRepository.applyServerAuthProfile(
                displayName = resp.user.displayName,
                email = resp.user.email,
                mobile = resp.user.phone,
                sixDigitPublicId = resp.user.sixDigitPublicId,
                passwordPlain = "",
            )
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
                passwordPlain = password,
            )
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
                passwordPlain = "",
            )
            Result.success(Unit)
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

    suspend fun postAttemptRemote(
        testName: String,
        correct: Int,
        total: Int,
        completedAtMillis: Long,
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
                    testCatalogId = null,
                ),
            )
        } catch (e: Exception) {
            Log.w(TAG, "postAttemptRemote failed (offline or 401?)", e)
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
        return try {
            JsonParser.parseString(raw).asJsonObject.get("error")?.asString ?: raw
        } catch (_: Exception) {
            raw
        }
    }
}
