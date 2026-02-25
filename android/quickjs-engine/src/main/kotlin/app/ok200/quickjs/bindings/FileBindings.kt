package app.ok200.quickjs.bindings

import android.net.Uri
import android.util.Log
import app.ok200.io.file.FileManager
import app.ok200.quickjs.QuickJsContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val TAG = "FileBindings"

/**
 * File I/O bindings for QuickJS.
 *
 * Provides read-only filesystem operations for serving static files.
 * All paths are relative to the configured root URI.
 */
class FileBindings(
    private val fileManager: FileManager,
    private val rootUriProvider: () -> Uri?
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun register(ctx: QuickJsContext) {
        // __ok200_file_stat(path): string (JSON)
        ctx.setGlobalFunction("__ok200_file_stat") { args ->
            val path = args.getOrNull(0) ?: ""
            val rootUri = rootUriProvider() ?: return@setGlobalFunction null
            val stat = fileManager.stat(rootUri, normalizePath(path)) ?: return@setGlobalFunction null
            """{"size":${stat.size},"mtime":${stat.mtime},"isDirectory":${stat.isDirectory},"isFile":${stat.isFile}}"""
        }

        // __ok200_file_exists(path): string ("true"/"false")
        ctx.setGlobalFunction("__ok200_file_exists") { args ->
            val path = args.getOrNull(0) ?: ""
            val rootUri = rootUriProvider() ?: return@setGlobalFunction "false"
            if (fileManager.exists(rootUri, normalizePath(path))) "true" else "false"
        }

        // __ok200_file_read(path, offset, length): ArrayBuffer
        ctx.setGlobalFunctionReturnsBinary("__ok200_file_read") { args, _ ->
            val path = args.getOrNull(0) ?: return@setGlobalFunctionReturnsBinary null
            val offset = args.getOrNull(1)?.toLongOrNull() ?: 0L
            val length = args.getOrNull(2)?.toIntOrNull() ?: return@setGlobalFunctionReturnsBinary null
            val rootUri = rootUriProvider() ?: return@setGlobalFunctionReturnsBinary null
            fileManager.read(rootUri, normalizePath(path), offset, length)
        }

        // __ok200_file_readdir(path): string (JSON array)
        ctx.setGlobalFunction("__ok200_file_readdir") { args ->
            val path = args.getOrNull(0) ?: ""
            val rootUri = rootUriProvider() ?: return@setGlobalFunction null
            val entries = fileManager.readdir(rootUri, normalizePath(path)) ?: return@setGlobalFunction null
            json.encodeToString(entries)
        }

        // __ok200_file_realpath(path): string
        ctx.setGlobalFunction("__ok200_file_realpath") { args ->
            val path = args.getOrNull(0) ?: ""
            val rootUri = rootUriProvider() ?: return@setGlobalFunction null
            fileManager.realpath(rootUri, normalizePath(path))
        }

        // __ok200_file_list_tree(path): string (JSON array of {path, size})
        ctx.setGlobalFunction("__ok200_file_list_tree") { args ->
            val path = args.getOrNull(0) ?: ""
            val rootUri = rootUriProvider() ?: return@setGlobalFunction "[]"
            val entries = fileManager.listTree(rootUri, normalizePath(path))
            val jsonEntries = entries.joinToString(",") { entry ->
                """{"path":"${escapeJson(entry.path)}","size":${entry.size}}"""
            }
            "[$jsonEntries]"
        }
    }

    /**
     * Normalize path: strip leading slash, handle empty/root path.
     */
    private fun normalizePath(path: String): String {
        return path.trimStart('/').trim()
    }

    private fun escapeJson(s: String): String {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
    }
}
