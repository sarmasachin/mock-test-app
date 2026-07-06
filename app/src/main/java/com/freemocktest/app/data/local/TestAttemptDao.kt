package com.freemocktest.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TestAttemptDao {

    @Insert
    suspend fun insert(entity: TestAttemptEntity): Long

    @Query("SELECT * FROM test_attempts WHERE user_key = :userKey ORDER BY completed_at_millis DESC")
    fun observeAllByUser(userKey: String): Flow<List<TestAttemptEntity>>

    @Query("DELETE FROM test_attempts WHERE user_key = :userKey")
    suspend fun deleteAllByUser(userKey: String)

    @Query("DELETE FROM test_attempts")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM test_attempts WHERE user_key = :userKey AND LOWER(test_name) = LOWER(:testName)")
    suspend fun countByUserAndTest(userKey: String, testName: String): Int

    @Query(
        """
        SELECT COUNT(*) FROM test_attempts
        WHERE user_key = :userKey
          AND LOWER(test_name) = LOWER(:testName)
          AND completed_at_millis >= :sinceMillis
        """,
    )
    suspend fun countByUserAndTestSince(userKey: String, testName: String, sinceMillis: Long): Int

    @Query("SELECT MAX(completed_at_millis) FROM test_attempts WHERE user_key = :userKey AND LOWER(test_name) = LOWER(:testName)")
    suspend fun lastCompletedAtMillis(userKey: String, testName: String): Long?

    @Query(
        """
        SELECT MAX(completed_at_millis) FROM test_attempts
        WHERE user_key = :userKey
          AND LOWER(test_name) = LOWER(:testName)
          AND completed_at_millis >= :sinceMillis
        """,
    )
    suspend fun lastCompletedAtMillisSince(userKey: String, testName: String, sinceMillis: Long): Long?
}
