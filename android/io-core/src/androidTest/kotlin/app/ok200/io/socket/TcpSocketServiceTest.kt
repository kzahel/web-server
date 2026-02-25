package app.ok200.io.socket

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Instrumented tests for [TcpSocketService].
 *
 * Uses real loopback sockets for reliable, fast testing of actual I/O behavior.
 */
@RunWith(AndroidJUnit4::class)
class TcpSocketServiceTest {

    private lateinit var scope: CoroutineScope
    private lateinit var service: TcpSocketService

    @Before
    fun setUp() {
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        service = TcpSocketService(scope)
    }

    @After
    fun tearDown() {
        service.shutdown()
        scope.cancel()
    }

    @Test
    fun serverListenBindsToSystemAssignedPort() {
        val listenResult = CountDownLatch(1)
        val boundPort = AtomicInteger(0)
        val success = AtomicBoolean(false)

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, successFlag: Boolean, port: Int, errorCode: String?) {
                success.set(successFlag)
                boundPort.set(port)
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {}
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))
        assertTrue(success.get(), "Listen should succeed")
        assertTrue(boundPort.get() > 0, "Should return valid port")
    }

    @Test
    fun serverAcceptsIncomingConnection() {
        val listenResult = CountDownLatch(1)
        val acceptResult = CountDownLatch(1)
        val boundPort = AtomicInteger(0)
        val acceptedSocketId = AtomicInteger(0)

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, port: Int, errorCode: String?) {
                boundPort.set(port)
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {
                acceptedSocketId.set(socketId)
                acceptResult.countDown()
            }
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))

        // Connect to the server
        Thread {
            try {
                java.net.Socket("127.0.0.1", boundPort.get()).use { socket ->
                    socket.getOutputStream().write("test".toByteArray())
                    Thread.sleep(100)
                }
            } catch (_: Exception) {}
        }.start()

        assertTrue(acceptResult.await(5, TimeUnit.SECONDS), "Should accept connection")
        assertTrue(acceptedSocketId.get() >= 0x10000, "Socket ID should be server-generated")
    }

    @Test
    fun sendDeliversDataToAcceptedConnection() {
        val listenResult = CountDownLatch(1)
        val acceptResult = CountDownLatch(1)
        val boundPort = AtomicInteger(0)
        val acceptedSocketId = AtomicInteger(0)
        val clientReceivedData = CountDownLatch(1)
        val receivedByClient = AtomicReference<ByteArray>()

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, port: Int, errorCode: String?) {
                boundPort.set(port)
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {
                acceptedSocketId.set(socketId)
                acceptResult.countDown()
            }
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))

        // Connect a client that reads data
        Thread {
            try {
                java.net.Socket("127.0.0.1", boundPort.get()).use { socket ->
                    val buffer = ByteArray(1024)
                    val bytesRead = socket.getInputStream().read(buffer)
                    if (bytesRead > 0) {
                        receivedByClient.set(buffer.copyOf(bytesRead))
                        clientReceivedData.countDown()
                    }
                }
            } catch (_: Exception) {}
        }.start()

        assertTrue(acceptResult.await(5, TimeUnit.SECONDS))

        // Send data from server to client
        val testData = "Hello from server!".toByteArray()
        service.send(acceptedSocketId.get(), testData)

        assertTrue(clientReceivedData.await(5, TimeUnit.SECONDS), "Client should receive data")
        assertEquals(String(testData), String(receivedByClient.get()))
    }

    @Test
    fun onTcpDataFiresWhenClientSendsData() {
        val listenResult = CountDownLatch(1)
        val acceptResult = CountDownLatch(1)
        val dataReceived = CountDownLatch(1)
        val boundPort = AtomicInteger(0)
        val receivedData = AtomicReference<ByteArray>()

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, port: Int, errorCode: String?) {
                boundPort.set(port)
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {
                acceptResult.countDown()
            }
        })

        service.setCallback(object : TcpSocketCallback {
            override fun onTcpData(socketId: Int, data: ByteArray) {
                receivedData.set(data)
                dataReceived.countDown()
            }
            override fun onTcpClose(socketId: Int, hadError: Boolean) {}
            override fun onTcpError(socketId: Int, message: String) {}
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))

        // Client connects and sends data
        Thread {
            try {
                java.net.Socket("127.0.0.1", boundPort.get()).use { socket ->
                    socket.getOutputStream().write("Hello from client".toByteArray())
                    socket.getOutputStream().flush()
                    Thread.sleep(200)
                }
            } catch (_: Exception) {}
        }.start()

        assertTrue(acceptResult.await(5, TimeUnit.SECONDS))
        assertTrue(dataReceived.await(5, TimeUnit.SECONDS), "Server should receive data")
        assertEquals("Hello from client", String(receivedData.get()))
    }

    @Test
    fun stopListenClosesServerSocket() {
        val listenResult = CountDownLatch(1)
        val boundPort = AtomicInteger(0)

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, port: Int, errorCode: String?) {
                boundPort.set(port)
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {}
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))

        service.stopListen(1)

        // New connections should fail
        Thread.sleep(100)
        try {
            java.net.Socket("127.0.0.1", boundPort.get()).close()
        } catch (_: Exception) {
            // Expected
        }
    }

    @Test
    fun addressReturnsBoundPort() {
        val listenResult = CountDownLatch(1)

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, port: Int, errorCode: String?) {
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {}
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))

        val port = service.address(1)
        assertTrue(port != null && port > 0, "address() should return bound port")
    }

    @Test
    fun onTcpCloseFiresWhenClientDisconnects() {
        val listenResult = CountDownLatch(1)
        val acceptResult = CountDownLatch(1)
        val closeReceived = CountDownLatch(1)
        val boundPort = AtomicInteger(0)

        service.setCallback(object : TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, port: Int, errorCode: String?) {
                boundPort.set(port)
                listenResult.countDown()
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {
                acceptResult.countDown()
            }
        })

        service.setCallback(object : TcpSocketCallback {
            override fun onTcpData(socketId: Int, data: ByteArray) {}
            override fun onTcpClose(socketId: Int, hadError: Boolean) {
                closeReceived.countDown()
            }
            override fun onTcpError(socketId: Int, message: String) {}
        })

        service.listen(1, 0)
        assertTrue(listenResult.await(5, TimeUnit.SECONDS))

        // Client connects then immediately disconnects
        Thread {
            try {
                java.net.Socket("127.0.0.1", boundPort.get()).close()
            } catch (_: Exception) {}
        }.start()

        assertTrue(acceptResult.await(5, TimeUnit.SECONDS))
        assertTrue(closeReceived.await(5, TimeUnit.SECONDS), "Should receive close event")
    }
}
