package com.example.mocktestapp.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface AppApiService {

    @GET("me")
    suspend fun me(): MeResponse

    @PATCH("me/profile")
    suspend fun patchProfile(@Body body: PatchProfileRequest): MeResponse

    @PATCH("me/password")
    suspend fun patchPassword(@Body body: PatchPasswordRequest): SimpleOkResponse

    @DELETE("me")
    suspend fun deleteMe(): Response<Unit>

    @POST("attempts")
    suspend fun postAttempt(@Body body: AttemptRequest): AttemptResponse

    @POST("polls/{pollId}/vote")
    suspend fun postPollVote(
        @Path("pollId") pollId: String,
        @Body body: PollVoteRequest,
    ): PollVoteResponse
}
