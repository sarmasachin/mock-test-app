package com.freemocktest.app.data



import android.util.Log

import com.freemocktest.app.data.remote.DailyQuizAttemptDto

import com.freemocktest.app.data.remote.DailyQuizAttemptSubmitRequest

import com.freemocktest.app.data.remote.DailyQuizBatchAnswerDto

import com.freemocktest.app.data.remote.DailyQuizBatchSubmitRequest

import com.freemocktest.app.data.remote.DailyQuizDaySummaryDto

import com.freemocktest.app.data.remote.RetrofitProvider

import com.google.gson.JsonParser

import kotlinx.coroutines.Dispatchers

import kotlinx.coroutines.withContext

import retrofit2.HttpException

import java.time.LocalDate

import java.util.UUID



/**

 * Server sync for Daily Quiz only. Does not use mock-test [com.freemocktest.app.data.remote.AttemptRequest].

 */

object DailyQuizRepository {

    private const val TAG = "DailyQuizRepo"



    sealed class ServerResult {

        data class Success(val snapshot: AppPreferencesRepository.DailyQuizDayResult) : ServerResult()

        data class Failure(val message: String, val httpCode: Int? = null) : ServerResult()

    }



    data class SyncedHistory(

        val attemptedDates: Set<LocalDate>,

        val attemptsByDay: Map<LocalDate, AppPreferencesRepository.DailyQuizDayResult>,

    )



    data class LeaderboardEntry(

        val rank: Int,

        val displayName: String,

        val publicId: String?,

        val correctCount: Int,

        val totalQuestions: Int,

        val isCorrect: Boolean,

        val timeTakenSeconds: Long,

        val isCurrentUser: Boolean,

    )



    data class Leaderboard(

        val quizDay: LocalDate,

        val totalPlayers: Int,

        val currentUserRank: Int?,

        val entries: List<LeaderboardEntry>,

    )



    fun isLoggedIn(): Boolean = !AuthRepository.peekAccessToken().isNullOrBlank()

    /**
     * Logged-in users only: server attempt for [day] is source of truth (404 ⇒ not attempted).
     * Rank uses the same delivery [scope] as submit and leaderboard.
     */
    suspend fun loadDayResultForCurrentUser(
        day: LocalDate,
        scope: DailyQuizScopeSelection = DailyQuizScopeSelection.AllIndia,
    ): AppPreferencesRepository.DailyQuizDayResult? =
        withContext(Dispatchers.IO) {
            if (!isLoggedIn()) return@withContext null
            val local = AppPreferencesRepository.loadDailyQuizDayResult(day)
            val server = loadDayFromServer(day, scope)
            server ?: local
        }

    suspend fun syncHistoryFromServer(): SyncedHistory? = withContext(Dispatchers.IO) {

        if (!isLoggedIn()) return@withContext null

        try {

            val res = RetrofitProvider.appApi.getDailyQuizHistory()

            val attemptsByDay = linkedMapOf<LocalDate, AppPreferencesRepository.DailyQuizDayResult>()

            val dates = mutableSetOf<LocalDate>()

            res.attempts

                .groupBy { dto -> runCatching { LocalDate.parse(dto.quizDay) }.getOrNull() }

                .forEach { (day, dtos) ->

                    if (day == null) return@forEach

                    val session = dtos.toLocalSession(day) ?: return@forEach

                    val prior = AppPreferencesRepository.loadDailyQuizDayResult(day)

                    val merged = if (prior != null) {

                        session.copy(

                            rank = prior.rank,

                            rankTotal = prior.rankTotal,

                            scopeKey = prior.scopeKey,

                        )

                    } else {

                        session

                    }

                    dates.add(day)

                    attemptsByDay[day] = merged

                }

            AppPreferencesRepository.replaceDailyQuizResultsForCurrentUser(attemptsByDay)

            SyncedHistory(attemptedDates = dates, attemptsByDay = attemptsByDay)

        } catch (e: HttpException) {

            if (e.code() == 404) {

                AppPreferencesRepository.replaceDailyQuizResultsForCurrentUser(emptyMap())

                SyncedHistory(emptySet(), emptyMap())

            } else if (e.code() == 401) {

                Log.w(TAG, "syncHistoryFromServer http 401: session expired", e)

                runCatching { AuthRepository.clearSession() }

                null

            } else {

                Log.w(TAG, "syncHistoryFromServer http ${e.code()}: ${parseHttpError(e)}", e)

                null

            }

        } catch (e: Exception) {

            Log.w(TAG, "syncHistoryFromServer", e)

            null

        }

    }



