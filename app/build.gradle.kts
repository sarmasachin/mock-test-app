import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
    id("com.google.gms.google-services")
}

val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.freemocktest.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.freemocktest.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.0.1"
        // Release: prod URL only unless mocktest.releaseApiBaseUrl is set (staging).
        // Do NOT use mocktest.apiBaseUrl here — that key is for local dev and would ship bad URLs in APKs.
        val apiBase = (
            localProperties.getProperty("mocktest.releaseApiBaseUrl")
                ?: "https://admin-admin.govmocktest.com/v1/"
            ).let { b -> if (b.endsWith("/")) b else "$b/" }
        val escaped = apiBase.replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "API_BASE_URL", "\"$escaped\"")
        val resultDelayHours = (localProperties.getProperty("mocktest.resultReleaseDelayHours") ?: "3")
            .toIntOrNull()
            ?.coerceAtLeast(1)
            ?: 3
        buildConfigField("int", "RESULT_RELEASE_DELAY_HOURS", resultDelayHours.toString())
        // Must match Web OAuth client (type 3) in Firebase — same value as server GOOGLE_SIGN_IN_WEB_CLIENT_ID.
        val googleWebClientId = (
            localProperties.getProperty("mocktest.googleWebClientId")
                ?: "532425267567-rphktqaqjlbhpf6o39ondpk84h8b7cjg.apps.googleusercontent.com"
            ).trim()
        val googleWebEscaped = googleWebClientId.replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebEscaped\"")
    }

    buildTypes {
        debug {
            val debugApiBase = (
                localProperties.getProperty("mocktest.debugApiBaseUrl")
                    ?: localProperties.getProperty("mocktest.apiBaseUrl")
                    ?: "http://10.0.2.2:3000/v1/"
                ).let { b ->
                    val base = if (b.endsWith("/")) b else "$b/"
                    if (base.startsWith("https:") && (base.contains(":3000/") || base.matches(Regex("https://[0-9.]+:\\d+/")))) {
                        println("⚠️  mocktest debug API URL uses https on a port — Node default is HTTP. Use http://…:3000/ or you get TLS parse errors.")
                    }
                    base
                }
            val debugEscaped = debugApiBase.replace("\\", "\\\\").replace("\"", "\\\"")
            buildConfigField("String", "API_BASE_URL", "\"$debugEscaped\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        // Same as release (prod API in BuildConfig) but no R8 shrink — APK size similar to old “fat” debug-style builds (~tens of MB).
        create("releaseFat") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    // Needed for androidx.compose.material.pullrefresh (Home pull-to-refresh).
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("io.coil-kt:coil-compose:2.6.0")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.android.gms:play-services-auth:21.3.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

