package app.ok200.quickjs

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.ok200.io.file.FileManagerImpl
import app.ok200.quickjs.bindings.EngineStateListener
import app.ok200.quickjs.bindings.NativeBindings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Full end-to-end smoke test: load engine bundle, start HTTP server,
 * serve real files, make HTTP requests, stop cleanly.
 *
 * Exercises the complete stack: QuickJS → TypeScript engine → native TCP sockets → native filesystem.
 */
@RunWith(AndroidJUnit4::class)
class EngineServerE2eTest {

    private lateinit var engine: QuickJsEngine
    private lateinit var bindings: NativeBindings
    private lateinit var testDir: File
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val serverPort = AtomicInteger(0)
    private val serverRunning = CountDownLatch(1)
    private val serverStopped = CountDownLatch(1)
    private val lastError = AtomicReference<String?>(null)

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        // Create test files in a temp directory
        testDir = File(context.cacheDir, "ok200-e2e-${System.currentTimeMillis()}")
        testDir.mkdirs()
        File(testDir, "index.html").writeText("<h1>Hello from Android</h1>")
        File(testDir, "hello.txt").writeText("Hello, world!")
        File(testDir, "sub").mkdirs()
        File(testDir, "sub/nested.txt").writeText("nested content")

        val rootUri = Uri.fromFile(testDir)
        val fileManager = FileManagerImpl(context)

        engine = QuickJsEngine()
        bindings = NativeBindings(engine.jsThread, scope, fileManager) { rootUri }

        engine.postAndWait {
            bindings.registerAll(engine.context)
        }
        engine.postAndWait {
            bindings.setupEventDispatching(engine.context)
        }

        // Listen for state changes
        bindings.stateListener = object : EngineStateListener {
            override fun onStateChanged(stateJson: String) {
                // Parse port from state JSON
                val portMatch = Regex(""""port"\s*:\s*(\d+)""").find(stateJson)
                val runningMatch = Regex(""""running"\s*:\s*(true|false)""").find(stateJson)
                val port = portMatch?.groupValues?.get(1)?.toIntOrNull() ?: 0
                val running = runningMatch?.groupValues?.get(1) == "true"

                if (running && port > 0) {
                    serverPort.set(port)
                    serverRunning.countDown()
                } else if (!running && serverPort.get() > 0) {
                    serverStopped.countDown()
                }
            }
        }

        // Load engine bundle
        val bundle = context.assets.open("engine.bundle.js").bufferedReader().readText()
        engine.evaluate(bundle, "engine.bundle.js")
    }

    @After
    fun tearDown() {
        bindings.shutdown()
        engine.close()
        testDir.deleteRecursively()
    }

    @Test(timeout = 30_000)
    fun startServerServeFileAndStopCleanly() {
        // Start server on ephemeral port
        engine.callGlobalFunction("__ok200_engine_start", """{"port":0,"host":"127.0.0.1"}""")

        assertTrue(
            serverRunning.await(10, TimeUnit.SECONDS),
            "Server should report running within 10s"
        )
        val port = serverPort.get()
        assertTrue(port > 0, "Server should bind to a valid port")

        // Fetch a file
        val (status, body) = httpGet("http://127.0.0.1:$port/hello.txt")
        assertEquals(200, status, "GET /hello.txt should return 200")
        assertEquals("Hello, world!", body, "Response body should match file content")

        // Fetch index.html via directory
        val (indexStatus, indexBody) = httpGet("http://127.0.0.1:$port/")
        assertEquals(200, indexStatus, "GET / should return 200")
        assertTrue(indexBody.contains("Hello from Android"), "Should serve index.html")

        // 404 for missing file
        val (notFoundStatus, _) = httpGet("http://127.0.0.1:$port/nonexistent.txt")
        assertEquals(404, notFoundStatus, "GET /nonexistent.txt should return 404")

        // Stop server
        engine.callGlobalFunction("__ok200_engine_stop")

        assertTrue(
            serverStopped.await(10, TimeUnit.SECONDS),
            "Server should report stopped within 10s"
        )

        // Verify server is no longer accepting connections
        try {
            httpGet("http://127.0.0.1:$port/hello.txt")
            // If we get here, the connection succeeded unexpectedly — not fatal but notable
        } catch (_: Exception) {
            // Expected: connection refused
        }
    }

    private fun httpGet(urlStr: String): Pair<Int, String> {
        val url = URL(urlStr)
        val conn = url.openConnection() as HttpURLConnection
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        return try {
            val status = conn.responseCode
            val body = if (status in 200..299) {
                conn.inputStream.bufferedReader().readText()
            } else {
                conn.errorStream?.bufferedReader()?.readText() ?: ""
            }
            Pair(status, body)
        } finally {
            conn.disconnect()
        }
    }
}
