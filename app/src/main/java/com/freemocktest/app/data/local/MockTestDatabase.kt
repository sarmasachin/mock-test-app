package com.freemocktest.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [TestAttemptEntity::class],
    version = 3,
    exportSchema = false,
)
abstract class MockTestDatabase : RoomDatabase() {
    abstract fun testAttemptDao(): TestAttemptDao

    companion object {
        private const val NAME = "mocktest.db"

        @Volatile
        private var instance: MockTestDatabase? = null

        fun getInstance(context: Context): MockTestDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    MockTestDatabase::class.java,
                    NAME,
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
    }
}
