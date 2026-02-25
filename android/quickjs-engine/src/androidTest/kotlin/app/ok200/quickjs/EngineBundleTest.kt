package app.ok200.quickjs

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.ok200.io.file.FileManagerImpl
import app.ok200.quickjs.bindings.NativeBindings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertEquals

/**
 * Instrumented tests for loading the 200 OK engine bundle.
 *
 * These tests verify that the TypeScript engine bundle (engine.bundle.js)
 * loads correctly in QuickJS and exposes the expected API.
 * The bundle requires all __ok200_* bindings to be registered first.
 */
@RunWith(AndroidJUnit4::class)
class EngineBundleTest {

    private lateinit var engine: QuickJsEngine
    private lateinit var bindings: NativeBindings
    private lateinit var bundleContent: String
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val fileManager = FileManagerImpl(context)
        engine = QuickJsEngine()
        bindings = NativeBindings(engine.jsThread, scope, fileManager) { Uri.EMPTY }
        engine.postAndWait {
            bindings.registerAll(engine.context)
        }

        // Load engine bundle from main source set assets
        bundleContent = context.assets.open("engine.bundle.js").bufferedReader().use { it.readText() }
    }

    @After
    fun tearDown() {
        bindings.shutdown()
        engine.close()
    }

    @Test
    fun bundleLoadsWithoutError() {
        engine.evaluate(bundleContent, "engine.bundle.js")
    }

    @Test
    fun engineStartIsFunction() {
        engine.evaluate(bundleContent, "engine.bundle.js")

        val result = engine.evaluate("typeof __ok200_engine_start")
        assertEquals("function", result, "__ok200_engine_start should be a function")
    }

    @Test
    fun engineStopIsFunction() {
        engine.evaluate(bundleContent, "engine.bundle.js")

        val result = engine.evaluate("typeof __ok200_engine_stop")
        assertEquals("function", result, "__ok200_engine_stop should be a function")
    }
}
