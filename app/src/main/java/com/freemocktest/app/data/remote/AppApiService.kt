package com.freemocktest.app.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface AppApiService {

    @GET("me")
    suspend fun me(): MeResponse

    @GET("me/interests")
    suspend fun getUserInterests(): UserInterestsResponse

    @PUT("me/interests")
    suspend fun putUserInterests(@Body body: PutUserInterestsRequest): UserInterestsResponse

    @PATCH("me/profile")
    suspend fun patchProfile(@Body body: PatchProfileRequest): MeResponse

    @PATCH("me/password")
    suspend fun patchPassword(@Body body: PatchPasswordRequest): SimpleOkResponse

    @POST("me/email-verification/request")
    suspend fun requestEmailVerificationOtp(): SimpleOkResponse

    @POST("me/email-verification/confirm")
    suspend fun confirmEmailVerification(@Body body: EmailVerificationConfirmBody): SimpleOkResponse

    @POST("me/support")
    suspend fun submitSupport(@Body body: TextMessageBody): SimpleOkResponse

    @POST("me/feedback")
    suspend fun submitFeedback(@Body body: TextMessageBody): SimpleOkResponse

    @POST("me/report-issue")
    suspend fun submitReportIssue(@Body body: TextMessageBody): SimpleOkResponse

    @DELETE("me")
    suspend fun deleteMe(): Response<Unit>

    @POST("attempts")
    suspend fun postAttempt(@Body body: AttemptRequest): AttemptResponse

    @POST("tests/{testId}/apply")
    suspend fun applyForTest(@Path("testId") testId: String): ApplyTestResponse

    @GET("tests/my-applications")
    suspend fun getMyTestApplications(): MyTestApplicationsResponse

    /** Phase 2 resolve — works when test is unpublished / between cycles (auth required). */
    @GET("tests/resolve")
    suspend fun resolveTest(
        @Query("title") title: String? = null,
        @Query("slug") slug: String? = null,
        @Query("testId") testId: String? = null,
    ): TestResolveResponse

    @GET("tests/{testId}/questions-attempt")
    suspend fun getAttemptQuestions(
        @Path("testId") testId: String,
    ): TestQuestionsResponse

    @GET("tests/{testId}/waitlist-status")
    suspend fun getTestWaitlistStatus(@Path("testId") testId: String): TestWaitlistStatusResponse

    @POST("polls/{pollId}/vote")
    suspend fun postPollVote(
        @Path("pollId") pollId: String,
        @Body body: PollVoteRequest,
    ): PollVoteResponse

    @GET("polls/{pollId}/vote-status")
    suspend fun getPollVoteStatus(
        @Path("pollId") pollId: String,
    ): PollVoteResponse

    @POST("me/device-token")
    suspend fun upsertDeviceToken(
        @Body body: DeviceTokenUpsertRequest,
    ): SimpleOkResponse

    @POST("me/notification-open")
    suspend fun recordNotificationOpen(
        @Body body: NotificationOpenRequest,
    ): SimpleOkResponse

    /** Daily Quiz only — not mock-test /attempts. */
    @POST("daily-quiz/attempts")
    suspend fun submitDailyQuizAttempt(
        @Body body: DailyQuizAttemptSubmitRequest,
    ): DailyQuizAttemptSubmitResponse

    @POST("daily-quiz/attempts/batch")
    suspend fun submitDailyQuizBatch(
        @Body body: DailyQuizBatchSubmitRequest,
    ): DailyQuizBatchSubmitResponse

    @GET("daily-quiz/attempts")
    suspend fun getDailyQuizHistory(): DailyQuizHistoryResponse

    @GET("daily-quiz/attempts/{quizDay}")
    suspend fun getDailyQuizAttempt(
        @Path("quizDay") quizDay: String,
    ): DailyQuizDayAttemptResponse

    @GET("daily-quiz/leaderboard")
    suspend fun getDailyQuizLeaderboard(
        @Query("quizDay") quizDay: String,
        @Query("limit") limit: Int = 50,
    ): DailyQuizLeaderboardResponse

}
