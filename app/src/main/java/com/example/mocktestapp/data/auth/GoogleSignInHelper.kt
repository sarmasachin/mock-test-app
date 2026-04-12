package com.example.mocktestapp.data.auth

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.example.mocktestapp.BuildConfig
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
                    "Add mocktest.googleWebClientId to local.properties (Web client ID from Google Cloud Console).",
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
                    Result.failure(IllegalStateException("Could not read Google sign-in data"))
                }
            } else {
                Result.failure(IllegalStateException("Unexpected credential type from Google"))
            }
        } catch (e: GetCredentialException) {
            Result.failure(Exception(e.message ?: "Google Sign-In was cancelled or failed"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
