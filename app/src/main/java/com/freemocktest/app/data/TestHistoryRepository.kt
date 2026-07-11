package com.freemocktest.app.data

import android.util.Log
import com.freemocktest.app.data.local.MockTestDatabase
import com.freemocktest.app.data.local.TestAttemptDao
import com.freemocktest.app.data.local.TestAttemptEntity
import com.freemocktest.app.util.UserScopeKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * Persists completed mock-test rows (Room). Initialized from [com.freemocktest.app.MockTestApp].
 * User scope keys are canonicalized via [UserScopeKeys] (email lowercase, `uid:123456`).
 */
object TestHistoryRepository {
    private const val TAG = "TestHistoryRepo"

    @Volatile
    private var dao: TestAttemptDao? = null

    fun init(database: MockTestDatabase) {
        dao = database.testAttemptDao()
    }

    /**
     * One-shot migration: rewrite legacy `123456` / mixed-case email keys to canonical form.
     */
    suspend fun migrateLegacyUserKeysIfNeeded() {
        val d = dao ?: return
        withContext(Dispatchers.IO) {
            runCatching {
                d.listAll().forEach { row ->
                    val canonical = UserScopeKeys.canonicalizeLegacyKey(row.userKey)
                    if (canonical.isNotBlank() && canonical != row.userKey) {
                        d.updateUserKey(row.id, canonical)
                    }
                }
            }.onFailure { e ->
                Log.e(TAG, "Legacy user_key migration failed", e)
            }
        }
    }

    /** Observes all mock-test attempts for the signed-in user (includes legacy key aliases). */
    fun observeAttemptsForLoggedInUser(): Flow<List<TestAttemptEntity>> {
        val scopeFlow = AppPreferencesRepository.userScopeKey
        val profileFlow = AppPreferencesRepository.drawerUserProfile
        return combine(scopeFlow, profileFlow) { scope, profile ->
            UserScopeKeys.lookupKeys(scope, profile.userIdFormatted)
        }.flatMapLatest { keys ->
            observeAttemptsByLookupKeys(keys)
        }
    }

    fun observeAttempts(userKey: String): Flow<List<TestAttemptEntity>> {
        return flowOf(userKey).flatMapLatest { key ->
            val keys = UserScopeKeys.lookupKeys(
                canonicalScopeKey = UserScopeKeys.canonicalizeLegacyKey(key),
                userIdFormatted = null,
            )
            observeAttemptsByLookupKeys(keys)
        }
    }

    private fun observeAttemptsByLookupKeys(keys: List<String>): Flow<List<TestAttemptEntity>> {
        if (keys.isEmpty()) return flowOf(emptyList())
        return dao?.observeAllByUserKeys(keys) ?: flowOf(emptyList())
    }

    private suspend fun resolveLookupKeys(userKey: String): List<String> {
        val canonical = when {
            userKey.isNotBlank() -> UserScopeKeys.canonicalizeLegacyKey(userKey)
            else -> AppPreferencesRepository.peekContentStateOwnerIdNow().trim()
        }
        if (canonical.isBlank()) return emptyList()
        val uid = AppPreferencesRepository.peekUserIdFormattedNow()
        return UserScopeKeys.lookupKeys(canonical, uid)
    }

    private suspend fun resolveCanonicalUserKey(userKey: String): String? {
        val canonical = when {
            userKey.isNotBlank() -> UserScopeKeys.canonicalizeLegacyKey(userKey)
            else -> AppPreferencesRepository.peekContentStateOwnerIdNow().trim()
        }
        return canonical.takeIf { it.isNotBlank() }
    }

