package com.anonymous.vkomicmobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*

class DownloadNotificationModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        const val CHANNEL_ID = "download_progress_channel"
        const val CHANNEL_NAME = "Téléchargements"
    }

    override fun getName(): String = "DownloadNotificationModule"

    init {
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "Notifications de progression des téléchargements"
                setSound(null, null)
                enableVibration(false)
            }
            val notificationManager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Creates a PendingIntent that opens the app on the Downloads tab
     */
    private fun createOpenDownloadsPendingIntent(notificationId: Int): PendingIntent {
        val intent = Intent(reactApplicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openTab", "downloads")
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getActivity(reactApplicationContext, notificationId, intent, flags)
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
     * Récupère l'onglet à ouvrir si l'app a été lancée depuis une notification
     */
    @ReactMethod
    fun getInitialTab(promise: Promise) {
        try {
            val activity = getCurrentActivity()
            val openTab = activity?.intent?.getStringExtra("openTab")
            // Clear the extra so it's not used again
            activity?.intent?.removeExtra("openTab")
            promise.resolve(openTab)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    /**
     * Démarre le Foreground Service pour garder l'app en vie pendant les téléchargements
     */
    @ReactMethod
    fun startForegroundService() {
        val intent = Intent(reactContext, DownloadForegroundService::class.java).apply {
            action = DownloadForegroundService.ACTION_START
        }
        ContextCompat.startForegroundService(reactContext, intent)
    }
    
    /**
     * Met à jour la notification du Foreground Service
     */
    @ReactMethod
    fun updateForegroundService(count: Int, title: String, progress: Int) {
        val intent = Intent(reactContext, DownloadForegroundService::class.java).apply {
            action = DownloadForegroundService.ACTION_UPDATE
            putExtra(DownloadForegroundService.EXTRA_COUNT, count)
            putExtra(DownloadForegroundService.EXTRA_TITLE, title)
            putExtra(DownloadForegroundService.EXTRA_PROGRESS, progress)
        }
        reactContext.startService(intent)
    }
    
    /**
     * Arrête le Foreground Service
     */
    @ReactMethod
    fun stopForegroundService() {
        val intent = Intent(reactContext, DownloadForegroundService::class.java).apply {
            action = DownloadForegroundService.ACTION_STOP
        }
        reactContext.startService(intent)
    }

    @ReactMethod
    fun showProgress(id: Int, title: String, progress: Int, speed: String) {
        val context = reactApplicationContext
        
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(if (speed.isNotEmpty()) "$progress% • $speed" else "$progress%")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, progress, false)
            .setContentIntent(createOpenDownloadsPendingIntent(id))

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            // Permission non accordée
        }
    }

    @ReactMethod
    fun showCompleted(id: Int, title: String) {
        val context = reactApplicationContext
        
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("✅ Téléchargement terminé")
            .setContentText(title)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(createOpenDownloadsPendingIntent(id))

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            // Permission non accordée
        }
    }

    @ReactMethod
    fun showError(id: Int, title: String) {
        val context = reactApplicationContext

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("❌ Échec du téléchargement")
            .setContentText(title)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(createOpenDownloadsPendingIntent(id))

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            // Permission non accordée
        }
    }

    @ReactMethod
    fun showPaused(id: Int, title: String, progress: Int) {
        val context = reactApplicationContext

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_pause)
            .setContentTitle("⏸️ En pause")
            .setContentText("$title - $progress%")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(false)
            .setAutoCancel(true)
            .setProgress(100, progress, false)
            .setContentIntent(createOpenDownloadsPendingIntent(id))

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            // Permission non accordée
        }
    }

    @ReactMethod
    fun showCancelled(id: Int, title: String) {
        val context = reactApplicationContext

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_close_clear_cancel)
            .setContentTitle("🚫 Annulé")
            .setContentText(title)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setContentIntent(createOpenDownloadsPendingIntent(id))

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            // Permission non accordée
        }
    }

    @ReactMethod
    fun cancel(id: Int) {
        NotificationManagerCompat.from(reactApplicationContext).cancel(id)
    }
}
