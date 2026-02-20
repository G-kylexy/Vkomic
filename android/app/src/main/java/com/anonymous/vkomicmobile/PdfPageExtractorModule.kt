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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

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

    // JAVASCRIPT: Object Pooling pour éviter la surcharge du Garbage Collector
    private val bitmapPool: ConcurrentHashMap<String, ConcurrentLinkedQueue<Bitmap>> = ConcurrentHashMap()
    private val scopeExtract = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private fun getBitmapFromPool(width: Int, height: Int): Bitmap {
        val key = "${width}x${height}"
        val queue = bitmapPool.getOrPut(key) { ConcurrentLinkedQueue() }
        
        var bitmap = queue.poll()
        if (bitmap == null || bitmap.isRecycled) {
            // Création si le pool est vide
            Log.d(TAG, "Creating new Bitmap: $width x $height")
            bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        } else {
            Log.d(TAG, "Reusing Bitmap from pool: $width x $height")
        }
        
        // Réinitialiser la couleur (nécessaire surtout pour le WebP/PDF)
        bitmap.eraseColor(Color.WHITE)
        return bitmap
    }

    private fun releaseBitmapToPool(bitmap: Bitmap) {
        if (!bitmap.isRecycled) {
            val key = "${bitmap.width}x${bitmap.height}"
            val queue = bitmapPool.getOrPut(key) { ConcurrentLinkedQueue() }
            // Garder seulement un petit nombre de bitmaps en mémoire (ex: max 3 par taille)
            if (queue.size < 3) {
                queue.offer(bitmap)
            } else {
                bitmap.recycle() // On recycle l'excédent pour économiser la RAM
            }
        }
    }
    
    // Nettoyer tous les bitmaps quand le document se ferme
    private fun clearBitmapPool() {
        Log.i(TAG, "Clearing Bitmap pool")
        for ((_, queue) in bitmapPool) {
            var bitmap = queue.poll()
            while (bitmap != null) {
                if (!bitmap.isRecycled) {
                    bitmap.recycle()
                }
                bitmap = queue.poll()
            }
        }
        bitmapPool.clear()
    }

    override fun getName(): String = "PdfPageExtractor"

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        closeDocument()
        scope.cancel()
        scopeExtract.cancel()
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
        // Use a standard Dispatchers.IO scope but isolate extract scope
        scopeExtract.launch {
            try {
                val renderer = currentRenderer
                    ?: throw IllegalStateException("Document not opened")

                if (pageNum < 0 || pageNum >= currentPageCount) {
                    throw IllegalArgumentException("Page index out of bounds: $pageNum")
                }

                // SYNCHRONIZED BLOCK:
                // PdfRenderer is NOT thread-safe. We must ensure only ONE page is rendered at a time per document
                val (absolutePath, success) = synchronized(renderer) {
                    // Check again inside block in case closed while waiting
                    if (currentRenderer == null) {
                        Pair("", false)
                    } else {
                        Log.i(TAG, "Extracting page $pageNum at width $width")

                        val page = renderer.openPage(pageNum)
                        val aspectRatio = page.height.toDouble() / page.width.toDouble()
                        val height = (width * aspectRatio).toInt()

                        val bitmap = getBitmapFromPool(width, height)
                        
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        page.close()

                        val docId = currentDocId ?: "unknown"
                        // INCLUDE WIDTH IN FILENAME to separate thumb and HD caches!
                        // CHANGE EXTENSION TO WEBP
                        val cacheFile = File(getCacheDir(), "${docId}_page_${pageNum}_w${width}.webp")
                        
                        FileOutputStream(cacheFile).use { output ->
                            // WEBP is faster to encode/decode and smaller than JPEG
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                                bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 85, output)
                            } else {
                                @Suppress("DEPRECATION")
                                bitmap.compress(Bitmap.CompressFormat.WEBP, 85, output)
                            }
                        }
                        
                        releaseBitmapToPool(bitmap)

                        Log.i(TAG, "Page $pageNum saved to: ${cacheFile.absolutePath}")
                        Pair(cacheFile.absolutePath, true)
                    }
                }
                
                if (success) {
                    withContext(Dispatchers.Main) {
                        promise.resolve(absolutePath)
                    }
                } else {
                   withContext(Dispatchers.Main) {
                        promise.reject("RENDER_ERROR", "Document closed before rendering")
                   }
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
                clearBitmapPool()
                // Wait/sync before closing to avoid crashing active renders
                currentRenderer?.let {
                    synchronized(it) {
                        it.close()
                    }
                }
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
