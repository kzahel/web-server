package app.ok200.quickjs.bindings

import app.ok200.quickjs.QuickJsContext

/**
 * Listener for engine state updates.
 */
interface EngineStateListener {
    fun onStateChanged(stateJson: String)
}

/**
 * Listener for engine errors.
 */
interface EngineErrorListener {
    fun onError(message: String)
}

/**
 * Callback bindings for engine state and error reporting.
 *
 * The JS engine calls __ok200_report_state and __ok200_report_error
 * to notify the Kotlin host of state changes.
 */
class CallbackBindings {
    var stateListener: EngineStateListener? = null
    var errorListener: EngineErrorListener? = null

    fun register(ctx: QuickJsContext) {
        // __ok200_report_state(stateJson): void
        ctx.setGlobalFunction("__ok200_report_state") { args ->
            val stateJson = args.getOrNull(0) ?: return@setGlobalFunction null
            stateListener?.onStateChanged(stateJson)
            null
        }

        // __ok200_report_error(message): void
        ctx.setGlobalFunction("__ok200_report_error") { args ->
            val message = args.getOrNull(0) ?: "Unknown error"
            errorListener?.onError(message)
            null
        }
    }
}
