package app.ok200.quickjs

import android.content.Context
import android.net.Uri
import android.util.Log
import app.ok200.io.file.FileManager
import app.ok200.io.file.FileManagerImpl
import app.ok200.quickjs.bindings.EngineErrorListener
import app.ok200.quickjs.bindings.EngineStateListener
import app.ok200.quickjs.bindings.NativeBindings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.Closeable

private const val TAG = "EngineController"

/**
 * Server state reported by the JS engine.
 */
@Serializable
data class ServerState(
    val running: Boolean = false,
    val port: Int = 0,
    val host: String = "",
    val error: String? = null
)

/**
 * Engine controller for the web server.
 *
 * Manages the QuickJS engine lifecycle, loads the engine bundle,
 * and provides start/stop control for the HTTP server.
 */
class EngineController(
    private val context: Context,
    private val scope: CoroutineScope,
    private val rootUriProvider: () -> Uri?
) : Closeable {

    private var engine: QuickJsEngine? = null
    private var bindings: NativeBindings? = null
    private val json = Json { ignoreUnknownKeys = true }

    private val _state = MutableStateFlow(ServerState())
    val state: StateFlow<ServerState> = _state.asStateFlow()

    @Volatile
    var isHealthy: Boolean = false
        private set

    /**
     * Load the engine bundle and register native bindings.
     */
    fun loadEngine() {
        Log.i(TAG, "Loading engine...")

        val qjsEngine = QuickJsEngine()
        engine = qjsEngine

        val fileManager: FileManager = FileManagerImpl(context)
        val nativeBindings = NativeBindings(
            jsThread = qjsEngine.jsThread,
            scope = scope,
            fileManager = fileManager,
            rootUriProvider = rootUriProvider
        )
        bindings = nativeBindings

        // Set up state/error listeners
        nativeBindings.stateListener = object : EngineStateListener {
            override fun onStateChanged(stateJson: String) {
                try {
                    _state.value = json.decodeFromString<ServerState>(stateJson)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse state: $stateJson", e)
                }
            }
        }
        nativeBindings.errorListener = object : EngineErrorListener {
            override fun onError(message: String) {
                Log.e(TAG, "Engine error: $message")
                _state.value = _state.value.copy(error = message)
            }
        }

        // Register all bindings on the JS context
        qjsEngine.postAndWait {
            nativeBindings.registerAll(qjsEngine.context)
        }

        // Set up event dispatching from I/O threads to JS
        qjsEngine.postAndWait {
            nativeBindings.setupEventDispatching(qjsEngine.context)
        }

        // Load the engine bundle
        val bundle = context.assets.open("engine.bundle.js").bufferedReader().readText()
        qjsEngine.evaluate(bundle, "engine.bundle.js")

        isHealthy = true
        Log.i(TAG, "Engine loaded successfully")
    }

    /**
     * Start the HTTP server.
     */
    fun startServer(port: Int, host: String = "0.0.0.0") {
        val eng = engine ?: throw IllegalStateException("Engine not loaded")
        val configJson = """{"port":$port,"host":"$host"}"""
        eng.callGlobalFunction("__ok200_engine_start", configJson)
        Log.i(TAG, "Server start requested: $host:$port")
    }

    /**
     * Stop the HTTP server.
     */
    fun stopServer() {
        val eng = engine ?: return
        eng.callGlobalFunction("__ok200_engine_stop")
        Log.i(TAG, "Server stop requested")
    }

    /**
     * Block until a synchronous operation completes on the JS thread.
     */
    private fun QuickJsEngine.postAndWait(block: () -> Unit) {
        val latch = java.util.concurrent.CountDownLatch(1)
        this.post {
            block()
            latch.countDown()
        }
        latch.await()
    }

    override fun close() {
        isHealthy = false
        bindings?.shutdown()
        bindings = null
        engine?.close()
        engine = null
        _state.value = ServerState()
        Log.i(TAG, "Engine closed")
    }
}
