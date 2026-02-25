package app.ok200.quickjs

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

private const val TAG = "JsThread"

/**
 * Dedicated thread for QuickJS execution.
 *
 * All JS execution happens on this single thread via Android Handler/Looper.
 * I/O callbacks post work back to this thread via post {}.
 */
class JsThread : Thread("quickjs-engine") {
    lateinit var handler: Handler
        private set

    private val ready = CountDownLatch(1)
    private val nextTimerId = AtomicInteger(1)
    private val timers = ConcurrentHashMap<Int, Runnable>()

    override fun run() {
        Looper.prepare()
        handler = Handler(Looper.myLooper()!!)
        ready.countDown()
        Looper.loop()
    }

    fun waitUntilReady() {
        ready.await()
    }

    fun post(runnable: Runnable): Boolean {
        return handler.post(runnable)
    }

    fun post(block: () -> Unit): Boolean {
        return handler.post(block)
    }

    fun setTimeout(delayMs: Long, callback: () -> Unit): Int {
        val timerId = nextTimerId.getAndIncrement()
        val runnable = Runnable {
            timers.remove(timerId)
            callback()
        }
        timers[timerId] = runnable
        handler.postDelayed(runnable, delayMs)
        return timerId
    }

    fun clearTimeout(timerId: Int) {
        timers.remove(timerId)?.let { runnable ->
            handler.removeCallbacks(runnable)
        }
    }

    fun setInterval(intervalMs: Long, callback: () -> Unit): Int {
        val intervalId = nextTimerId.getAndIncrement()
        val runnable = object : Runnable {
            override fun run() {
                if (timers.containsKey(intervalId)) {
                    callback()
                    handler.postDelayed(this, intervalMs)
                }
            }
        }
        timers[intervalId] = runnable
        handler.postDelayed(runnable, intervalMs)
        return intervalId
    }

    fun clearInterval(intervalId: Int) {
        timers.remove(intervalId)?.let { runnable ->
            handler.removeCallbacks(runnable)
        }
    }

    fun clearAllTimers() {
        timers.forEach { (_, runnable) ->
            handler.removeCallbacks(runnable)
        }
        timers.clear()
    }

    fun quit() {
        handler.looper.quit()
    }

    @Volatile
    private var jobPumpScheduled = false

    /**
     * Schedule a batched job pump for the given context.
     * Processes jobs in batches, yielding between to allow callbacks to be delivered.
     */
    fun scheduleJobPump(ctx: QuickJsContext, batchSize: Int = 50) {
        if (jobPumpScheduled) return
        jobPumpScheduled = true

        post {
            pumpJobsInternal(ctx, batchSize)
        }
    }

    private fun pumpJobsInternal(ctx: QuickJsContext, batchSize: Int) {
        val hasMore = ctx.pumpJobsBatched(batchSize)

        if (hasMore) {
            post {
                pumpJobsInternal(ctx, batchSize)
            }
        } else {
            jobPumpScheduled = false
        }
    }
}
