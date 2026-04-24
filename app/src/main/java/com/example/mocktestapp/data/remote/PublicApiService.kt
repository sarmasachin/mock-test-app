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

    @GET("digest/today")
    suspend fun getDailyDigestToday(): DailyDigestTodayResponse

    @GET("home/content")
    suspend fun getHomeContent(): HomeContentResponse
}
