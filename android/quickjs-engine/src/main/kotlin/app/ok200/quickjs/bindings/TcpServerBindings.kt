package app.ok200.quickjs.bindings

import android.util.Log
import app.ok200.io.socket.TcpServerCallback
import app.ok200.io.socket.TcpServerManager
import app.ok200.quickjs.JsThread
import app.ok200.quickjs.QuickJsContext
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "TcpServerBindings"

/**
 * TCP server bindings for QuickJS.
 *
 * Registers __ok200_tcp_server_* functions for creating, listening on,
 * and closing server sockets.
 */
class TcpServerBindings(
    private val jsThread: JsThread,
    private val serverManager: TcpServerManager
) : TcpServerCallback {

    private val nextServerId = AtomicInteger(1)

    init {
        serverManager.setCallback(this)
    }

    fun register(ctx: QuickJsContext) {
        // __ok200_tcp_server_create(): string (serverId)
        ctx.setGlobalFunction("__ok200_tcp_server_create") { _ ->
            nextServerId.getAndIncrement().toString()
        }

        // __ok200_tcp_server_listen(serverId, port, host): void
        ctx.setGlobalFunction("__ok200_tcp_server_listen") { args ->
            val serverId = args.getOrNull(0)?.toIntOrNull() ?: return@setGlobalFunction null
            val port = args.getOrNull(1)?.toIntOrNull() ?: 8080
            val host = args.getOrNull(2) ?: "0.0.0.0"
            serverManager.listen(serverId, port, host)
            null
        }

        // __ok200_tcp_server_close(serverId): void
        ctx.setGlobalFunction("__ok200_tcp_server_close") { args ->
            val serverId = args.getOrNull(0)?.toIntOrNull()
            serverId?.let { serverManager.stopListen(it) }
            null
        }

        // __ok200_tcp_server_address(serverId): string (JSON {port})
        ctx.setGlobalFunction("__ok200_tcp_server_address") { args ->
            val serverId = args.getOrNull(0)?.toIntOrNull() ?: return@setGlobalFunction null
            val port = serverManager.address(serverId) ?: return@setGlobalFunction null
            """{"port":$port}"""
        }

        // Event callback registrations (dispatched via JS-side dispatcher code)
        ctx.setGlobalFunction("__ok200_tcp_on_listening") { _ -> null }
        ctx.setGlobalFunction("__ok200_tcp_on_accept") { _ -> null }
    }

    // =========================================================================
    // TcpServerCallback — events from I/O thread, dispatched to JS thread
    // =========================================================================

    override fun onTcpListenResult(serverId: Int, success: Boolean, boundPort: Int, errorCode: String?) {
        jsThread.post {
            // Dispatched via NativeBindings TCP dispatcher JS code
        }
    }

    override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {
        jsThread.post {
            // Dispatched via NativeBindings TCP dispatcher JS code
        }
    }

    fun dispatchListening(ctx: QuickJsContext, serverId: Int, success: Boolean, port: Int) {
        ctx.callGlobalFunction(
            "__ok200_tcp_dispatch_listening",
            serverId.toString(),
            if (success) "true" else "false",
            port.toString()
        )
        jsThread.scheduleJobPump(ctx)
    }

    fun dispatchAccept(ctx: QuickJsContext, serverId: Int, socketId: Int, remoteAddr: String, remotePort: Int) {
        ctx.callGlobalFunction(
            "__ok200_tcp_dispatch_accept",
            serverId.toString(),
            socketId.toString(),
            remoteAddr,
            remotePort.toString()
        )
        jsThread.scheduleJobPump(ctx)
    }
}
