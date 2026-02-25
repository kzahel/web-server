package app.ok200.quickjs

import android.util.Log
import java.io.Closeable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val TAG = "QuickJsEngine"

/**
 * High-level QuickJS engine wrapper.
 *
 * Owns a dedicated JS thread and QuickJS context, ensuring all JS execution
 * happens on the correct thread.
 */
class QuickJsEngine : Closeable {
    val jsThread = JsThread()
    lateinit var context: QuickJsContext
        private set

    private val contextReady = CountDownLatch(1)
    private val nextPromiseCallbackId = AtomicInteger(1)
    private val pendingPromiseCallbacks = ConcurrentHashMap<Int, CancellableContinuation<String?>>()
    @Volatile
    private var closed = false

    init {
        jsThread.start()
        jsThread.waitUntilReady()

        jsThread.post {
            context = QuickJsContext.create()
            contextReady.countDown()
        }
        contextReady.await()
    }

    fun evaluate(script: String, filename: String = "script.js"): Any? {
        val result = AtomicReference<Any?>()
        val error = AtomicReference<Throwable?>()
        val latch = CountDownLatch(1)

        jsThread.post {
            try {
                result.set(context.evaluate(script, filename))
            } catch (e: Throwable) {
                error.set(e)
            } finally {
                latch.countDown()
            }
        }

        latch.await()
        error.get()?.let { throw it }
        return result.get()
    }

    fun setGlobalFunction(name: String, callback: (Array<String>) -> String?) {
        val latch = CountDownLatch(1)
        jsThread.post {
            context.setGlobalFunction(name, callback)
            latch.countDown()
        }
        latch.await()
    }

    fun setGlobalFunctionWithBinary(
        name: String,
        binaryArgIndex: Int,
        callback: (args: Array<String>, binary: ByteArray?) -> String?
    ) {
        val latch = CountDownLatch(1)
        jsThread.post {
            context.setGlobalFunctionWithBinary(name, binaryArgIndex, callback)
            latch.countDown()
        }
        latch.await()
    }

    fun setGlobalFunctionReturnsBinary(
        name: String,
        binaryArgIndex: Int = -1,
        callback: (args: Array<String>, binary: ByteArray?) -> ByteArray?
    ) {
        val latch = CountDownLatch(1)
        jsThread.post {
            context.setGlobalFunctionReturnsBinary(name, binaryArgIndex, callback)
            latch.countDown()
        }
        latch.await()
    }

    fun callGlobalFunction(funcName: String, vararg args: String?): Any? {
        val result = AtomicReference<Any?>()
        val error = AtomicReference<Throwable?>()
        val latch = CountDownLatch(1)

        jsThread.post {
            try {
                result.set(context.callGlobalFunction(funcName, *args))
            } catch (e: Throwable) {
                error.set(e)
            } finally {
                latch.countDown()
            }
        }

        latch.await()
        error.get()?.let { throw it }
        return result.get()
    }

    fun callGlobalFunctionWithBinary(
        funcName: String,
        binaryArg: ByteArray,
        binaryArgIndex: Int,
        vararg args: String?
    ): Any? {
        val result = AtomicReference<Any?>()
        val error = AtomicReference<Throwable?>()
        val latch = CountDownLatch(1)

        jsThread.post {
            try {
                result.set(context.callGlobalFunctionWithBinary(funcName, binaryArg, binaryArgIndex, *args))
            } catch (e: Throwable) {
                error.set(e)
            } finally {
                latch.countDown()
            }
        }

        latch.await()
        error.get()?.let { throw it }
        return result.get()
    }

    fun executeAllPendingJobs() {
        val latch = CountDownLatch(1)
        jsThread.post {
            context.executeAllPendingJobs()
            latch.countDown()
        }
        latch.await()
    }

    fun setTimeout(delayMs: Long, callback: () -> Unit): Int {
        return jsThread.setTimeout(delayMs, callback)
    }

    fun clearTimeout(timerId: Int) {
        jsThread.clearTimeout(timerId)
    }

    fun setInterval(intervalMs: Long, callback: () -> Unit): Int {
        return jsThread.setInterval(intervalMs, callback)
    }

    fun clearInterval(intervalId: Int) {
        jsThread.clearInterval(intervalId)
    }

    fun post(block: () -> Unit) {
        jsThread.post(block)
    }

    fun postAndWait(block: () -> Unit) {
        val error = AtomicReference<Throwable?>()
        val latch = CountDownLatch(1)
        jsThread.post {
            try {
                block()
            } catch (e: Throwable) {
                error.set(e)
            } finally {
                latch.countDown()
            }
        }
        latch.await()
        error.get()?.let { throw it }
    }

    suspend fun callGlobalFunctionAsync(funcName: String, vararg args: String?): Any? {
        return suspendCancellableCoroutine { cont ->
            jsThread.post {
                try {
                    val result = context.callGlobalFunction(funcName, *args)
                    cont.resume(result)
                } catch (e: Throwable) {
                    cont.resumeWithException(e)
                }
            }
        }
    }

    override fun close() {
        closed = true

        pendingPromiseCallbacks.forEach { (_, cont) ->
            try {
                cont.resumeWithException(QuickJsException("Engine closed while awaiting promise"))
            } catch (_: IllegalStateException) {}
        }
        pendingPromiseCallbacks.clear()

        jsThread.clearAllTimers()
        jsThread.post {
            context.close()
        }

        jsThread.quit()
        jsThread.join(1000)

        if (jsThread.isAlive) {
            Log.w(TAG, "JS thread did not terminate within 1s, interrupting")
            jsThread.interrupt()
            jsThread.join(500)
        }
    }
}
