plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

// Ensure Kotlin uses JDK 17 toolchain consistently (helps KSP/Javac alignment)
kotlin {
    jvmToolchain(17)
}

android {
    namespace = "com.afterten.orders"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.afterten.orders"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    lint {
        lintConfig = file("lint.xml")
        warningsAsErrors = false
        abortOnError = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }


    // With Kotlin 2.0+, Compose compiler is provided via the kotlin-compose plugin.

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-Xjvm-default=all"
        )
    }

    packaging {
        jniLibs {
            // Keep debug symbols for all .so to avoid strip warnings in debug builds on Windows
            keepDebugSymbols += listOf("**/*.so")
        }
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

// Workaround for Windows file locks on lint-cache during clean
// Exclude the lint-cache from :app:clean to avoid occasional FileSystemException
// You can manually delete app/build/intermediates/lint-cache when needed (after stopping Gradle daemons)
tasks.named<Delete>("clean") {
    val buildDirFile = layout.buildDirectory.asFile.get()
    delete(
        fileTree(buildDirFile) {
            // These folders are known to be locked by Windows during/after builds
            exclude("intermediates/lint-cache/**")
            exclude("kspCaches/**")
            // If KSP keeps files open, skipping its caches prevents clean from failing.
            // You can manually delete app/build/kspCaches after closing Android Studio/Gradle daemons.
        }
    )
}

// Note: If you need to disable test variants for performance, update to the new AGP hostTests API.

dependencies {
    // (Removed BOM due to Kotlin/AGP constraints)
    // Compose BOM
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.10.00"))

    // Compose core
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Material Components (for AndroidX view system theme resources like Theme.Material3.DayNight.NoActionBar)
    implementation("com.google.android.material:material:1.12.0")

    // Material Icons (provides Icons.Default.* vectors used in UI)
    implementation("androidx.compose.material:material-icons-extended")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.0")

    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Room (for offline cache)
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // WorkManager for background sync
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Coil for image loading
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Supabase Kotlin SDK (v2.x compatible with Kotlin 2.0 toolchain)
    implementation("io.github.jan-tennert.supabase:postgrest-kt:2.4.0")
    implementation("io.github.jan-tennert.supabase:storage-kt:2.4.0")
    implementation("io.github.jan-tennert.supabase:realtime-kt:2.4.0")

    // Ktor client for any custom calls if needed
    implementation("io.ktor:ktor-client-okhttp:2.3.11")
    implementation("io.ktor:ktor-client-logging:2.3.11")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.11")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.11")

    // Desugaring for Java 8+ APIs on minSdk < 26
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.13")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}

// Inject Supabase env from gradle.properties (do not hardcode secrets in source)
val supabaseUrl = (project.findProperty("SUPABASE_URL") as String?) ?: ""
val supabaseAnonKey = (project.findProperty("SUPABASE_ANON_KEY") as String?) ?: ""
val adminEmail = (project.findProperty("ADMIN_EMAIL") as String?) ?: ""
val adminUuid = (project.findProperty("ADMIN_UUID") as String?) ?: ""
val warehouseBackofficeUrl = (project.findProperty("WAREHOUSE_BACKOFFICE_URL") as String?) ?: ""

android {
    defaultConfig {
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "ADMIN_EMAIL", "\"$adminEmail\"")
        buildConfigField("String", "ADMIN_UUID", "\"$adminUuid\"")
        buildConfigField("String", "WAREHOUSE_BACKOFFICE_URL", "\"$warehouseBackofficeUrl\"")
    }
}
