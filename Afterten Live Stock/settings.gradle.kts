pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }

    // Force a single Kotlin toolchain version for all Kotlin-related plugins to avoid
    // duplicate "kotlin" extension registrations when multiple versions are pulled in.
    resolutionStrategy {
        eachPlugin {
            if (requested.id.id.startsWith("org.jetbrains.kotlin")) {
                useVersion("2.0.21")
            }
            if (requested.id.id == "com.google.devtools.ksp") {
                useVersion("2.0.21-1.0.26")
            }
        }
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

rootProject.name = "Afterten Live Stock"
include(":app")
