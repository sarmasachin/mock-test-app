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
                try {
                    AuthRepository.postAttemptRemote(
                        testName = testName,
                        correct = correct,
                        total = total,
                        completedAtMillis = completedAtMillis,
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
}
