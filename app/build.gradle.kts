import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.example.mocktestapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.mocktestapp"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.0.1"
        val apiBase = (
            localProperties.getProperty("mocktest.releaseApiBaseUrl")
                ?: localProperties.getProperty("mocktest.apiBaseUrl")
                ?: "https://api.mocktestapp.com/v1/"
            ).let { b -> if (b.endsWith("/")) b else "$b/" }
        val escaped = apiBase.replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "API_BASE_URL", "\"$escaped\"")
        // OAuth 2.0 Web client ID (Google Cloud Console) — same value as server GOOGLE_WEB_CLIENT_ID
        val googleWeb = (localProperties.getProperty("mocktest.googleWebClientId") ?: "").replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWeb\"")
        val resultDelayHours = (localProperties.getProperty("mocktest.resultReleaseDelayHours") ?: "3")
            .toIntOrNull()
            ?.coerceAtLeast(1)
            ?: 3
        buildConfigField("int", "RESULT_RELEASE_DELAY_HOURS", resultDelayHours.toString())
    }

    buildTypes {
        debug {
            val debugApiBase = (
                localProperties.getProperty("mocktest.debugApiBaseUrl")
                    ?: localProperties.getProperty("mocktest.apiBaseUrl")
                    ?: "http://10.0.2.2:3000/v1/"
                ).let { b -> if (b.endsWith("/")) b else "$b/" }
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
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("io.coil-kt:coil-compose:2.6.0")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

