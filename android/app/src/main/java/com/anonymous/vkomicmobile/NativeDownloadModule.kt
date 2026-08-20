package com.anonymous.vkomicmobile

import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future

class NativeDownloadModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val EVENT_PROGRESS = "NativeDownloadProgress"
        private const val EVENT_COMPLETE = "NativeDownloadComplete"
        private const val EVENT_ERROR = "NativeDownloadError"
        // VK sert la page HTML du document (et non le fichier) aux clients non reconnus.
        // On imite le client Kate Mobile comme dans le backend desktop (download.rs).
        private const val VKOMIC_USER_AGENT =
            "KateMobileAndroid/110.1 lite-x86_64 (Android 11; SDK 30; x86_64; en)"
        private const val RESPONSE_SNIFF_BYTES = 512
        private const val HTTP_RANGE_NOT_SATISFIABLE = 416
    }

    private fun looksLikeHtml(buffer: ByteArray, byteCount: Int): Boolean {
        if (byteCount <= 0) return false
        val sample = String(buffer, 0, byteCount, Charsets.UTF_8)
            .trimStart('\uFEFF', ' ', '\t', '\r', '\n')
            .lowercase()
        return sample.startsWith("<!doctype html") ||
            sample.startsWith("<html") ||
            sample.startsWith("<head") ||
            sample.startsWith("<body")
    }

    private fun streamStartsWithHtml(input: InputStream?): Boolean {
        if (input == null) return false
        return input.use {
            val prefix = ByteArray(RESPONSE_SNIFF_BYTES)
            val count = it.read(prefix)
            looksLikeHtml(prefix, count)
        }
    }

    private fun openValidatedInputStream(connection: HttpURLConnection): BufferedInputStream {
        val contentType = connection.contentType?.lowercase().orEmpty()
        if (contentType.contains("text/html") || contentType.contains("application/xhtml")) {
            throw IOException("VK returned an HTML page instead of the requested file")
        }

        val input = BufferedInputStream(connection.inputStream, 64 * 1024)
        input.mark(RESPONSE_SNIFF_BYTES + 1)
        val prefix = ByteArray(RESPONSE_SNIFF_BYTES)
        val count = input.read(prefix)
        input.reset()

        if (count <= 0) {
            input.close()
            throw IOException("The download response is empty")
        }
        if (looksLikeHtml(prefix, count)) {
            input.close()
            throw IOException("VK returned an HTML page instead of the requested file")
        }
        return input
    }

    private fun openDownloadConnection(url: String, startByte: Long): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 30000
            requestMethod = "GET"
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", VKOMIC_USER_AGENT)
            setRequestProperty("Accept", "*/*")
            // Keep Content-Length and byte ranges consistent for resume validation.
            setRequestProperty("Accept-Encoding", "identity")
            if (startByte > 0) {
                setRequestProperty("Range", "bytes=$startByte-")
            }
            connect()
        }
    }

    private fun rangeTotal(connection: HttpURLConnection): Long? {
        val contentRange = connection.getHeaderField("Content-Range") ?: return null
        return Regex("bytes\\s+\\*/(\\d+)", RegexOption.IGNORE_CASE)
            .find(contentRange)
            ?.groupValues
            ?.getOrNull(1)
            ?.toLongOrNull()
    }

    private fun validatePartialResponse(connection: HttpURLConnection, expectedStart: Long): Long? {
        if (connection.responseCode != HttpURLConnection.HTTP_PARTIAL) return null
        val contentRange = connection.getHeaderField("Content-Range")
            ?: throw IOException("Missing Content-Range on resumed download")
        val rangeMatch = Regex(
            "bytes\\s+(\\d+)-(\\d+)/(\\d+)",
            RegexOption.IGNORE_CASE
        ).find(contentRange) ?: throw IOException("Invalid Content-Range on partial download")
        val actualStart = rangeMatch.groupValues[1].toLongOrNull()
            ?: throw IOException("Invalid start byte in Content-Range")
        val actualEnd = rangeMatch.groupValues[2].toLongOrNull()
            ?: throw IOException("Invalid end byte in Content-Range")
        val total = rangeMatch.groupValues[3].toLongOrNull()
            ?: throw IOException("Invalid total size in Content-Range")
        if (actualStart != expectedStart) {
            throw IOException("Invalid Content-Range for resumed download")
        }
        if (actualEnd < actualStart || actualEnd >= total) {
            throw IOException("Invalid byte bounds in Content-Range")
        }
        val rangeLength = actualEnd - actualStart + 1
        if (connection.contentLengthLong > 0 && connection.contentLengthLong != rangeLength) {
            throw IOException("Content-Length does not match Content-Range")
        }
        return total
    }

    private fun prepareSafFileName(fileName: String, mimeType: String): String {
        // Eviter le bug "manga.pdf (1)" sans extension en laissant le système ajouter l'extension
        if (mimeType == "application/pdf" && fileName.lowercase().endsWith(".pdf")) {
            return fileName.substring(0, fileName.length - 4)
        }
        return fileName
    }

    private val executor = Executors.newFixedThreadPool(3)
    private val activeDownloads = ConcurrentHashMap<String, DownloadTask>()

    override fun getName(): String = "NativeDownloadModule"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    /**
     * Démarre un téléchargement avec support de reprise
     * @param id Identifiant unique du téléchargement
     * @param url URL du fichier à télécharger
     * @param filePath Chemin complet du fichier destination
     */
    @ReactMethod
    fun startDownload(id: String, url: String, filePath: String, promise: Promise) {
        // Annuler si déjà en cours
        activeDownloads[id]?.cancel()

        val task = DownloadTask(id, url, filePath)
        activeDownloads[id] = task

        val future = executor.submit {
            try {
                task.run()
                promise.resolve(true)
            } catch (e: Exception) {
                if (!task.isCancelled) {
                    promise.reject("DOWNLOAD_ERROR", e.message)
                } else {
                    promise.resolve(false) // Cancelled, not an error
                }
            } finally {
                activeDownloads.remove(id)
            }
        }
        task.future = future
    }

    /**
     * Met en pause un téléchargement (le fichier partiel est conservé)
     */
    @ReactMethod
    fun pauseDownload(id: String, promise: Promise) {
        val task = activeDownloads[id]
        if (task != null) {
            task.cancel()
            activeDownloads.remove(id)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    /**
     * Annule un téléchargement et supprime le fichier partiel
     */
    @ReactMethod
    fun cancelDownload(id: String, deleteFile: Boolean, promise: Promise) {
        val task = activeDownloads[id]
        if (task != null) {
            task.cancel()
            task.deleteFileOnCancel = deleteFile
            if (deleteFile) {
                try {
                    File(task.filePath).delete()
                } catch (e: Exception) {
                    // Ignore
                }
            }
            activeDownloads.remove(id)
        }
        promise.resolve(true)
    }

    /**
     * Vérifie si un fichier partiel existe et retourne sa taille
     */
    @ReactMethod
    fun getPartialFileSize(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (file.exists()) {
                promise.resolve(file.length().toDouble())
            } else {
                promise.resolve(0.0)
            }
        } catch (e: Exception) {
            promise.resolve(0.0)
        }
    }

    /**
     * Vérifie si un téléchargement est actif
     */
    @ReactMethod
    fun isDownloading(id: String, promise: Promise) {
        promise.resolve(activeDownloads.containsKey(id))
    }

    /**
     * Liste le contenu d'un dossier SAF avec métadonnées (taille, date) en une seule requete.
     * Beaucoup plus rapide que la boucle getInfoAsync coté JS.
     */
    @ReactMethod
    fun listSafDirectory(folderUri: String, promise: Promise) {
        executor.submit {
            try {
                val context = reactApplicationContext.applicationContext
                val treeUri = Uri.parse(folderUri)
                
                // Extraire le document ID de l'arbre
                val docId = DocumentsContract.getTreeDocumentId(treeUri)
                
                // Construire l'URI des enfants
                val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)

                // Projection demandée
                val projection = arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_SIZE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
                )

                // Trier par nom par défaut
                val sortOrder = "${DocumentsContract.Document.COLUMN_DISPLAY_NAME} ASC"

                val cursor = context.contentResolver.query(childrenUri, projection, null, null, sortOrder)
                val resultArray = Arguments.createArray()

                cursor?.use {
                    val idCol = it.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                    val nameCol = it.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                    val sizeCol = it.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                    val modCol = it.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                    val mimeCol = it.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)

                    while (it.moveToNext()) {
                        val childDocId = it.getString(idCol)
                        val name = it.getString(nameCol) ?: "Unknown"
                        val size = if (!it.isNull(sizeCol)) it.getLong(sizeCol) else 0L
                        val modified = if (!it.isNull(modCol)) it.getLong(modCol) else 0L
                        val mime = it.getString(mimeCol)
                        val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR

                        // Reconstruire l'URI complète du fichier enfant
                        val fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childDocId).toString()

                        val map = Arguments.createMap()
                        map.putString("uri", fileUri)
                        map.putString("name", name)
                        map.putDouble("size", size.toDouble())
                        map.putDouble("lastModified", modified.toDouble())
                        map.putBoolean("isDirectory", isDir)
                        
                        resultArray.pushMap(map)
                    }
                }

                promise.resolve(resultArray)
            } catch (e: Exception) {
                // Fallback ou erreur
                promise.reject("SAF_LIST_ERROR", e.message)
            }
        }
    }

    /**
     * Copie un fichier local vers un dossier SAF de manière optimisée (Stream native)
     */
    @ReactMethod
    fun finalizeDownload(tempPath: String, folderUri: String, fileName: String, mimeType: String, promise: Promise) {
        executor.submit {
            try {
                val sourceFile = File(tempPath)
                if (!sourceFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Source file not found: $tempPath")
                    return@submit
                }

                val context = reactApplicationContext.applicationContext
                val resolver = context.contentResolver
                val treeUri = Uri.parse(folderUri)
                
                // 1. Convert Tree URI to Document ID if needed
                val docId = DocumentsContract.getTreeDocumentId(treeUri)
                val dirUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)

                // 2. Create the file
                // Note: Generic "createDocument" might duplicate filenames (file(1).pdf).
                // If we want overwrite, we must find and delete first.
                // For speed, let's assume we want to create a new one or let system handle it.
                // Ideally we check existence first but that's slow. 
                // Let's implement smart overwrite check locally.
                
                var targetUri: Uri? = null
                
                // Fast listing to check existence (optional optimization, skip if too complex/slow)
                // For now, let's just create. If user wants overwrite, we rely on previous logic or accept duplication.
                // Actually, DocumentFile API is slow. Let's try direct creation.
                
                // Try create
                try {
                    val safeName = prepareSafFileName(fileName, mimeType)
                    targetUri = DocumentsContract.createDocument(resolver, dirUri, mimeType, safeName)
                } catch (e: Exception) {
                    // Fallback or permission issue
                    promise.reject("CREATE_ERROR", "Failed to create document: ${e.message}")
                    return@submit
                }

                if (targetUri == null) {
                    promise.reject("CREATE_ERROR", "Failed to create document (null uri)")
                    return@submit
                }

                // 3. Native Stream Copy with buffered I/O
                val rawOutputStream = resolver.openOutputStream(targetUri)
                if (rawOutputStream == null) {
                    promise.reject("STREAM_ERROR", "Failed to open output stream")
                    return@submit
                }

                val inputStream = BufferedInputStream(FileInputStream(sourceFile), 512 * 1024)
                val outputStream = BufferedOutputStream(rawOutputStream, 512 * 1024)

                val buffer = ByteArray(512 * 1024) // 512KB buffer
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }

                outputStream.flush()
                outputStream.close()
                inputStream.close()

                // 4. Delete temp file on success
                sourceFile.delete()

                promise.resolve(targetUri.toString())

            } catch (e: Exception) {
                promise.reject("COPY_ERROR", e.message)
            }
        }
    }


    /**
     * Démarre un téléchargement directement vers un dossier SAF (sans fichier temp intermédiaire)
     * @param id Identifiant unique du téléchargement
     * @param url URL du fichier à télécharger
     * @param safFolderUri URI du dossier SAF destination (content://...)
     * @param fileName Nom du fichier destination
     * @param mimeType Type MIME du fichier
     */
    @ReactMethod
    fun startDownloadToSaf(id: String, url: String, safFolderUri: String, fileName: String, mimeType: String, existingUri: String?, promise: Promise) {
        // Annuler si déjà en cours
        activeDownloads[id]?.cancel()

        val task = SafDownloadTask(id, url, safFolderUri, fileName, mimeType, existingUri)
        activeDownloads[id] = task

        val future = executor.submit {
            try {
                task.run()
                promise.resolve(true)
            } catch (e: Exception) {
                if (!task.isCancelled) {
                    promise.reject("DOWNLOAD_ERROR", e.message)
                } else {
                    promise.resolve(false)
                }
            } finally {
                activeDownloads.remove(id)
            }
        }
        task.future = future
    }

    private open inner class DownloadTask(
        val id: String,
        private val url: String,
        val filePath: String
    ) {
        @Volatile
        var isCancelled = false
        @Volatile
        var deleteFileOnCancel = false
        var future: Future<*>? = null

        fun cancel() {
            isCancelled = true
            future?.cancel(true)
        }

        open fun run() {
            var connection: HttpURLConnection? = null
            var outputStream: FileOutputStream? = null

            try {
                val file = File(filePath)
                val parentDir = file.parentFile
                if (parentDir != null && !parentDir.exists()) {
                    parentDir.mkdirs()
                }

                // Vérifier si un fichier partiel existe. Une ancienne réponse HTML ne doit
                // jamais être reprise comme si elle faisait partie du document.
                var startByte: Long = 0
                if (file.exists()) {
                    if (streamStartsWithHtml(FileInputStream(file))) {
                        file.delete()
                    } else {
                        startByte = file.length()
                    }
                }

                connection = openDownloadConnection(url, startByte)
                var responseCode = connection.responseCode

                // Gérer les différents codes de réponse
                if (responseCode == HTTP_RANGE_NOT_SATISFIABLE) {
                    val remoteTotal = rangeTotal(connection)
                    if (startByte > 0 && remoteTotal == startByte) {
                        val params = Arguments.createMap().apply {
                            putString("id", id)
                            putDouble("receivedBytes", startByte.toDouble())
                            putDouble("totalBytes", startByte.toDouble())
                            putInt("progress", 100)
                            putString("path", filePath)
                        }
                        sendEvent(EVENT_COMPLETE, params)
                        return
                    }

                    // Le fichier partiel ne correspond pas à la ressource distante : repartir
                    // de zéro plutôt que de déclarer un fichier potentiellement corrompu fini.
                    connection.disconnect()
                    file.delete()
                    startByte = 0
                    connection = openDownloadConnection(url, 0)
                    responseCode = connection.responseCode
                }

                if (responseCode != HttpURLConnection.HTTP_OK &&
                    responseCode != HttpURLConnection.HTTP_PARTIAL
                ) {
                    throw IOException("HTTP Error: $responseCode")
                }
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    // Serveur ne supporte pas Range, recommencer depuis le début.
                    startByte = 0
                }

                val activeConnection = connection
                val partialTotal = validatePartialResponse(activeConnection, startByte)

                // Calculer la taille totale
                val contentLength = activeConnection.contentLengthLong
                val totalBytes = partialTotal
                    ?: if (contentLength > 0) startByte + contentLength else -1L

                // Ouvrir le fichier en mode append si on reprend, sinon en mode write
                val append = startByte > 0 && responseCode == 206
                outputStream = FileOutputStream(file, append)

                val inputStream = openValidatedInputStream(activeConnection)
                val buffer = ByteArray(8192)
                var receivedBytes = startByte
                var bytesRead = 0
                var lastProgressTime = System.currentTimeMillis()
                var lastReceivedBytes = startByte
                val startTime = System.currentTimeMillis()

                // Envoyer la progression initiale si on reprend
                if (startByte > 0 && totalBytes > 0) {
                    val initialProgress = ((startByte.toDouble() / totalBytes) * 100).toInt()
                    val params = Arguments.createMap().apply {
                        putString("id", id)
                        putDouble("receivedBytes", startByte.toDouble())
                        putDouble("totalBytes", totalBytes.toDouble())
                        putInt("progress", initialProgress)
                        putDouble("speed", 0.0)
                    }
                    sendEvent(EVENT_PROGRESS, params)
                }

                while (!isCancelled && inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    receivedBytes += bytesRead

                    // Émettre la progression toutes les 250ms
                    val now = System.currentTimeMillis()
                    if (now - lastProgressTime >= 250) {
                        val progress = if (totalBytes > 0) {
                            ((receivedBytes.toDouble() / totalBytes) * 100).toInt().coerceIn(0, 99)
                        } else {
                            -1 // Indéterminé
                        }

                        // Calculer la vitesse
                        val elapsed = (now - lastProgressTime) / 1000.0
                        val speed = if (elapsed > 0) {
                            ((receivedBytes - lastReceivedBytes) / elapsed).coerceAtMost(1_000_000_000.0)
                        } else {
                            0.0
                        }

                        val params = Arguments.createMap().apply {
                            putString("id", id)
                            putDouble("receivedBytes", receivedBytes.toDouble())
                            putDouble("totalBytes", totalBytes.toDouble())
                            putInt("progress", progress)
                            putDouble("speed", speed)
                        }
                        sendEvent(EVENT_PROGRESS, params)

                        lastProgressTime = now
                        lastReceivedBytes = receivedBytes
                    }
                }

                inputStream.close()
                outputStream.flush()
                outputStream.close()
                outputStream = null

                if (!isCancelled) {
                    if (totalBytes > 0 && receivedBytes != totalBytes) {
                        throw IOException("Incomplete download: received $receivedBytes of $totalBytes bytes")
                    }
                    if (file.length() != receivedBytes) {
                        throw IOException("Downloaded file size does not match received bytes")
                    }
                    // Téléchargement terminé
                    val params = Arguments.createMap().apply {
                        putString("id", id)
                        putDouble("receivedBytes", receivedBytes.toDouble())
                        putDouble("totalBytes", if (totalBytes > 0) totalBytes.toDouble() else receivedBytes.toDouble())
                        putInt("progress", 100)
                        putString("path", filePath)
                    }
                    sendEvent(EVENT_COMPLETE, params)
                }

            } catch (e: Exception) {
                if (!isCancelled) {
                    val params = Arguments.createMap().apply {
                        putString("id", id)
                        putString("error", e.message ?: "Unknown error")
                    }
                    sendEvent(EVENT_ERROR, params)
                    throw e
                }
            } finally {
                try {
                    outputStream?.close()
                    connection?.disconnect()
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    /**
     * Téléchargement direct vers SAF (pas de fichier temp, pas de copie)
     */
    private inner class SafDownloadTask(
        id: String,
        private val url: String,
        private val safFolderUri: String,
        private val fileName: String,
        private val mimeType: String,
        private val existingUri: String?
    ) : DownloadTask(id, url, "") {

        override fun run() {
            var connection: HttpURLConnection? = null
            var outputStream: OutputStream? = null
            var createdUri: Uri? = if (existingUri != null) Uri.parse(existingUri) else null

            try {
                val context = reactApplicationContext.applicationContext
                val resolver = context.contentResolver
                
                var startByte: Long = 0
                
                if (createdUri == null) {
                    val treeUri = Uri.parse(safFolderUri)
                    val docId = DocumentsContract.getTreeDocumentId(treeUri)
                    val dirUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                    
                    val safeName = prepareSafFileName(fileName, mimeType)
                    createdUri = DocumentsContract.createDocument(resolver, dirUri, mimeType, safeName)
                        ?: throw IOException("Failed to create SAF document: $fileName")
                } else {
                    // Vérifier la taille existante pour la reprise
                    try {
                        resolver.query(createdUri, arrayOf(DocumentsContract.Document.COLUMN_SIZE), null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) {
                                startByte = cursor.getLong(0)
                            }
                        }
                        if (startByte > 0 && streamStartsWithHtml(resolver.openInputStream(createdUri))) {
                            startByte = 0
                        }
                    } catch (e: Exception) {
                        // Si l'URI n'existe plus ou erreur, repartir de zéro
                        val treeUri = Uri.parse(safFolderUri)
                        val docId = DocumentsContract.getTreeDocumentId(treeUri)
                        val dirUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                        createdUri = DocumentsContract.createDocument(resolver, dirUri, mimeType, fileName)
                            ?: throw IOException("Failed to recreate SAF document: $fileName")
                        startByte = 0
                    }
                }

                connection = openDownloadConnection(url, startByte)
                var responseCode = connection.responseCode

                if (responseCode == HTTP_RANGE_NOT_SATISFIABLE) {
                    val remoteTotal = rangeTotal(connection)
                    if (startByte > 0 && remoteTotal == startByte) {
                        val params = Arguments.createMap().apply {
                            putString("id", id)
                            putDouble("receivedBytes", startByte.toDouble())
                            putDouble("totalBytes", startByte.toDouble())
                            putInt("progress", 100)
                            putString("path", createdUri!!.toString())
                        }
                        sendEvent(EVENT_COMPLETE, params)
                        return
                    }

                    connection.disconnect()
                    startByte = 0
                    connection = openDownloadConnection(url, 0)
                    responseCode = connection.responseCode
                }

                if (responseCode != HttpURLConnection.HTTP_OK &&
                    responseCode != HttpURLConnection.HTTP_PARTIAL
                ) {
                    throw IOException("HTTP Error: $responseCode")
                }

                val effectiveStartByte = if (responseCode == HttpURLConnection.HTTP_PARTIAL) startByte else 0L
                val activeConnection = connection
                val partialTotal = validatePartialResponse(activeConnection, effectiveStartByte)

                val contentLength = activeConnection.contentLengthLong
                val totalBytes = partialTotal
                    ?: if (contentLength > 0) effectiveStartByte + contentLength else -1L

                // Ouvrir directement le stream SAF (mode "wa" pour write-append si reprise)
                // "rwt" forces truncation. Some SAF providers do not reliably truncate
                // an existing document when opened with the looser "w" mode.
                val openMode = if (effectiveStartByte > 0) "wa" else "rwt"
                val rawStream = resolver.openOutputStream(createdUri!!, openMode)
                    ?: throw IOException("Failed to open SAF output stream")
                outputStream = BufferedOutputStream(rawStream, 256 * 1024)

                val inputStream = openValidatedInputStream(activeConnection)
                val buffer = ByteArray(16384) // 16KB buffer
                var receivedBytes = effectiveStartByte
                var bytesRead = 0
                var lastProgressTime = System.currentTimeMillis()
                var lastReceivedBytes = effectiveStartByte

                // Envoyer URI initialement dans le premier événement
                val initialParams = Arguments.createMap().apply {
                    putString("id", id)
                    putDouble("receivedBytes", receivedBytes.toDouble())
                    putDouble("totalBytes", totalBytes.toDouble())
                    putInt("progress", if (totalBytes > 0) ((receivedBytes.toDouble() / totalBytes) * 100).toInt() else 0)
                    putString("path", createdUri.toString())
                }
                sendEvent(EVENT_PROGRESS, initialParams)

                while (!isCancelled && inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    receivedBytes += bytesRead

                    val now = System.currentTimeMillis()
                    if (now - lastProgressTime >= 250) {
                        val progress = if (totalBytes > 0) {
                            ((receivedBytes.toDouble() / totalBytes) * 100).toInt().coerceIn(0, 99)
                        } else -1

                        val elapsed = (now - lastProgressTime) / 1000.0
                        val speed = if (elapsed > 0) {
                            ((receivedBytes - lastReceivedBytes) / elapsed).coerceAtMost(1_000_000_000.0)
                        } else 0.0

                        val params = Arguments.createMap().apply {
                            putString("id", id)
                            putDouble("receivedBytes", receivedBytes.toDouble())
                            putDouble("totalBytes", totalBytes.toDouble())
                            putInt("progress", progress)
                            putDouble("speed", speed)
                        }
                        sendEvent(EVENT_PROGRESS, params)

                        lastProgressTime = now
                        lastReceivedBytes = receivedBytes
                    }
                }

                inputStream.close()
                outputStream.flush()
                outputStream.close()
                outputStream = null

                if (!isCancelled) {
                    if (totalBytes > 0 && receivedBytes != totalBytes) {
                        throw IOException("Incomplete download: received $receivedBytes of $totalBytes bytes")
                    }
                    val storedSize = resolver.query(
                        createdUri,
                        arrayOf(DocumentsContract.Document.COLUMN_SIZE),
                        null,
                        null,
                        null
                    )?.use { cursor ->
                        if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else null
                    }
                    if (storedSize != null && storedSize != receivedBytes) {
                        throw IOException("Downloaded SAF file size does not match received bytes")
                    }
                    val params = Arguments.createMap().apply {
                        putString("id", id)
                        putDouble("receivedBytes", receivedBytes.toDouble())
                        putDouble("totalBytes", if (totalBytes > 0) totalBytes.toDouble() else receivedBytes.toDouble())
                        putInt("progress", 100)
                        putString("path", createdUri.toString())
                    }
                    sendEvent(EVENT_COMPLETE, params)
                } else if (deleteFileOnCancel) {
                    // Si annulé ET qu'on doit supprimer
                    try {
                        DocumentsContract.deleteDocument(resolver, createdUri)
                    } catch (_: Exception) {}
                }

            } catch (e: Exception) {
                // En cas d'erreur, supprimer le fichier SAF partiel
                if (createdUri != null) {
                    try {
                        val resolver = reactApplicationContext.applicationContext.contentResolver
                        DocumentsContract.deleteDocument(resolver, createdUri)
                    } catch (_: Exception) {}
                }

                if (!isCancelled) {
                    val params = Arguments.createMap().apply {
                        putString("id", id)
                        putString("error", e.message ?: "Unknown error")
                    }
                    sendEvent(EVENT_ERROR, params)
                    throw e
                }
            } finally {
                try {
                    outputStream?.close()
                    connection?.disconnect()
                } catch (_: Exception) {}
            }
        }
    }
}
