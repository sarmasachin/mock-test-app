package com.freemocktest.app.data

import android.util.Log
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.local.MockTestDatabase
import com.freemocktest.app.data.local.TestAttemptDao
import com.freemocktest.app.data.local.TestAttemptEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * Persists completed test rows (Room). Initialized from [MockTestApp].
 */
object TestHistoryRepository {
    private const val TAG = "TestHistoryRepo"

    @Volatile
    private var dao: TestAttemptDao? = null

    fun init(database: MockTestDatabase) {
        dao = database.testAttemptDao()
    }

    fun observeAttempts(userKey: String): Flow<List<TestAttemptEntity>> {
        val safeUserKey = userKey.trim().ifBlank { "guest" }
        return dao?.observeAllByUser(safeUserKey) ?: flowOf(emptyList())
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
        val safeUserKey = userKey.trim().ifBlank { "guest" }
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
        val safeUserKey = userKey.trim().ifBlank { "guest" }
        withContext(Dispatchers.IO) {
            runCatching { d.deleteAllByUser(safeUserKey) }.onFailure { e ->
                Log.e(TAG, "Failed to clear user test history", e)
            }
        }
    }

    suspend fun countAttempts(userKey: String, testName: String): Int {
        val d = dao ?: return 0
        val safeUserKey = userKey.trim().ifBlank { "guest" }
        val safeName = testName.trim()
        if (safeName.isBlank()) return 0
        return withContext(Dispatchers.IO) {
            runCatching { d.countByUserAndTest(safeUserKey, safeName) }.getOrDefault(0)
        }
    }

    suspend fun countAttemptsSince(userKey: String, testName: String, cycleStartedAtMillis: Long): Int {
        val d = dao ?: return 0
        val safeUserKey = userKey.trim().ifBlank { "guest" }
        val safeName = testName.trim()
        if (safeName.isBlank() || cycleStartedAtMillis <= 0L) return 0
        return withContext(Dispatchers.IO) {
            runCatching { d.countByUserAndTestSince(safeUserKey, safeName, cycleStartedAtMillis) }.getOrDefault(0)
        }
    }

    suspend fun lastAttemptAtMillis(userKey: String, testName: String): Long? {
        val d = dao ?: return null
        val safeUserKey = userKey.trim().ifBlank { "guest" }
        val safeName = testName.trim()
        if (safeName.isBlank()) return null
        return withContext(Dispatchers.IO) {
            runCatching { d.lastCompletedAtMillis(safeUserKey, safeName) }.getOrNull()
        }
    }

    suspend fun lastAttemptAtMillisSince(userKey: String, testName: String, cycleStartedAtMillis: Long): Long? {
        val d = dao ?: return null
        val safeUserKey = userKey.trim().ifBlank { "guest" }
        val safeName = testName.trim()
        if (safeName.isBlank() || cycleStartedAtMillis <= 0L) return null
        return withContext(Dispatchers.IO) {
            runCatching { d.lastCompletedAtMillisSince(safeUserKey, safeName, cycleStartedAtMillis) }.getOrNull()
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
