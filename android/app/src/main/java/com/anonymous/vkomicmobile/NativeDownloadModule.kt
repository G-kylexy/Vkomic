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
                    targetUri = DocumentsContract.createDocument(resolver, dirUri, mimeType, fileName)
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

                // Vérifier si un fichier partiel existe
                var startByte: Long = 0
                if (file.exists()) {
                    startByte = file.length()
                }

                // Ouvrir la connexion HTTP
                val urlObj = URL(url)
                connection = urlObj.openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.requestMethod = "GET"

                // Ajouter le header Range si reprise
                if (startByte > 0) {
                    connection.setRequestProperty("Range", "bytes=$startByte-")
                }

                connection.connect()

                val responseCode = connection.responseCode

                // Gérer les différents codes de réponse
                when (responseCode) {
                    416 -> {
                        // Range Not Satisfiable - fichier déjà complet
                        val params = Arguments.createMap().apply {
                            putString("id", id)
                            putDouble("receivedBytes", startByte.toDouble())
                            putDouble("totalBytes", startByte.toDouble())
                            putInt("progress", 100)
                        }
                        sendEvent(EVENT_COMPLETE, params)
                        return
                    }
                    200 -> {
                        // Serveur ne supporte pas Range, recommencer depuis le début
                        startByte = 0
                    }
                    206 -> {
                        // Partial Content - reprise supportée
                    }
                    else -> {
                        if (responseCode >= 400) {
                            throw IOException("HTTP Error: $responseCode")
                        }
                    }
                }

                // Calculer la taille totale
                val contentLength = connection.contentLengthLong
                val totalBytes = if (contentLength > 0) startByte + contentLength else -1L

                // Ouvrir le fichier en mode append si on reprend, sinon en mode write
                val append = startByte > 0 && responseCode == 206
                outputStream = FileOutputStream(file, append)

                val inputStream = connection.inputStream
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

                outputStream.flush()

                if (!isCancelled) {
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
                    
                    createdUri = DocumentsContract.createDocument(resolver, dirUri, mimeType, fileName)
                        ?: throw IOException("Failed to create SAF document: $fileName")
                } else {
                    // Vérifier la taille existante pour la reprise
                    try {
                        resolver.query(createdUri, arrayOf(DocumentsContract.Document.COLUMN_SIZE), null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) {
                                startByte = cursor.getLong(0)
                            }
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

                // Ouvrir la connexion HTTP
                val urlObj = URL(url)
                connection = urlObj.openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.requestMethod = "GET"
                
                if (startByte > 0) {
                    connection.setRequestProperty("Range", "bytes=$startByte-")
                }
                
                connection.connect()

                val responseCode = connection.responseCode
                
                // Gérer reprise (206) ou restart (200)
                val effectiveStartByte = if (responseCode == 206) startByte else 0L
                
                if (responseCode >= 400 && responseCode != 416) {
                    throw IOException("HTTP Error: $responseCode")
                }
                
                if (responseCode == 416) {
                    // Déjà fini
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

                val contentLength = connection.contentLengthLong
                val totalBytes = if (contentLength > 0) effectiveStartByte + contentLength else -1L

                // Ouvrir directement le stream SAF (mode "wa" pour write-append si reprise)
                val openMode = if (effectiveStartByte > 0) "wa" else "w"
                val rawStream = resolver.openOutputStream(createdUri!!, openMode)
                    ?: throw IOException("Failed to open SAF output stream")
                outputStream = BufferedOutputStream(rawStream, 256 * 1024)

                val inputStream = connection.inputStream
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

                outputStream.flush()

                if (!isCancelled) {
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
