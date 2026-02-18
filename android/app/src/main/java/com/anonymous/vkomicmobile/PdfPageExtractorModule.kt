package com.anonymous.vkomicmobile

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream

class PdfPageExtractorModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "PdfPageExtractor"
        const val CACHE_SUBDIR = "pdf_pages_cache"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentDocId: String? = null
    private var currentRenderer: PdfRenderer? = null
    private var currentPfd: ParcelFileDescriptor? = null
    private var currentPageCount: Int = 0

    override fun getName(): String = "PdfPageExtractor"

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        closeDocument()
        scope.cancel()
    }

    private fun getCacheDir(): File {
        val dir = File(reactContext.cacheDir, CACHE_SUBDIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun getDocId(uri: String): String {
        return uri.hashCode().toString()
    }

    @ReactMethod
    fun openDocument(uri: String, promise: Promise) {
        scope.launch {
            try {
                closeDocumentInternal()

                val docId = getDocId(uri)
                val file = when {
                    uri.startsWith("file://") -> File(uri.substring(7))
                    uri.startsWith("content://") -> {
                        val tempFile = File(getCacheDir(), "temp_source_$docId.pdf")
                        val inputStream = reactContext.contentResolver.openInputStream(android.net.Uri.parse(uri))
                        inputStream?.use { input ->
                            FileOutputStream(tempFile).use { output ->
                                input.copyTo(output)
                            }
                        }
                        tempFile
                    }
                    else -> File(uri)
                }

                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found: $uri")
                    return@launch
                }

                Log.i(TAG, "Opening PDF: ${file.absolutePath}")
                
                val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)

                currentDocId = docId
                currentPfd = pfd
                currentRenderer = renderer
                currentPageCount = renderer.pageCount

                Log.i(TAG, "PDF opened: $currentPageCount pages")

                val result = Arguments.createMap().apply {
                    putInt("pageCount", currentPageCount)
                    putString("docId", docId)
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open document", e)
                withContext(Dispatchers.Main) {
                    promise.reject("OPEN_ERROR", e.message)
                }
            }
        }
    }

    @ReactMethod
    fun extractPage(pageNum: Int, width: Int, promise: Promise) {
        scope.launch {
            try {
                val renderer = currentRenderer
                    ?: throw IllegalStateException("Document not opened")

                if (pageNum < 0 || pageNum >= currentPageCount) {
                    throw IllegalArgumentException("Page index out of bounds: $pageNum")
                }

                Log.i(TAG, "Extracting page $pageNum at width $width")

                val page = renderer.openPage(pageNum)
                val aspectRatio = page.height.toDouble() / page.width.toDouble()
                val height = (width * aspectRatio).toInt()

                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val docId = currentDocId ?: "unknown"
                val cacheFile = File(getCacheDir(), "${docId}_page_$pageNum.jpg")
                
                FileOutputStream(cacheFile).use { output ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output)
                }
                
                bitmap.recycle()

                // Return absolute path without file:// prefix
                val absolutePath = cacheFile.absolutePath
                Log.i(TAG, "Page $pageNum saved to: $absolutePath")

                withContext(Dispatchers.Main) {
                    promise.resolve(absolutePath)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to extract page $pageNum", e)
                withContext(Dispatchers.Main) {
                    promise.reject("EXTRACT_ERROR", e.message)
                }
            }
        }
    }

    @ReactMethod
    fun getPageCount(promise: Promise) {
        promise.resolve(currentPageCount)
    }

    @ReactMethod
    fun closeDocument() {
        scope.launch {
            closeDocumentInternal()
        }
    }

    private suspend fun closeDocumentInternal() {
        withContext(Dispatchers.IO) {
            try {
                currentRenderer?.close()
                currentPfd?.close()
                Log.i(TAG, "Document closed")
            } catch (e: Exception) {
                Log.w(TAG, "Error closing document", e)
            }
            currentRenderer = null
            currentPfd = null
            currentDocId = null
            currentPageCount = 0
        }
    }

    @ReactMethod
    fun clearCache(promise: Promise) {
        scope.launch {
            try {
                val cacheDir = getCacheDir()
                if (cacheDir.exists()) {
                    cacheDir.listFiles()?.forEach { it.deleteRecursively() }
                }
                withContext(Dispatchers.Main) {
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear cache", e)
                withContext(Dispatchers.Main) {
                    promise.reject("CLEAR_ERROR", e.message)
                }
            }
        }
    }

    @ReactMethod
    fun getCacheSize(promise: Promise) {
        scope.launch {
            try {
                val cacheDir = getCacheDir()
                var totalSize = 0L
                if (cacheDir.exists()) {
                    cacheDir.walkTopDown().forEach {
                        if (it.isFile) totalSize += it.length()
                    }
                }
                withContext(Dispatchers.Main) {
                    promise.resolve(totalSize.toDouble())
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
}
