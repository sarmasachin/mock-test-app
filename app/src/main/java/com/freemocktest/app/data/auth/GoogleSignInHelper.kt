package com.freemocktest.app.data.auth

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.freemocktest.app.BuildConfig
import com.freemocktest.app.R
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.activity.ComponentActivity

/**
 * Sign in with Google using Credential Manager + ID token for the backend.
 * Uses [R.string.default_web_client_id] from `google-services.json` when present so the Web client
 * matches the same Firebase/GCP project as the Android OAuth client (avoids 28444 / “developer console”
 * when `local.properties` has a mismatched id). Falls back to [BuildConfig.GOOGLE_WEB_CLIENT_ID].
 * Backend must still verify with the **same** Web client (`GOOGLE_WEB_CLIENT_ID`).
 */
object GoogleSignInHelper {

    private fun resolveServerClientId(activity: ComponentActivity): String {
        val fromFirebase = try {
            activity.getString(R.string.default_web_client_id).trim()
        } catch (_: Exception) {
            ""
        }
        if (fromFirebase.isNotEmpty()) return fromFirebase
        return BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
    }

    suspend fun requestIdToken(activity: ComponentActivity): Result<String> = withContext(Dispatchers.Main) {
        val serverClientId = resolveServerClientId(activity)
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
            val raw = e.message.orEmpty()
            val msg = when {
                e is NoCredentialException -> noCredentialHelpMessage()
                raw.contains("no credential", ignoreCase = true) -> noCredentialHelpMessage()
                raw.contains("28444", ignoreCase = true) ||
                    raw.contains("Developer console", ignoreCase = true) -> developerConsoleHelpMessage()
                else -> raw.ifBlank { "Google sign-in was cancelled. Please try again." }
            }
            Result.failure(Exception(msg))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Returned when Google cannot provide account data for this app on this device. */
    private fun noCredentialHelpMessage(): String =
        "No Google account data is available for this app on this device. Please try another Google account or contact support."

    /** Common when Android OAuth SHA-1 / package does not match this APK, or Web client was wrong. */
    private fun developerConsoleHelpMessage(): String =
        "Google sign-in setup does not match this app build. Your admin must add this build's SHA-1 " +
            "to Firebase or Google Cloud (Android OAuth client for com.freemocktest.app). " +
            "If you use a custom keystore, add its SHA-1 too. The server must use the same Web client ID as in Firebase."
}