    suspend fun loadDayFromServer(
        day: LocalDate,
        scope: DailyQuizScopeSelection = DailyQuizScopeSelection.AllIndia,
    ): AppPreferencesRepository.DailyQuizDayResult? =

        withContext(Dispatchers.IO) {

            if (!isLoggedIn()) return@withContext null

            try {

                val scopeMode = if (scope.isState) DailyQuizScopeSelection.MODE_STATE else DailyQuizScopeSelection.MODE_ALL_INDIA
                val scopeState = scope.stateName.trim().takeIf { scope.isState && it.isNotBlank() }
                val res = RetrofitProvider.appApi.getDailyQuizAttempt(
                    quizDay = day.toString(),
                    scope = scopeMode,
                    state = scopeState,
                )

                val mapped = res.toLocalSession(fallbackScopeKey = scope.cacheKey()) ?: return@withContext null

                AppPreferencesRepository.saveDailyQuizDayResult(mapped)

                mapped

            } catch (e: HttpException) {

                if (e.code() == 404) {

                    AppPreferencesRepository.clearDailyQuizDayResult(day)

                    null

                } else if (e.code() == 401) {

                    Log.w(TAG, "loadDayFromServer http 401: session expired", e)

                    runCatching { AuthRepository.clearSession() }

                    null

                } else {

                    Log.w(TAG, "loadDayFromServer http ${e.code()}: ${parseHttpError(e)}", e)

                    AppPreferencesRepository.loadDailyQuizDayResult(day)

                }

            } catch (e: Exception) {

                Log.w(TAG, "loadDayFromServer", e)

                AppPreferencesRepository.loadDailyQuizDayResult(day)

            }

        }



    suspend fun loadLeaderboard(
        day: LocalDate,
        limit: Int = 50,
        scope: DailyQuizScopeSelection? = null,
    ): Leaderboard? = withContext(Dispatchers.IO) {

        if (!isLoggedIn()) return@withContext null

        try {

            val scopeMode = scope?.mode
            val scopeState = scope?.stateName?.takeIf { it.isNotBlank() }
            val res = RetrofitProvider.appApi.getDailyQuizLeaderboard(
                quizDay = day.toString(),
                limit = limit,
                scope = scopeMode,
                state = if (scope?.isState == true) scopeState else null,
            )

            val quizDay = runCatching { LocalDate.parse(res.quizDay) }.getOrElse { day }

            Leaderboard(

                quizDay = quizDay,

                totalPlayers = res.totalPlayers,

                currentUserRank = res.currentUserRank,

                entries = res.entries.map { e ->

                    LeaderboardEntry(

                        rank = e.rank,

                        displayName = e.displayName,

                        publicId = e.publicId,

                        correctCount = e.correctCount,

                        totalQuestions = e.totalQuestions,

                        isCorrect = e.isCorrect,

                        timeTakenSeconds = e.timeTakenSeconds,

                        isCurrentUser = e.isCurrentUser,

                    )

                },

            )

        } catch (e: HttpException) {

            Log.w(TAG, "loadLeaderboard http ${e.code()}: ${parseHttpError(e)}", e)

            null

        } catch (e: Exception) {

            Log.w(TAG, "loadLeaderboard", e)

            null

        }

    }



    /** Submit one answered question (upsert). Returns full day snapshot with rank when available. */

