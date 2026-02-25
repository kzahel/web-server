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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class NativeBindingsTest {

    private lateinit var engine: QuickJsEngine
    private lateinit var bindings: NativeBindings
    private lateinit var testDir: File
    private lateinit var rootUri: Uri
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        testDir = File(context.filesDir, "bindings_test_${System.currentTimeMillis()}")
        testDir.mkdirs()
        rootUri = Uri.parse("file://${testDir.absolutePath}")

        val fileManager = FileManagerImpl(context)
        engine = QuickJsEngine()
        bindings = NativeBindings(engine.jsThread, scope, fileManager) { rootUri }
        engine.postAndWait {
            bindings.registerAll(engine.context)
        }
    }

    @After
    fun tearDown() {
        bindings.shutdown()
        engine.close()
        testDir.deleteRecursively()
    }

    // ========================================
    // Text Encode/Decode Tests
    // ========================================

    @Test
    fun textEncodeDecodeRoundTrips() {
        val result = engine.evaluate("""
            const encoded = __ok200_text_encode("Hello, World!");
            __ok200_text_decode(encoded);
        """.trimIndent())

        assertEquals("Hello, World!", result)
    }

    @Test
    fun textEncodeReturnsArrayBuffer() {
        val result = engine.evaluate("""
            const encoded = __ok200_text_encode("ABC");
            encoded.constructor.name;
        """.trimIndent())

        assertEquals("ArrayBuffer", result)
    }

    @Test
    fun textEncodeLength() {
        val result = engine.evaluate("""
            const encoded = __ok200_text_encode("Hello");
            encoded.byteLength;
        """.trimIndent())

        assertEquals(5, result)
    }

    @Test
    fun textEncodeUnicode() {
        val result = engine.evaluate("""
            const encoded = __ok200_text_encode("\u3053\u3093\u306b\u3061\u306f");
            __ok200_text_decode(encoded);
        """.trimIndent())

        assertEquals("\u3053\u3093\u306b\u3061\u306f", result)
    }

    // ========================================
    // Random Bytes Tests
    // ========================================

    @Test
    fun randomBytesReturnsArrayBuffer() {
        val result = engine.evaluate("""
            const bytes = __ok200_random_bytes(16);
            bytes.constructor.name;
        """.trimIndent())

        assertEquals("ArrayBuffer", result)
    }

    @Test
    fun randomBytesReturnsCorrectLength() {
        val result = engine.evaluate("""
            const bytes = __ok200_random_bytes(32);
            bytes.byteLength;
        """.trimIndent())

        assertEquals(32, result)
    }

    @Test
    fun randomBytesProducesDifferentValues() {
        val result = engine.evaluate("""
            const bytes1 = __ok200_random_bytes(16);
            const bytes2 = __ok200_random_bytes(16);
            const view1 = new Uint8Array(bytes1);
            const view2 = new Uint8Array(bytes2);

            let same = true;
            for (let i = 0; i < 16; i++) {
                if (view1[i] !== view2[i]) {
                    same = false;
                    break;
                }
            }
            same;
        """.trimIndent())

        assertEquals(false, result)
    }

    // ========================================
    // Console Log Tests
    // ========================================

    @Test
    fun consoleLogDoesNotThrow() {
        engine.evaluate("""
            __ok200_console_log("info", "Test message");
            __ok200_console_log("warn", "Warning message");
            __ok200_console_log("error", "Error message");
            __ok200_console_log("debug", "Debug message");
        """.trimIndent())
    }

    // ========================================
    // Timer Tests
    // ========================================

    @Test
    fun setTimeoutFiresCallback() {
        var fired = false
        var attempts = 0

        engine.postAndWait {
            engine.context.evaluate("""
                globalThis.timerFired = false;
                __ok200_set_timeout(function() {
                    globalThis.timerFired = true;
                }, 50);
            """.trimIndent())
        }

        while (attempts < 20 && !fired) {
            Thread.sleep(50)
            attempts++

            engine.postAndWait {
                val result = engine.context.evaluate("globalThis.timerFired")
                fired = result == true
            }
        }

        assertTrue(fired, "Timer should have fired (attempts: $attempts)")
    }

    @Test
    fun clearTimeoutCancelsTimer() {
        engine.postAndWait {
            engine.context.evaluate("""
                globalThis.timerFired = false;
                const timerId = __ok200_set_timeout(function() {
                    globalThis.timerFired = true;
                }, 100);
                __ok200_clear_timeout(timerId);
            """.trimIndent())
        }

        Thread.sleep(200)

        val result = engine.evaluate("globalThis.timerFired")
        assertEquals(false, result, "Timer should have been cancelled")
    }

    // ========================================
    // Callback Bindings Tests
    // ========================================

    @Test
    fun stateUpdateCallsListener() {
        val latch = CountDownLatch(1)
        var receivedState: String? = null

        bindings.stateListener = object : EngineStateListener {
            override fun onStateChanged(stateJson: String) {
                receivedState = stateJson
                latch.countDown()
            }
        }

        engine.evaluate("""
            __ok200_report_state('{"running":true,"port":8080}');
        """.trimIndent())

        latch.await(1, TimeUnit.SECONDS)
        assertNotNull(receivedState)
        assertTrue(receivedState!!.contains("running"))
    }

    // ========================================
    // ArrayBuffer JNI Tests
    // ========================================

    @Test
    fun callGlobalFunctionWithBinaryWorks() {
        engine.postAndWait {
            engine.context.setGlobalFunctionReturnsBinary("__test_echo_binary", 0) { _, binary ->
                binary
            }
        }

        val result = engine.evaluate("""
            const input = __ok200_text_encode("Hello Binary");
            const output = __test_echo_binary(input);
            __ok200_text_decode(output);
        """.trimIndent())

        assertEquals("Hello Binary", result)
    }

    // ========================================
    // File I/O Binding Tests (read-only)
    // ========================================

    @Test
    fun fileStatReturnsSize() {
        // Create a test file directly
        val testFile = File(testDir, "stat_test.txt")
        testFile.writeText("12345678901234567890") // 20 bytes

        val stat = engine.evaluate("""
            const statJson = __ok200_file_stat("stat_test.txt");
            JSON.parse(statJson).size;
        """.trimIndent())

        assertEquals(20, stat)
    }

    @Test
    fun fileExistsWorks() {
        val testFile = File(testDir, "exists_test.txt")
        testFile.writeText("test")

        val exists = engine.evaluate("""
            __ok200_file_exists("exists_test.txt");
        """.trimIndent())

        assertEquals("true", exists)
    }

    @Test
    fun fileExistsReturnsFalseForMissing() {
        val exists = engine.evaluate("""
            __ok200_file_exists("nonexistent.txt");
        """.trimIndent())

        assertEquals("false", exists)
    }

    @Test
    fun fileReaddirListsFiles() {
        File(testDir, "dir_test").mkdirs()
        File(testDir, "dir_test/aaa.txt").writeText("a")
        File(testDir, "dir_test/bbb.txt").writeText("b")

        val result = engine.evaluate("""
            const json = __ok200_file_readdir("dir_test");
            const entries = JSON.parse(json).sort();
            JSON.stringify(entries);
        """.trimIndent())

        assertEquals("[\"aaa.txt\",\"bbb.txt\"]", result)
    }

    @Test
    fun fileListTreeReturnsFilesWithSizes() {
        File(testDir, "tree_test").mkdirs()
        File(testDir, "tree_test/sub").mkdirs()
        File(testDir, "tree_test/file1.txt").writeBytes(ByteArray(4))
        File(testDir, "tree_test/sub/file2.bin").writeBytes(ByteArray(6))

        val result = engine.evaluate("""
            const json = __ok200_file_list_tree("tree_test");
            const entries = JSON.parse(json);
            entries.sort((a, b) => a.path.localeCompare(b.path));
            JSON.stringify(entries);
        """.trimIndent())

        val entries = org.json.JSONArray(result as String)
        assertEquals(2, entries.length())
        assertEquals("file1.txt", entries.getJSONObject(0).getString("path"))
        assertEquals(4, entries.getJSONObject(0).getInt("size"))
        assertEquals("sub/file2.bin", entries.getJSONObject(1).getString("path"))
        assertEquals(6, entries.getJSONObject(1).getInt("size"))
    }

    @Test
    fun fileReadWorks() {
        val testFile = File(testDir, "read_test.txt")
        testFile.writeText("Hello, Android!")

        val result = engine.evaluate("""
            const data = __ok200_file_read("read_test.txt", "0", "15");
            __ok200_text_decode(data);
        """.trimIndent())

        assertEquals("Hello, Android!", result)
    }
}
