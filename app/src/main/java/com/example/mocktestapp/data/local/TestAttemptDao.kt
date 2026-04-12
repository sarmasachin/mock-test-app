package com.example.mocktestapp.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TestAttemptDao {

    @Insert
    suspend fun insert(entity: TestAttemptEntity): Long

    @Query("SELECT * FROM test_attempts ORDER BY completed_at_millis DESC")
    fun observeAll(): Flow<List<TestAttemptEntity>>

    @Query("DELETE FROM test_attempts")
    suspend fun deleteAll()
}
