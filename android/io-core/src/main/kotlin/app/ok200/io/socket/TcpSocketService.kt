package app.ok200.io.socket

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.channels.SocketChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "TcpSocketService"
private const val RECEIVE_BUFFER_SIZE = 64 * 1024  // 64KB for HTTP
private const val ACCEPTED_SOCKET_ID_BASE = 0x10000

/**
 * TCP socket service for the web server.
 *
 * Handles server sockets (listen/accept) and accepted client connection I/O.
 * Simplified from JSTorrent's TcpSocketService — no TLS, no client connect.
 */
class TcpSocketService(
    private val scope: CoroutineScope
) : TcpSocketManager, TcpServerManager {

    private var socketCallback: TcpSocketCallback? = null
    private var serverCallback: TcpServerCallback? = null

    private val nextSocketId = AtomicInteger(ACCEPTED_SOCKET_ID_BASE)
    private val servers = ConcurrentHashMap<Int, ServerHandler>()
    private val connections = ConcurrentHashMap<Int, ActiveConnection>()

    // =========================================================================
    // TcpSocketManager
    // =========================================================================

    override fun send(socketId: Int, data: ByteArray): Boolean {
        val conn = connections[socketId] ?: return false
        return try {
            conn.channel.write(ByteBuffer.wrap(data))
            true
        } catch (e: IOException) {
            Log.w(TAG, "send($socketId) failed: ${e.message}")
            closeConnection(socketId, hadError = true)
            false
        }
    }

    override fun close(socketId: Int) {
        closeConnection(socketId, hadError = false)
    }

    override fun setCallback(callback: TcpSocketCallback) {
        this.socketCallback = callback
    }

    // =========================================================================
    // TcpServerManager
    // =========================================================================

    override fun listen(serverId: Int, port: Int, host: String) {
        scope.launch(Dispatchers.IO) {
            try {
                val serverSocket = ServerSocket()
                serverSocket.reuseAddress = true
                serverSocket.bind(InetSocketAddress(host, port))
                val boundPort = serverSocket.localPort

                val handler = ServerHandler(serverId, serverSocket)
                servers[serverId] = handler
                handler.startAcceptLoop()

                serverCallback?.onTcpListenResult(serverId, true, boundPort, null)
                Log.i(TAG, "Server $serverId listening on $host:$boundPort")
            } catch (e: Exception) {
                Log.e(TAG, "Server $serverId listen failed: ${e.message}")
                serverCallback?.onTcpListenResult(serverId, false, 0, e.message)
            }
        }
    }

    override fun stopListen(serverId: Int) {
        servers.remove(serverId)?.close()
        Log.i(TAG, "Server $serverId stopped")
    }

    override fun address(serverId: Int): Int? {
        return servers[serverId]?.serverSocket?.localPort
    }

    override fun setCallback(callback: TcpServerCallback) {
        this.serverCallback = callback
    }

    // =========================================================================
    // Shutdown
    // =========================================================================

    fun shutdown() {
        servers.keys.toList().forEach { stopListen(it) }
        connections.keys.toList().forEach { close(it) }
    }

    // =========================================================================
    // Internal
    // =========================================================================

    private fun closeConnection(socketId: Int, hadError: Boolean) {
        val conn = connections.remove(socketId) ?: return
        conn.readJob?.cancel()
        try {
            conn.channel.close()
        } catch (_: IOException) {}
        socketCallback?.onTcpClose(socketId, hadError)
    }

    private inner class ServerHandler(
        val serverId: Int,
        val serverSocket: ServerSocket
    ) {
        private var acceptJob: Job? = null

        fun startAcceptLoop() {
            acceptJob = scope.launch(Dispatchers.IO) {
                while (!serverSocket.isClosed) {
                    try {
                        val clientSocket = serverSocket.accept()
                        clientSocket.tcpNoDelay = true
                        clientSocket.receiveBufferSize = RECEIVE_BUFFER_SIZE

                        val socketId = nextSocketId.getAndIncrement()
                        val channel = clientSocket.channel ?: SocketChannel.open().also {
                            // If accept() returned a Socket without a channel, wrap it
                            // This shouldn't normally happen with ServerSocket
                        }

                        val peerAddr = clientSocket.inetAddress?.hostAddress ?: "unknown"
                        val peerPort = clientSocket.port

                        val conn = ActiveConnection(socketId, clientSocket, channel)
                        connections[socketId] = conn
                        conn.startReadLoop()

                        serverCallback?.onTcpAccepted(serverId, socketId, peerAddr, peerPort)
                    } catch (e: IOException) {
                        if (!serverSocket.isClosed) {
                            Log.e(TAG, "Accept error on server $serverId: ${e.message}")
                        }
                    }
                }
            }
        }

        fun close() {
            acceptJob?.cancel()
            try {
                serverSocket.close()
            } catch (_: IOException) {}
        }
    }

    private inner class ActiveConnection(
        val socketId: Int,
        val socket: Socket,
        val channel: SocketChannel
    ) {
        var readJob: Job? = null

        fun startReadLoop() {
            readJob = scope.launch(Dispatchers.IO) {
                val buffer = ByteArray(RECEIVE_BUFFER_SIZE)
                try {
                    val input = socket.getInputStream()
                    while (!socket.isClosed) {
                        val bytesRead = input.read(buffer)
                        if (bytesRead == -1) {
                            closeConnection(socketId, hadError = false)
                            break
                        }
                        if (bytesRead > 0) {
                            val data = buffer.copyOf(bytesRead)
                            socketCallback?.onTcpData(socketId, data)
                        }
                    }
                } catch (e: IOException) {
                    if (!socket.isClosed) {
                        socketCallback?.onTcpError(socketId, e.message ?: "Read error")
                        closeConnection(socketId, hadError = true)
                    }
                }
            }
        }
    }
}
