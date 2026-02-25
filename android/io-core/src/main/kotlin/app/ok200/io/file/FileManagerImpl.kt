package app.ok200.io.file

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.DocumentsContract
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile

private const val TAG = "FileManager"

/**
 * File manager implementation supporting both SAF and native file URIs.
 *
 * Simplified from JSTorrent — read-only operations for serving static files.
 */
class FileManagerImpl(
    private val context: Context
) : FileManager {

    override fun stat(rootUri: Uri, relativePath: String): FileStat? {
        return try {
            if (rootUri.scheme == "file") {
                statNative(rootUri, relativePath)
            } else {
                statSaf(rootUri, relativePath)
            }
        } catch (e: Exception) {
            Log.w(TAG, "stat failed: $relativePath", e)
            null
        }
    }

    override fun exists(rootUri: Uri, relativePath: String): Boolean {
        return try {
            if (rootUri.scheme == "file") {
                resolveNativePath(rootUri, relativePath).exists()
            } else {
                findSafDocument(rootUri, relativePath) != null
            }
        } catch (e: Exception) {
            false
        }
    }

    override fun read(rootUri: Uri, relativePath: String, offset: Long, length: Int): ByteArray? {
        return try {
            if (rootUri.scheme == "file") {
                readNative(rootUri, relativePath, offset, length)
            } else {
                readSaf(rootUri, relativePath, offset, length)
            }
        } catch (e: Exception) {
            Log.w(TAG, "read failed: $relativePath offset=$offset len=$length", e)
            null
        }
    }

    override fun readdir(rootUri: Uri, relativePath: String): List<String>? {
        return try {
            if (rootUri.scheme == "file") {
                readdirNative(rootUri, relativePath)
            } else {
                readdirSaf(rootUri, relativePath)
            }
        } catch (e: Exception) {
            Log.w(TAG, "readdir failed: $relativePath", e)
            null
        }
    }

    override fun listTree(rootUri: Uri, relativePath: String): List<FileTreeEntry> {
        return try {
            if (rootUri.scheme == "file") {
                listTreeNative(rootUri, relativePath)
            } else {
                listTreeSaf(rootUri, relativePath)
            }
        } catch (e: Exception) {
            Log.w(TAG, "listTree failed: $relativePath", e)
            emptyList()
        }
    }

    override fun realpath(rootUri: Uri, relativePath: String): String? {
        // For SAF URIs, we can't resolve symlinks. Return the normalized path.
        // For native paths, resolve via canonical path.
        return try {
            if (rootUri.scheme == "file") {
                resolveNativePath(rootUri, relativePath).canonicalPath
            } else {
                // SAF doesn't have symlinks; return the logical path
                if (relativePath.isEmpty()) "/" else "/$relativePath"
            }
        } catch (e: Exception) {
            null
        }
    }

    // =========================================================================
    // Native file:// operations
    // =========================================================================

    private fun resolveNativePath(rootUri: Uri, relativePath: String): File {
        val rootPath = rootUri.path ?: throw IllegalArgumentException("No path in URI: $rootUri")
        return if (relativePath.isEmpty()) File(rootPath) else File(rootPath, relativePath)
    }

    private fun statNative(rootUri: Uri, relativePath: String): FileStat? {
        val file = resolveNativePath(rootUri, relativePath)
        if (!file.exists()) return null
        return FileStat(
            size = if (file.isFile) file.length() else 0,
            mtime = file.lastModified(),
            isDirectory = file.isDirectory,
            isFile = file.isFile
        )
    }

    private fun readNative(rootUri: Uri, relativePath: String, offset: Long, length: Int): ByteArray? {
        val file = resolveNativePath(rootUri, relativePath)
        if (!file.isFile) return null
        val raf = RandomAccessFile(file, "r")
        return raf.use {
            it.seek(offset)
            val buffer = ByteArray(length)
            val bytesRead = it.read(buffer)
            if (bytesRead <= 0) ByteArray(0)
            else if (bytesRead < length) buffer.copyOf(bytesRead)
            else buffer
        }
    }

    private fun readdirNative(rootUri: Uri, relativePath: String): List<String>? {
        val dir = resolveNativePath(rootUri, relativePath)
        if (!dir.isDirectory) return null
        return dir.list()?.toList() ?: emptyList()
    }

    private fun listTreeNative(rootUri: Uri, relativePath: String): List<FileTreeEntry> {
        val result = mutableListOf<FileTreeEntry>()
        val rootDir = resolveNativePath(rootUri, relativePath)
        if (!rootDir.isDirectory) return emptyList()

        fun walk(dir: File, prefix: String) {
            val entries = dir.listFiles() ?: return
            for (entry in entries) {
                val entryPath = if (prefix.isEmpty()) entry.name else "$prefix/${entry.name}"
                if (entry.isFile) {
                    result.add(FileTreeEntry(entryPath, entry.length()))
                } else if (entry.isDirectory) {
                    walk(entry, entryPath)
                }
            }
        }

        walk(rootDir, "")
        return result
    }

    // =========================================================================
    // SAF content:// operations
    // =========================================================================

    private fun findSafDocument(rootUri: Uri, relativePath: String): DocumentFile? {
        val rootDoc = DocumentFile.fromTreeUri(context, rootUri) ?: return null
        if (relativePath.isEmpty()) return rootDoc

        val parts = relativePath.split("/").filter { it.isNotEmpty() }
        var current = rootDoc
        for (part in parts) {
            current = current.findFile(part) ?: return null
        }
        return current
    }

    private fun statSaf(rootUri: Uri, relativePath: String): FileStat? {
        val doc = findSafDocument(rootUri, relativePath) ?: return null
        return FileStat(
            size = doc.length(),
            mtime = doc.lastModified(),
            isDirectory = doc.isDirectory,
            isFile = doc.isFile
        )
    }

    private fun readSaf(rootUri: Uri, relativePath: String, offset: Long, length: Int): ByteArray? {
        val doc = findSafDocument(rootUri, relativePath) ?: return null
        if (!doc.isFile) return null

        val pfd = context.contentResolver.openFileDescriptor(doc.uri, "r") ?: return null
        return pfd.use {
            val input = FileInputStream(it.fileDescriptor)
            input.use { stream ->
                if (offset > 0) stream.skip(offset)
                val buffer = ByteArray(length)
                val bytesRead = stream.read(buffer)
                if (bytesRead <= 0) ByteArray(0)
                else if (bytesRead < length) buffer.copyOf(bytesRead)
                else buffer
            }
        }
    }

    private fun readdirSaf(rootUri: Uri, relativePath: String): List<String>? {
        val doc = findSafDocument(rootUri, relativePath) ?: return null
        if (!doc.isDirectory) return null
        return doc.listFiles().map { it.name ?: "unknown" }
    }

    private fun listTreeSaf(rootUri: Uri, relativePath: String): List<FileTreeEntry> {
        val result = mutableListOf<FileTreeEntry>()
        val rootDoc = findSafDocument(rootUri, relativePath) ?: return emptyList()
        if (!rootDoc.isDirectory) return emptyList()

        fun walk(doc: DocumentFile, prefix: String) {
            for (child in doc.listFiles()) {
                val name = child.name ?: continue
                val childPath = if (prefix.isEmpty()) name else "$prefix/$name"
                if (child.isFile) {
                    result.add(FileTreeEntry(childPath, child.length()))
                } else if (child.isDirectory) {
                    walk(child, childPath)
                }
            }
        }

        walk(rootDoc, "")
        return result
    }
}
