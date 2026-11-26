package com.bybanana.asbab

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service: keeps Asbab alive on phones that kill background apps, and shows a persistent
 * notification with a "Jeda Asbab" button that stops all reading instantly.
 * Runs only while some phone access (or the floating moon button) is switched on.
 */
class AsbabService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> Capture.setPaused(this, true)
            ACTION_RESUME -> Capture.setPaused(this, false)
        }
        if (!needed(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        val n = notification(this)
        try {
            ServiceCompat.startForeground(
                this, ID, n,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
            )
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        Hooks.onServiceRefresh(this)
        return START_STICKY
    }

    override fun onDestroy() {
        Hooks.onServiceStop(this)
        super.onDestroy()
    }

    companion object {
        const val ID = 42
        const val CHANNEL = "latar"
        const val ACTION_PAUSE = "com.bybanana.asbab.PAUSE"
        const val ACTION_RESUME = "com.bybanana.asbab.RESUME"

        /** Any reading or the floating button switched on? */
        fun needed(context: Context): Boolean {
            val s = Repo(context).settings()
            return listOf("whatsapp", "email", "sms_bank", "skrin", "penggunaan_app").any { s.allowed(it) } || s.bubble
        }

        /** Starts, updates or stops the service to match the settings. Safe to call often. */
        fun refresh(context: Context) {
            val app = context.applicationContext
            val i = Intent(app, AsbabService::class.java)
            try {
                if (needed(app)) ContextCompat.startForegroundService(app, i) else app.stopService(i)
            } catch (e: Exception) {
                // Android may refuse to start a foreground service from the background; the next app open retries.
            }
        }

        private fun notification(context: Context): Notification {
            val nm = context.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL, "Asbab aktif", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Notifikasi tetap semasa Asbab membaca data yang dibenarkan"
                    setShowBadge(false)
                })
            }
            val paused = Capture.paused
            val toggle = Intent(context, AsbabService::class.java).setAction(if (paused) ACTION_RESUME else ACTION_PAUSE)
            val togglePi = PendingIntent.getService(context, 7, toggle, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val open = PendingIntent.getActivity(
                context, 8,
                Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_ROUTE, "#/tetapan/akses")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_moon)
                .setContentTitle(if (paused) "Asbab dijeda" else "Asbab aktif")
                .setContentText(if (paused) "Tiada apa yang dibaca sekarang." else "Membaca data yang kau benarkan sahaja. Tiada balasan atau tindakan.")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(open)
                .addAction(0, if (paused) "Sambung Asbab" else "Jeda Asbab", togglePi)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        }
    }
}

/** What the service also looks after: the floating moon button (Phase 4). */
object Hooks {
    fun onServiceRefresh(context: Context) = Overlay.sync(context)
    fun onServiceStop(context: Context) = Overlay.remove()
}
