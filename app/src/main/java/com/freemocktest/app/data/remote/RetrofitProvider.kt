package com.freemocktest.app.data.remote

import android.content.Context
import com.freemocktest.app.BuildConfig
import com.freemocktest.app.data.AuthRepository
import com.google.gson.Gson
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking

object RetrofitProvider {

    lateinit var authApi: AuthApiService
        private set

    lateinit var appApi: AppApiService
        private set

    /** No JWT — public feed + catalog. */
    lateinit var publicApi: PublicApiService
        private set

    private val gson: Gson = Gson()

    fun init(@Suppress("UNUSED_PARAMETER") context: Context) {
        val baseUrl = BuildConfig.API_BASE_URL
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }

        val authClient = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .build()

        val authRetrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(authClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
        authApi = authRetrofit.create(AuthApiService::class.java)
        publicApi = authRetrofit.create(PublicApiService::class.java)

        val appClient = OkHttpClient.Builder()
            .addInterceptor(AuthBearerInterceptor)
            .authenticator(TokenAuthenticator)
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .build()

        val appRetrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(appClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
        appApi = appRetrofit.create(AppApiService::class.java)
    }

    private object AuthBearerInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
            val token = AuthRepository.peekAccessToken()
            val req = if (!token.isNullOrBlank()) {
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } else {
                chain.request()
            }
            return chain.proceed(req)
        }
    }

    private object TokenAuthenticator : Authenticator {
        override fun authenticate(route: Route?, response: Response): okhttp3.Request? {
            if (response.request.url.encodedPath.contains("auth/refresh")) {
                return null
            }
            if (authRetryCount(response) >= 2) {
                return null
            }
            val newAccess = runBlocking {
                AuthRepository.silentRefreshAccessToken()
            } ?: return null
            return response.request.newBuilder()
                .header("Authorization", "Bearer $newAccess")
                .build()
        }
    }

    private fun authRetryCount(response: Response): Int {
        var c = 1
        var p = response.priorResponse
        while (p != null) {
            c++
            p = p.priorResponse
        }
        return c
    }
}
