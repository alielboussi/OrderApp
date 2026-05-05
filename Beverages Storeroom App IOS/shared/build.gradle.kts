plugins {
  kotlin("multiplatform")
  kotlin("plugin.serialization")
}

kotlin {
  iosX64()
  iosArm64()
  iosSimulatorArm64()

  cocoapods {
    summary = "Shared logic for Beverages Storeroom App iOS"
    homepage = "https://example.com"
    ios.deploymentTarget = "15.0"
    podfile = project.file("../iosApp/Podfile")
    framework {
      baseName = "Shared"
      isStatic = false
    }
  }

  sourceSets {
    val commonMain by getting {
      dependencies {
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
        implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
        implementation("io.ktor:ktor-client-core:2.3.12")
        implementation("io.ktor:ktor-client-content-negotiation:2.3.12")
        implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.12")
      }
    }
    val iosMain by getting {
      dependencies {
        implementation("io.ktor:ktor-client-darwin:2.3.12")
      }
    }
  }
}
