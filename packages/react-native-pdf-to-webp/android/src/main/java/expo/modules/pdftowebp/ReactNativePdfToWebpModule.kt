package expo.modules.pdftowebp

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

class ReactNativePdfToWebpModule : Module() {
  private val TAG = "PdfToWebp"
  private val CACHE_SUBDIR = "pdf_pages_cache"

  private var currentDocId: String? = null
  private var currentRenderer: PdfRenderer? = null
  private var currentPfd: ParcelFileDescriptor? = null
  private var currentPageCount: Int = 0

  private val bitmapPool: ConcurrentHashMap<String, ConcurrentLinkedQueue<Bitmap>> = ConcurrentHashMap()
  private val scopeExtract = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private var currentRegionJob: Job? = null

  private fun getBitmapFromPool(width: Int, height: Int): Bitmap {
    val key = "${width}x${height}"
    val queue = bitmapPool.getOrPut(key) { ConcurrentLinkedQueue() }
    
    var bitmap = queue.poll()
    if (bitmap == null || bitmap.isRecycled) {
      Log.d(TAG, "Creating new Bitmap: $width x $height")
      bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    } else {
      Log.d(TAG, "Reusing Bitmap from pool: $width x $height")
    }
    
    bitmap.eraseColor(Color.WHITE)
    return bitmap
  }

  private fun releaseBitmapToPool(bitmap: Bitmap) {
    if (!bitmap.isRecycled) {
      val key = "${bitmap.width}x${bitmap.height}"
      val queue = bitmapPool.getOrPut(key) { ConcurrentLinkedQueue() }
      if (queue.size < 1) {
        queue.offer(bitmap)
      } else {
        bitmap.recycle()
      }
    }
  }

  private fun clearBitmapPool() {
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

  private fun getCacheDir(): File {
    val dir = File(appContext.cacheDirectory, CACHE_SUBDIR)
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun getDocId(uri: String): String {
    return uri.hashCode().toString()
  }

  override fun definition() = ModuleDefinition {
    Name("ReactNativePdfToWebp")

    AsyncFunction("openDocument") { uri: String ->
      closeDocumentInternal()

      val docId = getDocId(uri)
      val file = when {
        uri.startsWith("file://") -> File(uri.substring(7))
        uri.startsWith("content://") -> {
          val tempFile = File(getCacheDir(), "temp_source_$docId.pdf")
          val inputStream = appContext.reactContext?.contentResolver?.openInputStream(android.net.Uri.parse(uri))
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
        throw Exception("PDF file not found: $uri")
      }

      val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
      val renderer = PdfRenderer(pfd)

      currentDocId = docId
      currentPfd = pfd
      currentRenderer = renderer
      currentPageCount = renderer.pageCount

      mapOf(
        "pageCount" to currentPageCount,
        "docId" to docId
      )
    }

    AsyncFunction("extractPage") { pageNum: Int, width: Int ->
      val renderer = currentRenderer ?: throw Exception("Document not opened")
      if (pageNum < 0 || pageNum >= currentPageCount) {
        throw Exception("Page index out of bounds: $pageNum")
      }

      synchronized(renderer) {
        val page = renderer.openPage(pageNum)
        val aspectRatio = page.height.toDouble() / page.width.toDouble()
        val height = (width * aspectRatio).toInt()

        val bitmap = getBitmapFromPool(width, height)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()

        val docId = currentDocId ?: "unknown"
        val cacheFile = File(getCacheDir(), "${docId}_page_${pageNum}_w${width}.webp")
        
        FileOutputStream(cacheFile).use { output ->
          bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 90, output)
        }
        
        releaseBitmapToPool(bitmap)
        cacheFile.absolutePath
      }
    }

    AsyncFunction("extractPageRegion") { pageNum: Int, cropX: Double, cropY: Double, cropW: Double, cropH: Double, outputWidth: Int, outputHeight: Int ->
      val renderer = currentRenderer ?: throw Exception("Document not opened")
      if (pageNum < 0 || pageNum >= currentPageCount) {
        throw Exception("Page index out of bounds: $pageNum")
      }

      synchronized(renderer) {
        val page = renderer.openPage(pageNum)
        val pageW = page.width.toFloat()
        val pageH = page.height.toFloat()

        val sx = outputWidth.toFloat() / (cropW.toFloat() * pageW)
        val sy = outputHeight.toFloat() / (cropH.toFloat() * pageH)

        val tx = -cropX.toFloat() * pageW * sx
        val ty = -cropY.toFloat() * pageH * sy

        val matrix = android.graphics.Matrix()
        matrix.setScale(sx, sy)
        matrix.postTranslate(tx, ty)

        val bitmap = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.BLACK)

        page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()

        val docId = currentDocId ?: "unknown"
        val cacheFile = File(getCacheDir(), "${docId}_region_${pageNum}.webp")

        FileOutputStream(cacheFile).use { output ->
          bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 92, output)
        }

        releaseBitmapToPool(bitmap)
        cacheFile.absolutePath
      }
    }

    AsyncFunction("getPageCount") {
      currentPageCount
    }

    AsyncFunction("closeDocument") {
      closeDocumentInternal()
    }

    AsyncFunction("clearCache") {
      val cacheDir = getCacheDir()
      if (cacheDir.exists()) {
        cacheDir.listFiles()?.forEach { it.deleteRecursively() }
      }
      true
    }

    AsyncFunction("getCacheSize") {
      val cacheDir = getCacheDir()
      var totalSize = 0L
      if (cacheDir.exists()) {
        cacheDir.walkTopDown().forEach {
          if (it.isFile) totalSize += it.length()
        }
      }
      totalSize.toDouble()
    }
  }

  private fun closeDocumentInternal() {
    try {
      clearBitmapPool()
      currentRenderer?.close()
      currentPfd?.close()
    } catch (e: Exception) {
      Log.w(TAG, "Error closing document", e)
    }
    currentRenderer = null
    currentPfd = null
    currentDocId = null
    currentPageCount = 0
  }
}
