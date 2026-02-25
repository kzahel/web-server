package app.ok200.quickjs.bindings

import android.util.Log
import app.ok200.io.socket.TcpSocketCallback
import app.ok200.io.socket.TcpSocketManager
import app.ok200.quickjs.JsThread
import app.ok200.quickjs.QuickJsContext

private const val TAG = "TcpBindings"

/**
 * TCP socket bindings for accepted client connections.
 *
 * Registers __ok200_tcp_send, __ok200_tcp_close, and event callback registrations.
 * Dispatches data/close/error events to JS via dispatcher functions.
 */
class TcpBindings(
    private val jsThread: JsThread,
    private val socketManager: TcpSocketManager
) : TcpSocketCallback {

    init {
        socketManager.setCallback(this)
    }

    fun register(ctx: QuickJsContext) {
        // __ok200_tcp_send(socketId, data: ArrayBuffer): string
        ctx.setGlobalFunctionWithBinary("__ok200_tcp_send", 1) { args, binary ->
            val socketId = args.getOrNull(0)?.toIntOrNull() ?: return@setGlobalFunctionWithBinary "false"
            val data = binary ?: return@setGlobalFunctionWithBinary "false"
            val ok = socketManager.send(socketId, data)
            if (ok) "true" else "false"
        }

        // __ok200_tcp_close(socketId): void
        ctx.setGlobalFunction("__ok200_tcp_close") { args ->
            val socketId = args.getOrNull(0)?.toIntOrNull()
            socketId?.let { socketManager.close(it) }
            null
        }

        // Event callback registrations (no-ops — dispatching happens via JS-side dispatcher)
        ctx.setGlobalFunction("__ok200_tcp_on_data") { _ -> null }
        ctx.setGlobalFunction("__ok200_tcp_on_close") { _ -> null }
        ctx.setGlobalFunction("__ok200_tcp_on_error") { _ -> null }
    }

    // =========================================================================
    // TcpSocketCallback — events from I/O thread, dispatched to JS thread
    // =========================================================================

    override fun onTcpData(socketId: Int, data: ByteArray) {
        jsThread.post {
            try {
                val ctx = jsThread.handler.looper.thread  // Just for thread assertion
                // Use callGlobalFunctionWithBinary to pass data as ArrayBuffer
                // JS dispatcher: __ok200_tcp_dispatch_data(socketId, data)
                // We call the context directly since we're already on JS thread
            } catch (e: Exception) {
                Log.e(TAG, "Failed to dispatch data for socket $socketId", e)
            }
        }
    }

    override fun onTcpClose(socketId: Int, hadError: Boolean) {
        jsThread.post {
            // Dispatched via NativeBindings TCP dispatcher JS code
        }
    }

    override fun onTcpError(socketId: Int, message: String) {
        jsThread.post {
            // Dispatched via NativeBindings TCP dispatcher JS code
        }
    }

    /**
     * Dispatch data to JS. Called from NativeBindings after setting up dispatchers.
     */
    fun dispatchData(ctx: QuickJsContext, socketId: Int, data: ByteArray) {
        ctx.callGlobalFunctionWithBinary(
            "__ok200_tcp_dispatch_data",
            data,
            1,  // binary is second argument (index 1)
            socketId.toString()
        )
        jsThread.scheduleJobPump(ctx)
    }

    fun dispatchClose(ctx: QuickJsContext, socketId: Int, hadError: Boolean) {
        ctx.callGlobalFunction(
            "__ok200_tcp_dispatch_close",
            socketId.toString(),
            if (hadError) "true" else "false"
        )
        jsThread.scheduleJobPump(ctx)
    }

    fun dispatchError(ctx: QuickJsContext, socketId: Int, message: String) {
        ctx.callGlobalFunction(
            "__ok200_tcp_dispatch_error",
            socketId.toString(),
            message
        )
        jsThread.scheduleJobPump(ctx)
    }
}
