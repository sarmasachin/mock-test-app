package com.freemocktest.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TestAttemptDao {

    @Insert
    suspend fun insert(entity: TestAttemptEntity): Long

    @Query("SELECT * FROM test_attempts WHERE user_key IN (:userKeys) ORDER BY completed_at_millis DESC")
    fun observeAllByUserKeys(userKeys: List<String>): Flow<List<TestAttemptEntity>>

    @Query("SELECT * FROM test_attempts ORDER BY completed_at_millis DESC")
    suspend fun listAll(): List<TestAttemptEntity>

    @Query("UPDATE test_attempts SET user_key = :newKey WHERE id = :id")
    suspend fun updateUserKey(id: Long, newKey: String)

    @Query("DELETE FROM test_attempts WHERE user_key IN (:userKeys)")
    suspend fun deleteAllByUserKeys(userKeys: List<String>)

    @Query("DELETE FROM test_attempts")
    suspend fun deleteAll()

    @Query(
        """
        SELECT COUNT(*) FROM test_attempts
        WHERE user_key IN (:userKeys) AND LOWER(test_name) = LOWER(:testName)
        """,
    )
    suspend fun countByUserAndTest(userKeys: List<String>, testName: String): Int

    @Query(
        """
        SELECT COUNT(*) FROM test_attempts
        WHERE user_key IN (:userKeys)
          AND LOWER(test_name) = LOWER(:testName)
          AND completed_at_millis >= :sinceMillis
        """,
    )
    suspend fun countByUserAndTestSince(userKeys: List<String>, testName: String, sinceMillis: Long): Int

    @Query(
        """
        SELECT MAX(completed_at_millis) FROM test_attempts
        WHERE user_key IN (:userKeys) AND LOWER(test_name) = LOWER(:testName)
        """,
    )
    suspend fun lastCompletedAtMillis(userKeys: List<String>, testName: String): Long?

    @Query(
        """
        SELECT MAX(completed_at_millis) FROM test_attempts
        WHERE user_key IN (:userKeys)
          AND LOWER(test_name) = LOWER(:testName)
          AND completed_at_millis >= :sinceMillis
        """,
    )
    suspend fun lastCompletedAtMillisSince(userKeys: List<String>, testName: String, sinceMillis: Long): Long?
}
