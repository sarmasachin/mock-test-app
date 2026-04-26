package com.example.mocktestapp.data.remote

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface PublicApiService {

    @GET("news")
    suspend fun listNews(
        @Query("feedKind") feedKind: String,
        @Query("limit") limit: Int = 40,
        @Query("offset") offset: Int = 0,
    ): NewsListResponse

    @GET("news/{id}")
    suspend fun getNewsArticle(@Path("id") id: String): NewsArticleResponse

    @GET("tests")
    suspend fun listTests(
        @Query("subcategory") subcategory: String? = null,
        @Query("limit") limit: Int = 40,
    ): TestsListResponse

    @GET("tests/{testId}/questions")
    suspend fun getTestQuestions(
        @Path("testId") testId: String,
    ): TestQuestionsResponse

    @GET("digest/today")
    suspend fun getDailyDigestToday(): DailyDigestTodayResponse

    @GET("digest/quiz-today")
    suspend fun getDailyQuizToday(): DailyQuizTodayResponse

    @GET("home/content")
    suspend fun getHomeContent(): HomeContentResponse

    @GET("leaderboard")
    suspend fun getLeaderboard(
        @Query("range") range: String,
        @Query("city") city: String? = null,
        @Query("state") state: String? = null,
        @Query("testCatalogId") testCatalogId: String? = null,
        @Query("limit") limit: Int = 100,
    ): LeaderboardResponse

    @GET("leaderboard/tests")
    suspend fun getLeaderboardTests(
        @Query("range") range: String = "all",
        @Query("city") city: String? = null,
        @Query("state") state: String? = null,
        @Query("limit") limit: Int = 100,
    ): LeaderboardTestsResponse

    @GET("leaderboard/test/{testId}")
    suspend fun getLeaderboardByTest(
        @Path("testId") testId: String,
        @Query("range") range: String,
        @Query("city") city: String? = null,
        @Query("state") state: String? = null,
        @Query("limit") limit: Int = 100,
    ): LeaderboardByTestResponse

    @GET("leaderboard/filters")
    suspend fun getLeaderboardFilters(): LeaderboardFiltersResponse
}
