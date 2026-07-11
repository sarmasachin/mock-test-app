package com.freemocktest.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "test_attempts")
data class TestAttemptEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "user_key") val userKey: String,
    @ColumnInfo(name = "test_name") val testName: String,
    @ColumnInfo(name = "correct") val correct: Int,
    @ColumnInfo(name = "wrong", defaultValue = "0") val wrong: Int = 0,
    @ColumnInfo(name = "total") val total: Int,
    @ColumnInfo(name = "score_marks", defaultValue = "-1") val scoreMarks: Double = -1.0,
    @ColumnInfo(name = "max_marks", defaultValue = "-1") val maxMarks: Double = -1.0,
    @ColumnInfo(name = "marks_based", defaultValue = "0") val marksBased: Boolean = false,
    @ColumnInfo(name = "completed_at_millis") val completedAtMillis: Long,
)
