package com.freemocktest.app.data.remote

import com.google.gson.annotations.SerializedName

data class AuthUserDto(
    val id: String,
    val email: String,
    @SerializedName("displayName") val displayName: String,
    val phone: String,
    @SerializedName("sixDigitPublicId") val sixDigitPublicId: Int,
    @SerializedName("signupState") val signupState: String? = null,
    @SerializedName("signupDistrict") val signupDistrict: String? = null,
    /** Server: `users.gender` (Male/Female/Other). */
    @SerializedName("gender") val gender: String? = null,
    @SerializedName("emailVerifiedAt") val emailVerifiedAt: String? = null,
    @SerializedName("phoneVerifiedAt") val phoneVerifiedAt: String? = null,
    /** Server: `birthdayDate` (YYYY-MM-DD) from `users.date_of_birth`. */
    @SerializedName("birthdayDate") val birthdayDate: String? = null,
    /** Account creation time from server (`users.created_at`), ISO-8601. Used to hide pre-signup broadcast inbox rows. */
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class LoginRequest(
    val identifier: String,
    val password: String,
    /** Sent to server so new-device login alerts are accurate (same device = no repeat mail). */
    @SerializedName("deviceFingerprint") val deviceFingerprint: String? = null,
)

data class GoogleSignInRequestBody(
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

data class UserInterestsResponse(
    val subcategories: List<String> = emptyList(),
)

data class PutUserInterestsRequest(
    val subcategories: List<String>,
)

data class PatchProfileRequest(
    val displayName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val state: String? = null,
    val district: String? = null,
    /** Allowed: Male/Female/Other. Use "" to clear on server. */
    @SerializedName("gender") val gender: String? = null,
    /** Set to empty string to clear on server. Omit (null) to leave unchanged. */
    @SerializedName("birthdayDate") val birthdayDate: String? = null,
)

data class PatchPasswordRequest(
    @SerializedName("currentPassword") val currentPassword: String,
    @SerializedName("newPassword") val newPassword: String,
)

data class SimpleOkResponse(
    val ok: Boolean = false,
    val message: String? = null,
    @SerializedName("alreadyVerified") val alreadyVerified: Boolean = false,
)

data class EmailVerificationConfirmBody(
    val otp: String,
)

data class TextMessageBody(
    val message: String,
)

data class AttemptRequest(
    @SerializedName("testName") val testName: String,
    val correct: Int,
    val total: Int,
    @SerializedName("completedAtMillis") val completedAtMillis: Long? = null,
    @SerializedName("testCatalogId") val testCatalogId: String? = null,
    @SerializedName("clientSubmissionId") val clientSubmissionId: String,
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
    @SerializedName("featureImageUrl") val featureImageUrl: String? = null,
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
    @SerializedName("examDate") val examDate: String? = null,
    @SerializedName("totalMarks") val totalMarks: Int? = null,
    @SerializedName("slotLabel") val slotLabel: String? = null,
    @SerializedName("capacityTotal") val capacityTotal: Int? = null,
    @SerializedName("enrolledCount") val enrolledCount: Int? = null,
    @SerializedName("remainingSeats") val remainingSeats: Int? = null,
    @SerializedName("attemptsAllowed") val attemptsAllowed: Int? = null,
    @SerializedName("lastCycleStartedAt") val lastCycleStartedAt: String? = null,
    @SerializedName("languageMode") val languageMode: String? = null,
    @SerializedName("examMode") val examMode: String? = null,
    @SerializedName("negativeMarkingText") val negativeMarkingText: String? = null,
    @SerializedName("testTypeLabel") val testTypeLabel: String? = null,
    @SerializedName("badgeEnabled") val badgeEnabled: Boolean? = null,
    @SerializedName("badgeText") val badgeText: String? = null,
    @SerializedName("validUntil") val validUntil: String? = null,
    @SerializedName("answerKeyReleaseAt") val answerKeyReleaseAt: String? = null,
    @SerializedName("resultReleaseAt") val resultReleaseAt: String? = null,
    @SerializedName("dynamicDateEnabled") val dynamicDateEnabled: Boolean? = null,
    @SerializedName("dateCycleDays") val dateCycleDays: Int? = null,
    @SerializedName("advancedConfig") val advancedConfig: TestAdvancedConfigDto? = null,
)

data class SubjectSectionDto(
    @SerializedName("key") val key: String,
    @SerializedName("label") val label: String? = null,
)

data class TestAdvancedConfigDto(
    @SerializedName("publishAt") val publishAt: String? = null,
    @SerializedName("unpublishAt") val unpublishAt: String? = null,
    @SerializedName("resultVisibility") val resultVisibility: String? = null,
    @SerializedName("reattemptCooldownMinutes") val reattemptCooldownMinutes: Int? = null,
    @SerializedName("lateJoinMinutes") val lateJoinMinutes: Int? = null,
    @SerializedName("notifyBeforeMinutes") val notifyBeforeMinutes: Int? = null,
    @SerializedName("resumeEnabled") val resumeEnabled: Boolean? = null,
    @SerializedName("shuffleQuestions") val shuffleQuestions: Boolean? = null,
    @SerializedName("shuffleOptions") val shuffleOptions: Boolean? = null,
    @SerializedName("fullscreenRequired") val fullscreenRequired: Boolean? = null,
    @SerializedName("copyPasteBlocked") val copyPasteBlocked: Boolean? = null,
    @SerializedName("notifyOnPublish") val notifyOnPublish: Boolean? = null,
    /** Ordered sections — when set + shuffleQuestions, server shuffles within each subject only. */
    @SerializedName("subjectSections") val subjectSections: List<SubjectSectionDto>? = null,
)

data class TestsListResponse(
    val items: List<CatalogTestDto>,
)

data class TestQuestionDto(
    val id: Int,
    val position: Int,
    @SerializedName("questionPrompt") val questionPrompt: String,
    val options: List<String>,
    @SerializedName("correctIndex") val correctIndex: Int,
    val explanation: String? = null,
    /** Present when server stores subject tags (optional for older APIs). */
    @SerializedName("subjectKey") val subjectKey: String? = null,
    /** Phase 2: admin's correct option text (stable across shuffle). */
    @SerializedName("correctOptionText") val correctOptionText: String? = null,
)

data class TestQuestionsResponse(
    val items: List<TestQuestionDto> = emptyList(),
    /** Phase 2: catalog cycle id for delivery shuffle cache invalidation. */
    @SerializedName("cycleKey") val cycleKey: String? = null,
    @SerializedName("shuffleQuestions") val shuffleQuestions: Boolean? = null,
    @SerializedName("shuffleOptions") val shuffleOptions: Boolean? = null,
)

data class DailyDigestItemDto(
    val id: String,
    @SerializedName("questionPrompt") val questionPrompt: String,
    val options: List<String>,
    @SerializedName("correctIndex") val correctIndex: Int,
    @SerializedName("factText") val factText: String,
)

data class DailyDigestTodayResponse(
    val item: DailyDigestItemDto,
)

data class DailyQuizItemDto(
    val id: String,
    @SerializedName("questionPrompt") val questionPrompt: String,
    val options: List<String>,
    @SerializedName("correctIndex") val correctIndex: Int,
    val explanation: String? = null,
)

data class DailyQuizTodayResponse(
    @SerializedName("quizDay") val quizDay: String? = null,
    @SerializedName("questionCount") val questionCount: Int? = null,
    val items: List<DailyQuizItemDto> = emptyList(),
    val scope: String? = null,
    @SerializedName("stateName") val stateName: String? = null,
    @SerializedName("scopeKey") val scopeKey: String? = null,
)

data class DailyQuizAttemptSubmitRequest(
    @SerializedName("quizDay") val quizDay: String,
    @SerializedName("itemId") val itemId: String,
    @SerializedName("selectedOptionIndex") val selectedOptionIndex: Int,
    @SerializedName("correctIndex") val correctIndex: Int,
    @SerializedName("timeTakenSeconds") val timeTakenSeconds: Long,
    @SerializedName("questionPrompt") val questionPrompt: String,
    val options: List<String>,
    val explanation: String = "",
    @SerializedName("clientSubmissionId") val clientSubmissionId: String,
    val scope: String? = null,
    val state: String? = null,
)

data class DailyQuizAttemptDto(
    @SerializedName("quizDay") val quizDay: String,
    @SerializedName("itemId") val itemId: String,
    @SerializedName("selectedOptionIndex") val selectedOptionIndex: Int?,
    @SerializedName("correctIndex") val correctIndex: Int,
    @SerializedName("isCorrect") val isCorrect: Boolean,
    @SerializedName("timeTakenSeconds") val timeTakenSeconds: Long,
    @SerializedName("questionPrompt") val questionPrompt: String,
    val options: List<String>,
    val explanation: String? = null,
    @SerializedName("submittedAt") val submittedAt: String? = null,
    val rank: Int? = null,
    @SerializedName("rankTotal") val rankTotal: Int? = null,
)

data class DailyQuizDaySummaryDto(
    @SerializedName("correctCount") val correctCount: Int = 0,
    @SerializedName("wrongCount") val wrongCount: Int = 0,
    @SerializedName("skippedCount") val skippedCount: Int = 0,
    @SerializedName("totalQuestions") val totalQuestions: Int = 0,
    @SerializedName("timeTakenSeconds") val timeTakenSeconds: Long = 0L,
    val rank: Int? = null,
    @SerializedName("rankTotal") val rankTotal: Int? = null,
)

data class DailyQuizBatchAnswerDto(
    @SerializedName("itemId") val itemId: String,
    @SerializedName("selectedOptionIndex") val selectedOptionIndex: Int,
    @SerializedName("correctIndex") val correctIndex: Int,
    @SerializedName("timeTakenSeconds") val timeTakenSeconds: Long,
    @SerializedName("questionPrompt") val questionPrompt: String,
    val options: List<String>,
    val explanation: String = "",
)

data class DailyQuizBatchSubmitRequest(
    @SerializedName("quizDay") val quizDay: String,
    val answers: List<DailyQuizBatchAnswerDto>,
    @SerializedName("clientSubmissionId") val clientSubmissionId: String,
    val scope: String? = null,
    val state: String? = null,
)

data class DailyQuizBatchSubmitResponse(
    @SerializedName("quizDay") val quizDay: String,
    val attempts: List<DailyQuizAttemptDto>,
    val summary: DailyQuizDaySummaryDto,
    val scope: String? = null,
    @SerializedName("stateName") val stateName: String? = null,
    @SerializedName("scopeKey") val scopeKey: String? = null,
)

data class DailyQuizAttemptSubmitResponse(
    val attempt: DailyQuizAttemptDto? = null,
    @SerializedName("quizDay") val quizDay: String? = null,
    val attempts: List<DailyQuizAttemptDto>? = null,
    val summary: DailyQuizDaySummaryDto? = null,
    val scope: String? = null,
    @SerializedName("stateName") val stateName: String? = null,
    @SerializedName("scopeKey") val scopeKey: String? = null,
)

data class DailyQuizHistoryResponse(
    @SerializedName("attemptedDays") val attemptedDays: List<String>,
    val attempts: List<DailyQuizAttemptDto>,
)

data class DailyQuizDayAttemptResponse(
    @SerializedName("quizDay") val quizDay: String,
    val attempts: List<DailyQuizAttemptDto>,
    val summary: DailyQuizDaySummaryDto,
    val scope: String? = null,
    @SerializedName("stateName") val stateName: String? = null,
    @SerializedName("scopeKey") val scopeKey: String? = null,
)

data class DailyQuizLeaderboardEntryDto(
    val rank: Int,
    @SerializedName("displayName") val displayName: String,
    @SerializedName("publicId") val publicId: String? = null,
    @SerializedName("correctCount") val correctCount: Int = 0,
    @SerializedName("totalQuestions") val totalQuestions: Int = 0,
    @SerializedName("isCorrect") val isCorrect: Boolean,
    @SerializedName("timeTakenSeconds") val timeTakenSeconds: Long,
    @SerializedName("isCurrentUser") val isCurrentUser: Boolean = false,
)

data class DailyQuizLeaderboardResponse(
    @SerializedName("quizDay") val quizDay: String,
    @SerializedName("totalPlayers") val totalPlayers: Int,
    @SerializedName("currentUserRank") val currentUserRank: Int? = null,
    val entries: List<DailyQuizLeaderboardEntryDto>,
    @SerializedName("tableReady") val tableReady: Boolean? = true,
)

data class HomeContentSectionDto(
    val id: String,
    val title: String,
    val items: List<String>,
)

data class HomeQuickActionItemDto(
    val title: String,
    @SerializedName("actionKey") val actionKey: String,
    @SerializedName("iconKey") val iconKey: String? = null,
)

data class HomeQuickActionSectionDto(
    val id: String,
    val title: String,
    val items: List<HomeQuickActionItemDto>,
)

data class HomeBannerDto(
    val id: String,
    @SerializedName("imageUrl") val imageUrl: String,
    val enabled: Boolean = true,
)

data class HomeNewsSlideDto(
    val id: String,
    @SerializedName("articleId") val articleId: String,
    val headline: String? = null,
    @SerializedName("imageUrl") val imageUrl: String,
    val enabled: Boolean = true,
)

data class HomeContentDto(
    @SerializedName("welcomeText") val welcomeText: String? = null,
    @SerializedName("quickActionsTitle") val quickActionsTitle: String? = null,
    @SerializedName("themePreset") val themePreset: String? = null,
    @SerializedName("promoWidgetEnabled") val promoWidgetEnabled: Boolean = false,
    @SerializedName("promoWidgetHtml") val promoWidgetHtml: String? = null,
    @SerializedName("studentUpdateWidgetEnabled") val studentUpdateWidgetEnabled: Boolean = false,
    @SerializedName("studentUpdateWidgetHtml") val studentUpdateWidgetHtml: String? = null,
    @SerializedName("billWidgetEnabled") val billWidgetEnabledLegacy: Boolean = false,
    @SerializedName("billWidgetHtml") val billWidgetHtmlLegacy: String? = null,
    @SerializedName("newsCategoryMenu") val newsCategoryMenu: List<String> = emptyList(),
    @SerializedName("jobCategoryMenu") val jobCategoryMenu: List<String> = emptyList(),
    @SerializedName("examCategoryMenu") val examCategoryMenu: List<String> = emptyList(),
    val sections: List<HomeContentSectionDto> = emptyList(),
    @SerializedName("quickActionSections") val quickActionSections: List<HomeQuickActionSectionDto> = emptyList(),
    val banners: List<HomeBannerDto> = emptyList(),
    @SerializedName("newsSlides") val newsSlides: List<HomeNewsSlideDto> = emptyList(),
    @SerializedName("startSeriesScheduleTimerEnabled") val startSeriesScheduleTimerEnabled: Boolean? = null,
)

data class SubmitApplicationContentDto(
    val title: String? = null,
    @SerializedName("benefitsTitle") val benefitsTitle: String? = null,
    @SerializedName("submitButtonLabel") val submitButtonLabel: String? = null,
    @SerializedName("successMessage") val successMessage: String? = null,
    @SerializedName("bulletItems") val bulletItems: List<String> = emptyList(),
)

data class InstructionContentDto(
    @SerializedName("pageTitle") val pageTitle: String? = null,
    @SerializedName("cardTitle") val cardTitle: String? = null,
    @SerializedName("startButtonLabel") val startButtonLabel: String? = null,
    @SerializedName("submitDialogBrand") val submitDialogBrand: String? = null,
    @SerializedName("submitDialogTitle") val submitDialogTitle: String? = null,
    @SerializedName("submitDialogSubtitle") val submitDialogSubtitle: String? = null,
    @SerializedName("postSubmitCardTitle") val postSubmitCardTitle: String? = null,
    @SerializedName("postSubmitCardReadyTitle") val postSubmitCardReadyTitle: String? = null,
    @SerializedName("postSubmitCardDateLabel") val postSubmitCardDateLabel: String? = null,
    @SerializedName("postSubmitCardPendingMessage") val postSubmitCardPendingMessage: String? = null,
    @SerializedName("postSubmitCardReadyMessage") val postSubmitCardReadyMessage: String? = null,
    @SerializedName("postSubmitCardButtonLabel") val postSubmitCardButtonLabel: String? = null,
    @SerializedName("postSubmitCardLines") val postSubmitCardLines: List<String> = emptyList(),
    @SerializedName("questionNavigationMode") val questionNavigationMode: String? = null,
    val items: List<String> = emptyList(),
)

data class ProfileMenuItemDto(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val path: String,
    val enabled: Boolean = true,
)

data class ExamCategoryItemDto(
    val id: String,
    @SerializedName("level1") val level1: String,
    @SerializedName("level2") val level2: String,
    @SerializedName("level3") val level3: String,
    @SerializedName("iconKey") val iconKey: String? = null,
    val enabled: Boolean = true,
)

data class ExamCategoriesDto(
    val items: List<ExamCategoryItemDto> = emptyList(),
)

data class SignupRegionItemDto(
    val state: String,
    val districts: List<String> = emptyList(),
)

data class SignupRegionsDto(
    val items: List<SignupRegionItemDto> = emptyList(),
)

/** Admin `achievementContent` (public GET /v1/home/content) — same keys as server admin settings. */
data class AchievementContentDto(
    val title: String? = null,
    val body: String? = null,
)

data class ShareContentDto(
    val title: String? = null,
    val body: String? = null,
)

data class HomeContentResponse(
    val content: HomeContentDto? = null,
    @SerializedName("submitApplicationContent") val submitApplicationContent: SubmitApplicationContentDto? = null,
    @SerializedName("instructionContent") val instructionContent: InstructionContentDto? = null,
    @SerializedName("profileMenuItems") val profileMenuItems: List<ProfileMenuItemDto> = emptyList(),
    @SerializedName("examCategories") val examCategories: ExamCategoriesDto? = null,
    @SerializedName("signupRegions") val signupRegions: SignupRegionsDto? = null,
    @SerializedName("pollSettings") val pollSettings: PollSettingsDto? = null,
    @SerializedName("pushNotificationSettings") val pushNotificationSettings: PushNotificationSettingsDto? = null,
    @SerializedName("achievementContent") val achievementContent: AchievementContentDto? = null,
    @SerializedName("shareContent") val shareContent: ShareContentDto? = null,
    @SerializedName("dailyDigestShareContent") val dailyDigestShareContent: ShareContentDto? = null,
    @SerializedName("dailyQuizShareContent") val dailyQuizShareContent: ShareContentDto? = null,
)

data class PollItemDto(
    val id: String,
    val question: String,
    val options: List<String> = emptyList(),
    @SerializedName("allowMultiple") val allowMultiple: Boolean = false,
    val enabled: Boolean = true,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class PollSettingsDto(
    @SerializedName("showHomePopup") val showHomePopup: Boolean = true,
    val items: List<PollItemDto> = emptyList(),
)

data class PushNotificationItemDto(
    val id: String,
    val title: String? = null,
    val message: String? = null,
    @SerializedName("deepLink") val deepLink: String? = null,
    val enabled: Boolean = true,
    val status: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class PushNotificationSettingsDto(
    val items: List<PushNotificationItemDto> = emptyList(),
)

data class LeaderboardItemDto(
    val rank: Int,
    @SerializedName("userId") val userId: String,
    val name: String,
    val city: String? = null,
    val state: String? = null,
    val score: Int,
    @SerializedName("totalCorrect") val totalCorrect: Int = 0,
    @SerializedName("totalQuestions") val totalQuestions: Int = 0,
)

data class LeaderboardResponse(
    val items: List<LeaderboardItemDto> = emptyList(),
)

data class LeaderboardTestSummaryDto(
    @SerializedName("testId") val testId: String,
    @SerializedName("testTitle") val testTitle: String,
    @SerializedName("attemptsCount") val attemptsCount: Int = 0,
    @SerializedName("participantsCount") val participantsCount: Int = 0,
    @SerializedName("lastAttemptAt") val lastAttemptAt: String? = null,
)

data class LeaderboardTestsResponse(
    val items: List<LeaderboardTestSummaryDto> = emptyList(),
)

data class LeaderboardByTestResponse(
    val test: LeaderboardTestSummaryDto,
    val items: List<LeaderboardItemDto> = emptyList(),
)

data class ApplyTestResponse(
    val ok: Boolean = false,
    @SerializedName("alreadyApplied") val alreadyApplied: Boolean = false,
    @SerializedName("alreadyAppliedInCurrentCycle") val alreadyAppliedInCurrentCycle: Boolean = false,
    @SerializedName("mayReapplyForNewCycle") val mayReapplyForNewCycle: Boolean = false,
    @SerializedName("reenrolledForNewCycle") val reenrolledForNewCycle: Boolean = false,
    @SerializedName("enrolledInCurrentCycle") val enrolledInCurrentCycle: Boolean = false,
    @SerializedName("waitlisted") val waitlisted: Boolean = false,
    val message: String? = null,
    @SerializedName("testId") val testId: String? = null,
    @SerializedName("testTitle") val testTitle: String? = null,
    @SerializedName("enrolledCount") val enrolledCount: Int = 0,
    @SerializedName("capacityTotal") val capacityTotal: Int = 0,
    @SerializedName("remainingSeats") val remainingSeats: Int = 0,
    @SerializedName("waitingPosition") val waitingPosition: Int = 0,
    @SerializedName("waitingTotal") val waitingTotal: Int = 0,
)

data class TestWaitlistStatusResponse(
    @SerializedName("waitlisted") val waitlisted: Boolean = false,
    @SerializedName("waitingPosition") val waitingPosition: Int = 0,
    @SerializedName("waitingTotal") val waitingTotal: Int = 0,
)

data class MyTestApplicationDto(
    @SerializedName("testId") val testId: String = "",
    @SerializedName("testTitle") val testTitle: String = "",
    @SerializedName("appliedAt") val appliedAt: String? = null,
    @SerializedName("isPublished") val isPublished: Boolean = false,
    @SerializedName("alreadyAppliedInCurrentCycle") val alreadyAppliedInCurrentCycle: Boolean = true,
    @SerializedName("mayReapplyForNewCycle") val mayReapplyForNewCycle: Boolean = false,
    @SerializedName("cyclePhase") val cyclePhase: String? = null,
    @SerializedName("enrolledInCurrentCycle") val enrolledInCurrentCycle: Boolean = true,
    @SerializedName("enrolledCount") val enrolledCount: Int = 0,
    @SerializedName("capacityTotal") val capacityTotal: Int = 0,
    @SerializedName("remainingSeats") val remainingSeats: Int = 0,
    @SerializedName("slotLabel") val slotLabel: String? = null,
    @SerializedName("examDate") val examDate: String? = null,
    @SerializedName("canStart") val canStart: Boolean = false,
    @SerializedName("startBlockReason") val startBlockReason: String? = null,
    @SerializedName("joinClosesAt") val joinClosesAt: String? = null,
    @SerializedName("lastCycleStartedAt") val lastCycleStartedAt: String? = null,
)

data class MyTestApplicationsResponse(
    val items: List<MyTestApplicationDto> = emptyList(),
)

/** Phase 2: GET /tests/resolve — test status when not in public catalog. */
data class TestResolveResponse(
    val found: Boolean = false,
    val id: String? = null,
    val title: String? = null,
    val slug: String? = null,
    val subcategory: String? = null,
    @SerializedName("isPublished") val isPublished: Boolean = false,
    @SerializedName("catalogVisible") val catalogVisible: Boolean = false,
    @SerializedName("cyclePhase") val cyclePhase: String? = null,
    @SerializedName("republishAt") val republishAt: String? = null,
    @SerializedName("canApply") val canApply: Boolean = false,
    @SerializedName("alreadyAppliedInCurrentCycle") val alreadyAppliedInCurrentCycle: Boolean = false,
    @SerializedName("mayReapplyForNewCycle") val mayReapplyForNewCycle: Boolean = false,
    @SerializedName("blockReason") val blockReason: String? = null,
    @SerializedName("canStart") val canStart: Boolean = false,
    @SerializedName("startBlockReason") val startBlockReason: String? = null,
    @SerializedName("joinClosesAt") val joinClosesAt: String? = null,
    @SerializedName("enrolledCount") val enrolledCount: Int = 0,
    @SerializedName("capacityTotal") val capacityTotal: Int = 0,
    @SerializedName("remainingSeats") val remainingSeats: Int = 0,
    @SerializedName("lastCycleStartedAt") val lastCycleStartedAt: String? = null,
)

data class LeaderboardFilterTestDto(
    val id: String,
    val title: String,
)

data class LeaderboardFiltersResponse(
    val tests: List<LeaderboardFilterTestDto> = emptyList(),
    val states: List<String> = emptyList(),
    val cities: List<String> = emptyList(),
)

data class PollVoteRequest(
    @SerializedName("optionIndexes") val optionIndexes: List<Int>,
)

data class PollVoteResponse(
    val ok: Boolean,
    @SerializedName("pollId") val pollId: String,
    @SerializedName("hasVoted") val hasVoted: Boolean = true,
    @SerializedName("optionIndexes") val optionIndexes: List<Int> = emptyList(),
    val counts: List<Int> = emptyList(),
)

data class NotificationOpenRequest(
    @SerializedName("campaignId") val campaignId: String,
)

data class DeviceTokenUpsertRequest(
    @SerializedName("deviceToken") val deviceToken: String,
    val platform: String = "android",
    @SerializedName("appVersion") val appVersion: String = "",
    @SerializedName("deviceModel") val deviceModel: String = "",
)

