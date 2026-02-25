package app.ok200.io.file

import android.net.Uri
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Instrumented tests for FileManagerImpl using file:// URIs.
 *
 * Tests the read-only filesystem operations used by the web server:
 * stat, exists, read, readdir, listTree, realpath.
 */
@RunWith(AndroidJUnit4::class)
class FileManagerImplTest {

    companion object {
        private const val TAG = "FileManagerImplTest"
    }

    private lateinit var fileManager: FileManagerImpl
    private lateinit var testDir: File
    private lateinit var rootUri: Uri

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        fileManager = FileManagerImpl(context)

        testDir = File(context.filesDir, "fm_test_${System.currentTimeMillis()}")
        testDir.mkdirs()
        rootUri = Uri.parse("file://${testDir.absolutePath}")

        Log.i(TAG, "Test directory: ${testDir.absolutePath}")
    }

    @After
    fun tearDown() {
        testDir.deleteRecursively()
    }

    // =========================================================================
    // exists() tests
    // =========================================================================

    @Test
    fun existsReturnsTrueForFile() {
        File(testDir, "test-file.txt").writeText("hello")
        assertTrue("exists() should return true for a file", fileManager.exists(rootUri, "test-file.txt"))
    }

    @Test
    fun existsReturnsFalseForMissingFile() {
        assertFalse("exists() should return false for missing file", fileManager.exists(rootUri, "no-such-file.txt"))
    }

    @Test
    fun existsReturnsTrueForDirectory() {
        File(testDir, "test-dir").mkdirs()
        assertTrue("exists() should return true for a directory", fileManager.exists(rootUri, "test-dir"))
    }

    @Test
    fun existsReturnsTrueForNestedPath() {
        File(testDir, "parent/child").mkdirs()
        File(testDir, "parent/child/file.txt").writeText("nested")

        assertTrue("exists() should find nested dir", fileManager.exists(rootUri, "parent/child"))
        assertTrue("exists() should find nested file", fileManager.exists(rootUri, "parent/child/file.txt"))
    }

    // =========================================================================
    // stat() tests
    // =========================================================================

    @Test
    fun statReturnsFileInfo() {
        val testData = ByteArray(42) { it.toByte() }
        File(testDir, "stat-file.bin").writeBytes(testData)

        val stat = fileManager.stat(rootUri, "stat-file.bin")
        assertNotNull("stat should return non-null for existing file", stat)
        assertEquals("size should match", 42L, stat!!.size)
        assertTrue("isFile should be true", stat.isFile)
        assertFalse("isDirectory should be false", stat.isDirectory)
    }

    @Test
    fun statReturnsDirectoryInfo() {
        File(testDir, "stat-dir").mkdirs()

        val stat = fileManager.stat(rootUri, "stat-dir")
        assertNotNull("stat should return non-null for existing directory", stat)
        assertTrue("isDirectory should be true", stat!!.isDirectory)
        assertFalse("isFile should be false", stat.isFile)
    }

    @Test
    fun statReturnsNullForMissing() {
        val stat = fileManager.stat(rootUri, "no-such-path")
        assertNull("stat should return null for missing path", stat)
    }

    // =========================================================================
    // read() tests
    // =========================================================================

    @Test
    fun readReturnsFileContents() {
        val testData = ByteArray(256) { (it % 256).toByte() }
        File(testDir, "read-test.bin").writeBytes(testData)

        val readBack = fileManager.read(rootUri, "read-test.bin", 0L, 256)
        assertNotNull("read should return data", readBack)
        assertArrayEquals("Read data should match", testData, readBack)
    }

    @Test
    fun readReturnsPartialData() {
        val testData = "Hello, World!".toByteArray()
        File(testDir, "partial-read.txt").writeBytes(testData)

        val readBack = fileManager.read(rootUri, "partial-read.txt", 7L, 6)
        assertNotNull("read should return data", readBack)
        assertEquals("Should read from offset", "World!", String(readBack!!))
    }

    @Test
    fun readReturnsNullForMissing() {
        val result = fileManager.read(rootUri, "nonexistent.txt", 0L, 10)
        assertNull("read should return null for missing file", result)
    }

    // =========================================================================
    // readdir() tests
    // =========================================================================

    @Test
    fun readdirListsDirectoryContents() {
        File(testDir, "ls-dir").mkdirs()
        File(testDir, "ls-dir/aaa.txt").writeText("a")
        File(testDir, "ls-dir/bbb.txt").writeText("b")
        File(testDir, "ls-dir/subdir").mkdirs()

        val entries = fileManager.readdir(rootUri, "ls-dir")?.sorted()
        assertNotNull("readdir should return entries", entries)
        assertEquals("Should list 3 entries", listOf("aaa.txt", "bbb.txt", "subdir"), entries)
    }

    @Test
    fun readdirReturnsNullForMissingDir() {
        val entries = fileManager.readdir(rootUri, "nonexistent")
        assertNull("Should return null for missing dir", entries)
    }

    // =========================================================================
    // listTree() tests
    // =========================================================================

    @Test
    fun listTreeReturnsAllFilesRecursively() {
        File(testDir, "tree/sub/deep").mkdirs()
        File(testDir, "tree/a.bin").writeBytes(ByteArray(10))
        File(testDir, "tree/sub/b.bin").writeBytes(ByteArray(20))
        File(testDir, "tree/sub/deep/c.bin").writeBytes(ByteArray(30))

        val entries = fileManager.listTree(rootUri, "tree").sortedBy { it.path }

        assertEquals("Should find 3 files", 3, entries.size)
        assertEquals("a.bin", entries[0].path)
        assertEquals(10L, entries[0].size)
        assertEquals("sub/b.bin", entries[1].path)
        assertEquals(20L, entries[1].size)
        assertEquals("sub/deep/c.bin", entries[2].path)
        assertEquals(30L, entries[2].size)
    }

    @Test
    fun listTreeReturnsEmptyForMissing() {
        val entries = fileManager.listTree(rootUri, "nonexistent")
        assertEquals("Should return empty for missing dir", emptyList<FileTreeEntry>(), entries)
    }

    // =========================================================================
    // realpath() tests
    // =========================================================================

    @Test
    fun realpathResolvesNormalPath() {
        File(testDir, "realpath-test.txt").writeText("test")
        val result = fileManager.realpath(rootUri, "realpath-test.txt")
        assertNotNull("realpath should return path", result)
        assertTrue("Should contain filename", result!!.contains("realpath-test.txt"))
    }

    @Test
    fun realpathReturnsNullForMissing() {
        val result = fileManager.realpath(rootUri, "nonexistent.txt")
        assertNull("realpath should return null for missing", result)
    }

    // =========================================================================
    // Stress tests
    // =========================================================================

    @Test
    fun rapidReads_noResourceLeak() {
        val testFile = "stress_read.bin"
        val fileSize = 64 * 1024  // 64KB
        File(testDir, testFile).writeBytes(ByteArray(fileSize) { (it % 256).toByte() })

        val numReads = 500
        val chunkSize = 4096

        Log.i(TAG, "Starting rapid read test: $numReads reads of ${chunkSize}B each")
        val startTime = System.currentTimeMillis()

        for (i in 0 until numReads) {
            val offset = (i * chunkSize.toLong()) % fileSize
            val data = fileManager.read(rootUri, testFile, offset, chunkSize)
            assertNotNull("Read $i should return data", data)
        }

        val elapsed = System.currentTimeMillis() - startTime
        Log.i(TAG, "Completed $numReads reads in ${elapsed}ms")
    }

    @Test
    fun multipleFilesRead_noResourceLeak() {
        val numFiles = 20
        val fileSize = 4096

        for (i in 0 until numFiles) {
            File(testDir, "multi_$i.bin").writeBytes(ByteArray(fileSize) { (it % 256).toByte() })
        }

        Log.i(TAG, "Starting multi-file read test: $numFiles files")
        val startTime = System.currentTimeMillis()

        for (round in 0 until 10) {
            for (i in 0 until numFiles) {
                val data = fileManager.read(rootUri, "multi_$i.bin", 0L, fileSize)
                assertNotNull("Read file $i round $round should return data", data)
                assertEquals("Read size should match", fileSize, data!!.size)
            }
        }

        val elapsed = System.currentTimeMillis() - startTime
        Log.i(TAG, "Completed ${numFiles * 10} reads in ${elapsed}ms")
    }
}
