package com.freemocktest.app.data.auth

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.freemocktest.app.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.activity.ComponentActivity

/**
 * Sign in with Google using Credential Manager + ID token for the backend.
 * [BuildConfig.GOOGLE_WEB_CLIENT_ID] must be the **Web** OAuth client id (…apps.googleusercontent.com),
 * same as server `GOOGLE_WEB_CLIENT_ID`.
 */
object GoogleSignInHelper {

    suspend fun requestIdToken(activity: ComponentActivity): Result<String> = withContext(Dispatchers.Main) {
        val serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
        if (serverClientId.isEmpty()) {
            return@withContext Result.failure(
                IllegalStateException(
                    "Google Sign-In is not configured in this build. Please contact support.",
                ),
            )
        }
        try {
            val credentialManager = CredentialManager.create(activity.applicationContext)
            val googleIdOption = GetGoogleIdOption.Builder()
                .setServerClientId(serverClientId)
                .setFilterByAuthorizedAccounts(false)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()
            val result = credentialManager.getCredential(
                context = activity,
                request = request,
            )
            val cred = result.credential
            if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                try {
                    val parsed = GoogleIdTokenCredential.createFrom(cred.data)
                    Result.success(parsed.idToken)
                } catch (_: GoogleIdTokenParsingException) {
                    Result.failure(IllegalStateException("We could not read your Google sign-in information. Please try again."))
                }
            } else {
                Result.failure(IllegalStateException("Unexpected Google sign-in response. Please try again."))
            }
        } catch (e: GetCredentialException) {
            val msg = when {
                e is NoCredentialException -> noCredentialHelpMessage()
                e.message?.contains("no credential", ignoreCase = true) == true -> noCredentialHelpMessage()
                else -> e.message ?: "Google sign-in was cancelled. Please try again."
            }
            Result.failure(Exception(msg))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Returned when Google cannot provide account data for this app on this device. */
    private fun noCredentialHelpMessage(): String =
        "No Google account data is available for this app on this device. Please try another Google account or contact support."
}
