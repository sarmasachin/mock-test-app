package com.freemocktest.app.data.remote

import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApiService {

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/google")
    suspend fun loginWithGoogle(@Body body: GoogleSignInRequest): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): RefreshResponse

    @POST("auth/password-reset/request")
    suspend fun passwordResetRequest(@Body body: PasswordResetRequestBody): PasswordResetRequestResponse

    @POST("auth/password-reset/complete")
    suspend fun passwordResetComplete(@Body body: PasswordResetCompleteBody): SimpleOkResponse
}
