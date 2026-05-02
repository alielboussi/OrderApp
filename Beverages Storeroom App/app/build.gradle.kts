plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.serialization")
}

android {
  namespace = "com.afterten.drinks_transfers"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.afterten.drinks_transfers"
    minSdk = 26
    targetSdk = 34
    versionCode = 1
    versionName = "1.0"

    val supabaseUrl = project.findProperty("SUPABASE_URL") as String? ?: ""
    val supabaseAnonKey = project.findProperty("SUPABASE_ANON_KEY") as String? ?: ""
    val scannersBaseUrl = project.findProperty("SCANNERS_BASE_URL") as String? ?: ""

    buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
    buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
    buildConfigField("String", "SCANNERS_BASE_URL", "\"$scannersBaseUrl\"")
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

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
    jniLibs {
      useLegacyPackaging = false
    }
  }
}

dependencies {
  implementation(platform("androidx.compose:compose-bom:2024.06.00"))
  implementation("androidx.activity:activity-compose:1.9.0")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-text")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("com.google.android.material:material:1.12.0")
  implementation("androidx.navigation:navigation-compose:2.7.7")
  implementation("androidx.datastore:datastore-preferences:1.1.1")
  implementation("androidx.lifecycle:lifecycle-process:2.8.1")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.1")
  implementation("androidx.camera:camera-core:1.3.4")
  implementation("androidx.camera:camera-camera2:1.3.4")
  implementation("androidx.camera:camera-lifecycle:1.3.4")
  implementation("androidx.camera:camera-view:1.3.4")
  implementation("com.google.mlkit:barcode-scanning:17.2.0")
  implementation("io.coil-kt:coil-compose:2.6.0")

  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
  implementation("io.ktor:ktor-client-core:2.3.6")
  implementation("io.ktor:ktor-client-okhttp:2.3.6")
  implementation("io.ktor:ktor-client-content-negotiation:2.3.6")
  implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.6")

  implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.5.0")

  debugImplementation("androidx.compose.ui:ui-tooling")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}

listOf(
  "debug/javaPreCompileDebug",
  "debugAndroidTest/javaPreCompileDebugAndroidTest"
).forEach { path ->
  val file = layout.buildDirectory.file(
    "intermediates/annotation_processor_list/$path/annotationProcessors.json"
  ).get().asFile
  if (!file.exists()) {
    file.parentFile.mkdirs()
    file.writeText("[]")
  }
}
