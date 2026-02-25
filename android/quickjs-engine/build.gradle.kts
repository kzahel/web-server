plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "app.ok200.quickjs"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }

        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DANDROID_STL=c++_shared"
                )
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.core.ktx)

    implementation(project(":io-core"))

    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.kotlin.test)
    androidTestImplementation(libs.kotlinx.coroutines.test)
}

// Task to build the TypeScript engine bundle for QuickJS
tasks.register("buildEngineBundle") {
    description = "Builds the TypeScript engine bundle for QuickJS"

    outputs.upToDateWhen { false }

    doLast {
        val sourceBundle = rootProject.file("../packages/engine/dist/engine.native.js")
        val assetsDir = file("src/main/assets")
        val bundleFile = file("src/main/assets/engine.bundle.js")

        if (!sourceBundle.exists()) {
            println(">>> Building TypeScript engine bundle...")
            exec {
                workingDir = rootProject.file("../packages/engine")
                if (System.getProperty("os.name").lowercase().contains("windows")) {
                    commandLine("cmd", "/c", "pnpm bundle:native")
                } else {
                    commandLine("sh", "-c", "pnpm bundle:native")
                }
            }
        } else {
            println(">>> Using pre-built engine bundle")
        }

        assetsDir.mkdirs()

        copy {
            from(sourceBundle)
            into(assetsDir)
            rename { "engine.bundle.js" }
        }

        if (!bundleFile.exists()) {
            throw GradleException("Engine bundle not found at ${bundleFile.absolutePath}")
        }

        println(">>> Engine bundle ready: ${bundleFile.length() / 1024} KB")
    }
}

tasks.named("preBuild") {
    dependsOn("buildEngineBundle")
}
