package com.example.mocktestapp.data.remote

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.authTokensDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "mocktest_auth_tokens",
)

private val keyAccess = stringPreferencesKey("access_token")
private val keyRefresh = stringPreferencesKey("refresh_token")

object AuthTokenStore {
    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun store() = appContext.authTokensDataStore

    suspend fun readAccess(): String? =
        store().data.map { it[keyAccess]?.takeIf { t -> t.isNotBlank() } }.first()

    suspend fun readRefresh(): String? =
        store().data.map { it[keyRefresh]?.takeIf { t -> t.isNotBlank() } }.first()

    suspend fun save(access: String, refresh: String) {
        store().edit { prefs ->
            prefs[keyAccess] = access
            prefs[keyRefresh] = refresh
        }
    }

    suspend fun clear() {
        store().edit { it.clear() }
    }
}
