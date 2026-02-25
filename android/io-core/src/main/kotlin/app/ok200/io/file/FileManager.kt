package app.ok200.io.file

import android.net.Uri

/**
 * File stat result.
 */
data class FileStat(
    val size: Long,
    val mtime: Long,
    val isDirectory: Boolean,
    val isFile: Boolean
)

/**
 * Entry from a recursive directory listing.
 */
data class FileTreeEntry(
    val path: String,
    val size: Long
)

/**
 * Abstract file manager interface for read-only file serving.
 *
 * Supports both SAF (content://) and native (file://) URIs.
 */
interface FileManager {
    fun stat(rootUri: Uri, relativePath: String): FileStat?
    fun exists(rootUri: Uri, relativePath: String): Boolean
    fun read(rootUri: Uri, relativePath: String, offset: Long, length: Int): ByteArray?
    fun readdir(rootUri: Uri, relativePath: String): List<String>?
    fun listTree(rootUri: Uri, relativePath: String = ""): List<FileTreeEntry>
    fun realpath(rootUri: Uri, relativePath: String): String?
}
