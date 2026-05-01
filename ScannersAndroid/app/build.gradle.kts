plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.serialization")
}

android {
  namespace = "com.afterten.beverages_storeroom_app"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.afterten.beverages_storeroom_app"
    minSdk = 26
    targetSdk = 34
    versionCode = 1
    versionName = "1.0"

    val supabaseUrl = project.findProperty("SUPABASE_URL") as String? ?: ""
    val supabaseAnonKey = project.findProperty("SUPABASE_ANON_KEY") as String? ?: ""

    buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
    buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
  }

  buildFeatures {
    compose = true
    buildConfig = true
  }

  composeOptions {
    kotlinCompilerExtensionVersion = "1.5.14"
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
}

dependencies {
  implementation(platform("androidx.compose:compose-bom:2024.06.00"))
  implementation("androidx.activity:activity-compose:1.9.0")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("androidx.navigation:navigation-compose:2.7.7")

  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
  implementation("io.ktor:ktor-client-core:2.3.6")
  implementation("io.ktor:ktor-client-okhttp:2.3.6")
  implementation("io.ktor:ktor-client-content-negotiation:2.3.6")
  implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.6")

  implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.5.0")

  debugImplementation("androidx.compose.ui:ui-tooling")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}