    suspend fun submitToServer(

        snapshot: AppPreferencesRepository.DailyQuizDayResult,

        itemId: String,

        scope: DailyQuizScopeSelection? = null,

    ): ServerResult = withContext(Dispatchers.IO) {

        if (!isLoggedIn()) {

            return@withContext ServerResult.Failure("Login to save your Daily Quiz on the server.")

        }

        val q = snapshot.questions.find { it.itemId == itemId.trim() }

            ?: return@withContext ServerResult.Failure("Question not found in this attempt.")

        val selected = q.selectedOptionIndex

            ?: return@withContext ServerResult.Failure("Select an option before submitting.")

        try {

            val body = DailyQuizAttemptSubmitRequest(

                quizDay = snapshot.day.toString(),

                itemId = q.itemId,

                selectedOptionIndex = selected,

                correctIndex = q.correctIndex,

                timeTakenSeconds = q.timeTakenSeconds,

                questionPrompt = q.questionPrompt,

                options = q.options,

                explanation = q.explanation,

                clientSubmissionId = UUID.randomUUID().toString(),

                scope = scope?.mode,

                state = scope?.stateName?.takeIf { scope.isState && it.isNotBlank() },

            )

            val res = RetrofitProvider.appApi.submitDailyQuizAttempt(body)

            val attempts = when {

                !res.attempts.isNullOrEmpty() -> res.attempts!!

                res.attempt != null -> listOf(res.attempt!!)

                else -> emptyList()

            }

            val summary = res.summary

            val resolvedScopeKey = res.scopeKey?.takeIf { it.isNotBlank() } ?: scope?.cacheKey()

            val mapped = if (attempts.isNotEmpty() && summary != null) {

                summary.toLocalSession(snapshot.day, attempts, snapshot.savedAtMillis, resolvedScopeKey)

            } else {

                null

            }

            if (mapped != null) {

                AppPreferencesRepository.saveDailyQuizDayResult(mapped)

                ServerResult.Success(mapped)

            } else {

                ServerResult.Failure("Server returned an incomplete Daily Quiz response.")

            }

        } catch (e: HttpException) {

            Log.w(TAG, "submitToServer http ${e.code()}", e)

            ServerResult.Failure(parseHttpError(e), e.code())

        } catch (e: Exception) {

            Log.w(TAG, "submitToServer", e)

            ServerResult.Failure("Could not save Daily Quiz. Check internet and try again.")

        }

    }



    /** Submit all answered questions for the calendar day (preferred after last question). */

    suspend fun submitBatchToServer(

        snapshot: AppPreferencesRepository.DailyQuizDayResult,

        scope: DailyQuizScopeSelection? = null,

    ): ServerResult = withContext(Dispatchers.IO) {

        if (!isLoggedIn()) {

            return@withContext ServerResult.Failure("Login to save your Daily Quiz on the server.")

        }

        val answers = snapshot.questions.mapNotNull { q ->

            val selected = q.selectedOptionIndex ?: return@mapNotNull null

            DailyQuizBatchAnswerDto(

                itemId = q.itemId,

                selectedOptionIndex = selected,

                correctIndex = q.correctIndex,

                timeTakenSeconds = q.timeTakenSeconds,

                questionPrompt = q.questionPrompt,

                options = q.options,

                explanation = q.explanation,

            )

        }

        if (answers.isEmpty()) {

            return@withContext ServerResult.Failure("No answered questions to submit.")

        }

        if (answers.size < snapshot.questions.size) {

            return@withContext ServerResult.Failure("Answer all questions before submitting.")

        }

        try {

            val body = DailyQuizBatchSubmitRequest(

                quizDay = snapshot.day.toString(),

                answers = answers,

                clientSubmissionId = UUID.randomUUID().toString(),

                scope = scope?.mode,

                state = scope?.stateName?.takeIf { scope.isState && it.isNotBlank() },

            )

            val res = RetrofitProvider.appApi.submitDailyQuizBatch(body)

            val resolvedScopeKey = res.scopeKey?.takeIf { it.isNotBlank() } ?: scope?.cacheKey()

            val mapped = res.toLocalSession(snapshot.day, snapshot.savedAtMillis, resolvedScopeKey)

                ?: return@withContext ServerResult.Failure("Server returned an incomplete Daily Quiz response.")

            AppPreferencesRepository.saveDailyQuizDayResult(mapped)

            ServerResult.Success(mapped)

        } catch (e: HttpException) {

            Log.w(TAG, "submitBatchToServer http ${e.code()}", e)

            ServerResult.Failure(parseHttpError(e), e.code())

        } catch (e: Exception) {

            Log.w(TAG, "submitBatchToServer", e)

            ServerResult.Failure("Could not save Daily Quiz. Check internet and try again.")

        }

    }



