package app.ok200.quickjs

import androidx.annotation.Keep
import java.io.Closeable

/**
 * A QuickJS JavaScript runtime context.
 *
 * Thread-safety: QuickJS is single-threaded. All calls to a context
 * must happen on the same thread that created it.
 */
class QuickJsContext private constructor(
    private var contextPtr: Long
) : Closeable {

    companion object {
        init {
            System.loadLibrary("quickjs-jni")
        }

        fun create(): QuickJsContext {
            val ptr = nativeCreate()
            if (ptr == 0L) {
                throw QuickJsException("Failed to create QuickJS context")
            }
            return QuickJsContext(ptr)
        }

        @JvmStatic
        private external fun nativeCreate(): Long

        @JvmStatic
        private external fun nativeDestroy(ctxPtr: Long)

        @JvmStatic
        private external fun nativeEvaluate(ctxPtr: Long, script: String, filename: String): Any?

        @JvmStatic
        private external fun nativeSetGlobalFunction(ctxPtr: Long, name: String, callback: JsCallback)

        @JvmStatic
        private external fun nativeExecutePendingJob(ctxPtr: Long): Boolean

        @JvmStatic
        private external fun nativeSetGlobalFunctionWithBinary(
            ctxPtr: Long,
            name: String,
            callback: Any,
            binaryArgIndex: Int,
            returnsBinary: Boolean
        )

        @JvmStatic
        private external fun nativeCallGlobalFunction(
            ctxPtr: Long,
            funcName: String,
            args: Array<String?>?,
            binaryArg: ByteArray?,
            binaryArgIndex: Int
        ): Any?
    }

    fun evaluate(script: String, filename: String = "script.js"): Any? {
        checkNotClosed()
        return nativeEvaluate(contextPtr, script, filename)
    }

    inline fun <reified T> evaluateTyped(script: String, filename: String = "script.js"): T {
        return evaluate(script, filename) as T
    }

    fun setGlobalFunction(name: String, callback: (Array<String>) -> String?) {
        checkNotClosed()
        nativeSetGlobalFunction(contextPtr, name, JsCallback(callback))
    }

    fun setGlobalFunctionWithBinary(
        name: String,
        binaryArgIndex: Int,
        callback: (args: Array<String>, binary: ByteArray?) -> String?
    ) {
        checkNotClosed()
        nativeSetGlobalFunctionWithBinary(
            contextPtr,
            name,
            JsBinaryCallback(callback),
            binaryArgIndex,
            false
        )
    }

    fun setGlobalFunctionReturnsBinary(
        name: String,
        binaryArgIndex: Int = -1,
        callback: (args: Array<String>, binary: ByteArray?) -> ByteArray?
    ) {
        checkNotClosed()
        nativeSetGlobalFunctionWithBinary(
            contextPtr,
            name,
            JsBinaryReturnCallback(callback),
            binaryArgIndex,
            true
        )
    }

    fun callGlobalFunction(funcName: String, vararg args: String?): Any? {
        checkNotClosed()
        return nativeCallGlobalFunction(
            contextPtr,
            funcName,
            if (args.isEmpty()) null else args.toList().toTypedArray(),
            null,
            -1
        )
    }

    fun callGlobalFunctionWithBinary(
        funcName: String,
        binaryArg: ByteArray,
        binaryArgIndex: Int,
        vararg args: String?
    ): Any? {
        checkNotClosed()
        return nativeCallGlobalFunction(
            contextPtr,
            funcName,
            if (args.isEmpty()) null else args.toList().toTypedArray(),
            binaryArg,
            binaryArgIndex
        )
    }

    fun executePendingJob(): Boolean {
        checkNotClosed()
        return nativeExecutePendingJob(contextPtr)
    }

    fun executeAllPendingJobs() {
        var count = 0
        val start = System.currentTimeMillis()
        while (executePendingJob()) {
            count++
            if (count % 1000 == 0) {
                android.util.Log.d("QuickJsContext", "executeAllPendingJobs: $count jobs in ${System.currentTimeMillis() - start}ms")
            }
        }
        val elapsed = System.currentTimeMillis() - start
        if (elapsed > 50 || count > 100) {
            android.util.Log.w("QuickJsContext", "executeAllPendingJobs: completed $count jobs in ${elapsed}ms")
        } else if (count > 0) {
            android.util.Log.d("QuickJsContext", "executeAllPendingJobs: completed $count jobs in ${elapsed}ms")
        }
    }

    fun pumpJobsBatched(maxJobs: Int = 50): Boolean {
        var count = 0
        while (count < maxJobs && executePendingJob()) {
            count++
        }
        return executePendingJob()
    }

    fun isClosed(): Boolean = contextPtr == 0L

    private fun checkNotClosed() {
        if (contextPtr == 0L) {
            throw IllegalStateException("QuickJsContext is closed")
        }
    }

    override fun close() {
        if (contextPtr != 0L) {
            nativeDestroy(contextPtr)
            contextPtr = 0L
        }
    }

    @Suppress("removal")
    protected fun finalize() {
        close()
    }
}

@Keep
internal class JsCallback(
    private val callback: (Array<String>) -> String?
) {
    @Keep
    fun invoke(args: Array<String>): String? = callback(args)
}

@Keep
internal class JsBinaryCallback(
    private val callback: (Array<String>, ByteArray?) -> String?
) {
    @Keep
    fun invoke(args: Array<String>, binary: ByteArray?): String? = callback(args, binary)
}

@Keep
internal class JsBinaryReturnCallback(
    private val callback: (Array<String>, ByteArray?) -> ByteArray?
) {
    @Keep
    fun invoke(args: Array<String>, binary: ByteArray?): ByteArray? = callback(args, binary)
}