    suspend fun recordAttempt(
        userKey: String,
        testName: String,
        testCatalogId: String,
        correct: Int,
        total: Int,
        completedAtMillis: Long = System.currentTimeMillis(),
    ) {
        val d = dao ?: run {
            Log.w(TAG, "recordAttempt skipped: database not initialized")
            return
        }
        val safeUserKey = resolveCanonicalUserKey(userKey) ?: run {
            Log.w(TAG, "recordAttempt skipped: user scope key missing")
            return
        }
        withContext(Dispatchers.IO) {
            try {
                d.insert(
                    TestAttemptEntity(
                        userKey = safeUserKey,
                        testName = testName,
                        correct = correct,
                        total = total,
                        completedAtMillis = completedAtMillis,
                    ),
                )
                val submissionId = UUID.nameUUIDFromBytes(
                    "$safeUserKey|$testCatalogId|$testName|$completedAtMillis|$correct|$total"
                        .toByteArray(Charsets.UTF_8),
                ).toString()
                try {
                    AuthRepository.postAttemptRemote(
                        testName = testName,
                        correct = correct,
                        total = total,
                        completedAtMillis = completedAtMillis,
                        testCatalogId = testCatalogId,
                        clientSubmissionId = submissionId,
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Server sync failed or skipped", e)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save test attempt", e)
            }
        }
    }

    suspend fun clearAll() {
        val d = dao ?: return
        withContext(Dispatchers.IO) {
            runCatching { d.deleteAll() }.onFailure { e ->
                Log.e(TAG, "Failed to clear test history", e)
            }
        }
    }

    suspend fun clearAll(userKey: String) {
        val d = dao ?: return
        val keys = resolveLookupKeys(userKey)
        if (keys.isEmpty()) return
        withContext(Dispatchers.IO) {
            runCatching { d.deleteAllByUserKeys(keys) }.onFailure { e ->
                Log.e(TAG, "Failed to clear user test history", e)
            }
        }
    }

    suspend fun countAttempts(userKey: String, testName: String): Int {
        val d = dao ?: return 0
        val keys = resolveLookupKeys(userKey)
        val safeName = testName.trim()
        if (keys.isEmpty() || safeName.isBlank()) return 0
        return withContext(Dispatchers.IO) {
            runCatching { d.countByUserAndTest(keys, safeName) }.getOrDefault(0)
        }
    }

    suspend fun countAttemptsSince(userKey: String, testName: String, cycleStartedAtMillis: Long): Int {
        val d = dao ?: return 0
        val keys = resolveLookupKeys(userKey)
        val safeName = testName.trim()
        if (keys.isEmpty() || safeName.isBlank() || cycleStartedAtMillis <= 0L) return 0
        return withContext(Dispatchers.IO) {
            runCatching { d.countByUserAndTestSince(keys, safeName, cycleStartedAtMillis) }.getOrDefault(0)
        }
    }

    suspend fun lastAttemptAtMillis(userKey: String, testName: String): Long? {
        val d = dao ?: return null
        val keys = resolveLookupKeys(userKey)
        val safeName = testName.trim()
        if (keys.isEmpty() || safeName.isBlank()) return null
        return withContext(Dispatchers.IO) {
            runCatching { d.lastCompletedAtMillis(keys, safeName) }.getOrNull()
        }
    }

    suspend fun lastAttemptAtMillisSince(userKey: String, testName: String, cycleStartedAtMillis: Long): Long? {
        val d = dao ?: return null
        val keys = resolveLookupKeys(userKey)
        val safeName = testName.trim()
        if (keys.isEmpty() || safeName.isBlank() || cycleStartedAtMillis <= 0L) return null
        return withContext(Dispatchers.IO) {
            runCatching { d.lastCompletedAtMillisSince(keys, safeName, cycleStartedAtMillis) }.getOrNull()
        }
    }

    suspend fun countAttemptsForCycle(
        userKey: String,
        testName: String,
        cycleStartedAtMillis: Long?,
    ): Int = if (cycleStartedAtMillis != null && cycleStartedAtMillis > 0L) {
        countAttemptsSince(userKey, testName, cycleStartedAtMillis)
    } else {
        countAttempts(userKey, testName)
    }

    suspend fun lastAttemptAtMillisForCycle(
        userKey: String,
        testName: String,
        cycleStartedAtMillis: Long?,
    ): Long? = if (cycleStartedAtMillis != null && cycleStartedAtMillis > 0L) {
        lastAttemptAtMillisSince(userKey, testName, cycleStartedAtMillis)
    } else {
        lastAttemptAtMillis(userKey, testName)
    }
}