    private fun parseHttpError(e: HttpException): String {

        val raw = e.response()?.errorBody()?.use { it.string() }.orEmpty()

        return parseErrorJsonString(raw).ifBlank {

            when (e.code()) {

                401 -> "Session expired. Please login again."

                403 -> "You do not have permission for this action."

                404 -> "Daily Quiz not found on server."

                in 500..599 -> "Server error. Please try again later."

                else -> e.message ?: "Request failed (${e.code()})"

            }

        }

    }



    private fun parseErrorJsonString(raw: String): String {

        if (raw.isBlank()) return ""

        if (raw.contains("<html", ignoreCase = true) || raw.contains("<!doctype", ignoreCase = true)) {

            return "Server is temporarily unavailable"

        }

        return try {

            JsonParser.parseString(raw).asJsonObject.get("error")?.asString ?: raw

        } catch (_: Exception) {

            raw

        }

    }



    private fun List<DailyQuizAttemptDto>.toLocalSession(

        day: LocalDate,

    ): AppPreferencesRepository.DailyQuizDayResult? {

        if (isEmpty()) return null

        val questions = mapNotNull { it.toQuestionResult() }

        if (questions.isEmpty()) return null

        return AppPreferencesRepository.DailyQuizDayResult(

            day = day,

            questions = questions,

            totalTimeTakenSeconds = sumOf { it.timeTakenSeconds },

            savedAtMillis = System.currentTimeMillis(),

        )

    }



    private fun com.freemocktest.app.data.remote.DailyQuizDayAttemptResponse.toLocalSession(
        fallbackScopeKey: String? = null,
        savedAtMillis: Long = System.currentTimeMillis(),
    ): AppPreferencesRepository.DailyQuizDayResult? {

        val day = runCatching { LocalDate.parse(quizDay) }.getOrNull() ?: return null

        val resolvedScopeKey = scopeKey?.takeIf { it.isNotBlank() } ?: fallbackScopeKey

        return summary.toLocalSession(day, attempts, savedAtMillis, resolvedScopeKey)

    }



    private fun com.freemocktest.app.data.remote.DailyQuizBatchSubmitResponse.toLocalSession(

        day: LocalDate,

        savedAtMillis: Long,

        fallbackScopeKey: String? = null,

    ): AppPreferencesRepository.DailyQuizDayResult? {

        val resolvedScopeKey = scopeKey?.takeIf { it.isNotBlank() } ?: fallbackScopeKey

        return summary.toLocalSession(day, attempts, savedAtMillis, resolvedScopeKey)

    }



    private fun DailyQuizDaySummaryDto.toLocalSession(

        day: LocalDate,

        attempts: List<DailyQuizAttemptDto>,

        savedAtMillis: Long,

        scopeKey: String? = null,

    ): AppPreferencesRepository.DailyQuizDayResult? {

        val questions = attempts.mapNotNull { it.toQuestionResult() }

        if (questions.isEmpty()) return null

        return AppPreferencesRepository.DailyQuizDayResult(

            day = day,

            questions = questions,

            totalTimeTakenSeconds = timeTakenSeconds,

            savedAtMillis = savedAtMillis,

            rank = rank,

            rankTotal = rankTotal,

            scopeKey = scopeKey,

        )

    }



    private fun DailyQuizAttemptDto.toQuestionResult(): AppPreferencesRepository.DailyQuizQuestionResult? {

        if (itemId.isBlank()) return null

        return AppPreferencesRepository.DailyQuizQuestionResult(

            itemId = itemId,

            selectedOptionIndex = selectedOptionIndex,

            correctIndex = correctIndex,

            isCorrect = isCorrect,

            questionPrompt = questionPrompt,

            options = options,

            explanation = explanation.orEmpty(),

            timeTakenSeconds = timeTakenSeconds,

        )

    }

}


