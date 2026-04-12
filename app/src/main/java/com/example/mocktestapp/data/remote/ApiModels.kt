package com.example.mocktestapp.data.remote

import com.google.gson.annotations.SerializedName

data class AuthUserDto(
    val id: String,
    val email: String,
    @SerializedName("displayName") val displayName: String,
    val phone: String,
    @SerializedName("sixDigitPublicId") val sixDigitPublicId: Int,
    @SerializedName("signupState") val signupState: String? = null,
    @SerializedName("signupDistrict") val signupDistrict: String? = null,
)

data class LoginRequest(
    val identifier: String,
    val password: String,
)

data class GoogleSignInRequest(
    @SerializedName("idToken") val idToken: String,
)

data class RegisterRequest(
    val displayName: String,
    val email: String,
    val phone: String,
    val password: String,
    val state: String?,
    val district: String?,
)

data class AuthResponse(
    val user: AuthUserDto,
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("expiresInSeconds") val expiresInSeconds: Long = 0,
)

data class RefreshRequest(
    @SerializedName("refreshToken") val refreshToken: String,
)

data class RefreshResponse(
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("expiresInSeconds") val expiresInSeconds: Long = 0,
)

data class PasswordResetRequestBody(
    val email: String,
)

data class PasswordResetCompleteBody(
    val email: String,
    val otp: String,
    @SerializedName("newPassword") val newPassword: String,
)

data class PasswordResetRequestResponse(
    val ok: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

data class MeResponse(
    val user: AuthUserDto,
)

data class PatchProfileRequest(
    val displayName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val state: String? = null,
    val district: String? = null,
)

data class PatchPasswordRequest(
    @SerializedName("currentPassword") val currentPassword: String,
    @SerializedName("newPassword") val newPassword: String,
)

data class SimpleOkResponse(
    val ok: Boolean = false,
)

data class AttemptRequest(
    @SerializedName("testName") val testName: String,
    val correct: Int,
    val total: Int,
    @SerializedName("completedAtMillis") val completedAtMillis: Long? = null,
    @SerializedName("testCatalogId") val testCatalogId: String? = null,
)

data class AttemptResponse(
    val id: String,
    @SerializedName("testName") val testName: String,
    val correct: Int,
    val total: Int,
)

data class NewsArticleDto(
    val id: String,
    @SerializedName("feedKind") val feedKind: String? = null,
    @SerializedName("externalId") val externalId: String? = null,
    val headline: String,
    val summary: String,
    val category: String,
    val body: String? = null,
    @SerializedName("linkUrl") val linkUrl: String? = null,
    @SerializedName("publishedAt") val publishedAt: String? = null,
)

data class NewsListResponse(
    val items: List<NewsArticleDto>,
)

data class NewsArticleResponse(
    val article: NewsArticleDto,
)

data class CatalogTestDto(
    val id: String,
    val slug: String,
    val title: String,
    val subcategory: String,
    @SerializedName("metaLine") val metaLine: String,
    @SerializedName("durationMinutes") val durationMinutes: Int,
    @SerializedName("questionCount") val questionCount: Int,
    @SerializedName("testKind") val testKind: String,
)

data class TestsListResponse(
    val items: List<CatalogTestDto>,
)
