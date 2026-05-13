# Retrofit + Gson: keep request/response DTOs so @SerializedName maps to JSON keys
# (otherwise R8 can rename fields → PATCH /v1/me/profile body misses "gender" etc.
#  and the API returns "No updatable fields provided").
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.freemocktest.app.data.remote.** { <fields>; }

