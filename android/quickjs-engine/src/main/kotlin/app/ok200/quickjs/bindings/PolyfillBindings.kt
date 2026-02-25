package app.ok200.quickjs.bindings

import android.util.Log
import app.ok200.quickjs.JsThread
import app.ok200.quickjs.QuickJsContext
import java.security.SecureRandom

/**
 * Polyfill bindings for QuickJS.
 *
 * Implements missing Web APIs:
 * - TextEncoder/TextDecoder
 * - crypto.getRandomValues
 * - console.log
 * - setTimeout/setInterval
 */
class PolyfillBindings(
    private val jsThread: JsThread
) {
    private val secureRandom = SecureRandom()

    fun register(ctx: QuickJsContext) {
        registerTextFunctions(ctx)
        registerRandomFunctions(ctx)
        registerConsoleFunctions(ctx)
        registerTimerFunctions(ctx)
    }

    private fun registerTextFunctions(ctx: QuickJsContext) {
        ctx.setGlobalFunctionReturnsBinary("__ok200_text_encode") { args, _ ->
            val str = args.getOrNull(0) ?: ""
            str.toByteArray(Charsets.UTF_8)
        }

        ctx.setGlobalFunctionWithBinary("__ok200_text_decode", 0) { _, binary ->
            binary?.let { String(it, Charsets.UTF_8) }
        }
    }

    private fun registerRandomFunctions(ctx: QuickJsContext) {
        ctx.setGlobalFunctionReturnsBinary("__ok200_random_bytes") { args, _ ->
            val length = args.getOrNull(0)?.toIntOrNull() ?: 0
            if (length <= 0 || length > 65536) {
                ByteArray(0)
            } else {
                ByteArray(length).also { secureRandom.nextBytes(it) }
            }
        }
    }

    private fun registerConsoleFunctions(ctx: QuickJsContext) {
        ctx.setGlobalFunction("__ok200_console_log") { args ->
            val level = args.getOrNull(0) ?: "info"
            val message = args.getOrNull(1) ?: ""

            when (level) {
                "error" -> Log.e("Ok200-JS", message)
                "warn" -> Log.w("Ok200-JS", message)
                "debug" -> Log.d("Ok200-JS", message)
                else -> Log.i("Ok200-JS", message)
            }
            null
        }
    }

    private fun registerTimerFunctions(ctx: QuickJsContext) {
        ctx.setGlobalFunction("__ok200_set_timeout") { args ->
            val callbackId = args.getOrNull(0)?.toIntOrNull() ?: return@setGlobalFunction null
            val ms = args.getOrNull(1)?.toLongOrNull() ?: 0L

            val timerId = jsThread.setTimeout(ms) {
                ctx.callGlobalFunction("__ok200_timer_dispatch", callbackId.toString())
                jsThread.scheduleJobPump(ctx)
            }
            timerId.toString()
        }

        ctx.setGlobalFunction("__ok200_clear_timeout") { args ->
            val timerId = args.getOrNull(0)?.toIntOrNull()
            timerId?.let { jsThread.clearTimeout(it) }
            null
        }

        ctx.setGlobalFunction("__ok200_set_interval") { args ->
            val callbackId = args.getOrNull(0)?.toIntOrNull() ?: return@setGlobalFunction null
            val ms = args.getOrNull(1)?.toLongOrNull() ?: 0L

            val intervalId = jsThread.setInterval(ms) {
                ctx.callGlobalFunction("__ok200_timer_dispatch", callbackId.toString())
                jsThread.scheduleJobPump(ctx)
            }
            intervalId.toString()
        }

        ctx.setGlobalFunction("__ok200_clear_interval") { args ->
            val intervalId = args.getOrNull(0)?.toIntOrNull()
            intervalId?.let { jsThread.clearInterval(it) }
            null
        }
    }
}
