package com.example.mocktestapp.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "test_attempts")
data class TestAttemptEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "test_name") val testName: String,
    @ColumnInfo(name = "correct") val correct: Int,
    @ColumnInfo(name = "total") val total: Int,
    @ColumnInfo(name = "completed_at_millis") val completedAtMillis: Long,
)
