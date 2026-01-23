package com.anonymous.vkomicmobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground Service simple qui garde l'application en vie pendant les téléchargements.
 * Le téléchargement lui-même est géré par React Native (ReactNativeBlobUtil).
 * Ce service affiche juste une notification persistante pour éviter que Android tue l'app.
 */
class DownloadForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "download_foreground_channel"
        const val CHANNEL_NAME = "Téléchargements en cours"
        const val NOTIFICATION_ID = 9999
        
        const val ACTION_START = "START_SERVICE"
        const val ACTION_STOP = "STOP_SERVICE"
        const val ACTION_UPDATE = "UPDATE_NOTIFICATION"
        
        const val EXTRA_COUNT = "download_count"
        const val EXTRA_TITLE = "current_title"
        const val EXTRA_PROGRESS = "current_progress"
        
        private var isRunning = false
        
        fun isServiceRunning() = isRunning
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (!isRunning) {
                    isRunning = true
                    startForeground(NOTIFICATION_ID, createNotification(1, "Téléchargement en cours...", 0))
                }
            }
            ACTION_UPDATE -> {
                val count = intent.getIntExtra(EXTRA_COUNT, 1)
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Téléchargement en cours..."
                val progress = intent.getIntExtra(EXTRA_PROGRESS, 0)
                updateNotification(count, title, progress)
            }
            ACTION_STOP -> {
                isRunning = false
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Maintient les téléchargements actifs en arrière-plan"
                setSound(null, null)
                enableVibration(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
    
    private fun createOpenAppIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openTab", "downloads")
        }
        return PendingIntent.getActivity(
            this, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
    
    private fun createNotification(count: Int, title: String, progress: Int): Notification {
        val text = if (count > 1) "$count téléchargements en cours" else title
        val pendingIntent = createOpenAppIntent()
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("VKomic - Téléchargement")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, progress, progress == 0)
            .setContentIntent(pendingIntent)
            .build()
    }
    
    private fun updateNotification(count: Int, title: String, progress: Int) {
        val notification = createNotification(count, title, progress)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }
}
