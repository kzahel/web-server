package app.ok200.io.socket

/**
 * Callback interface for TCP socket events.
 */
interface TcpSocketCallback {
    fun onTcpData(socketId: Int, data: ByteArray)
    fun onTcpClose(socketId: Int, hadError: Boolean)
    fun onTcpError(socketId: Int, message: String)
}

/**
 * Callback interface for TCP server events.
 */
interface TcpServerCallback {
    fun onTcpListenResult(serverId: Int, success: Boolean, boundPort: Int, errorCode: String?)
    fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int)
}

/**
 * Interface for TCP socket operations (read/write on accepted connections).
 */
interface TcpSocketManager {
    fun send(socketId: Int, data: ByteArray): Boolean
    fun close(socketId: Int)
    fun setCallback(callback: TcpSocketCallback)
}

/**
 * Interface for TCP server operations (listen/accept).
 */
interface TcpServerManager {
    fun listen(serverId: Int, port: Int, host: String = "0.0.0.0")
    fun stopListen(serverId: Int)
    fun address(serverId: Int): Int?
    fun setCallback(callback: TcpServerCallback)
}
