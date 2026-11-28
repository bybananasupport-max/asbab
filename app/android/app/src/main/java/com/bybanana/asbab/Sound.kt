package com.bybanana.asbab

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Plays Amin's own audio file for Mod Bilal or the azan (Phase 6.1). Asbab ships no recordings.
 * Runs as a short foreground service with a "Berhenti" button in its notification; stops by itself at the end.
 */
class SoundService : Service() {
    private var player: MediaPlayer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopAll(); return START_NOT_STICKY }
        val uri = intent?.getStringExtra(EXTRA_URI).orEmpty()
        val volume = (intent?.getIntExtra(EXTRA_VOLUME, 80) ?: 80).coerceIn(0, 100) / 100f
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Asbab"
        try {
            ServiceCompat.startForeground(this, ID, notification(this, title),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0)
        } catch (e: Exception) {
            stopSelf(); return START_NOT_STICKY
        }
        player?.release()
        player = try {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(this@SoundService, Uri.parse(uri))
                setVolume(volume, volume)
                setOnCompletionListener { stopAll() }
                setOnErrorListener { _, _, _ -> stopAll(); true }
                prepare()
                start()
            }
        } catch (e: Exception) {
            android.util.Log.e("Asbab", "sound", e)
            stopAll(); null
        }
        return START_NOT_STICKY
    }

    private fun stopAll() {
        try { player?.stop() } catch (e: Exception) {}
        player?.release()
        player = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        player?.release(); player = null
        super.onDestroy()
    }

    companion object {
        const val ID = 43
        const val CHANNEL = "bunyi"
        const val ACTION_STOP = "com.bybanana.asbab.SOUND_STOP"
        const val EXTRA_URI = "uri"
        const val EXTRA_VOLUME = "volume"
        const val EXTRA_TITLE = "title"

        fun play(context: Context, uri: String, volume: Int, title: String) {
            if (uri.isBlank()) return
            val i = Intent(context, SoundService::class.java).putExtra(EXTRA_URI, uri).putExtra(EXTRA_VOLUME, volume).putExtra(EXTRA_TITLE, title)
            try { ContextCompat.startForegroundService(context, i) } catch (e: Exception) { android.util.Log.e("Asbab", "sound start", e) }
        }

        fun stop(context: Context) {
            try { context.startService(Intent(context, SoundService::class.java).setAction(ACTION_STOP)) } catch (e: Exception) {}
        }

        fun vibrate(context: Context) {
            val v = context.getSystemService(Vibrator::class.java) ?: return
            val pattern = longArrayOf(0, 600, 300, 600, 300, 900)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else @Suppress("DEPRECATION") v.vibrate(pattern, -1)
        }

        private fun notification(context: Context, title: String): Notification {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                    NotificationChannel(CHANNEL, "Bunyi Mod Bilal dan azan", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
            }
            val stop = PendingIntent.getService(context, 44, Intent(context, SoundService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            return NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_moon)
                .setContentTitle(title)
                .setContentText("Sedang dimainkan. Tekan Berhenti untuk senyapkan.")
                .addAction(0, "Berhenti", stop)
                .setDeleteIntent(stop)
                .setOngoing(true)
                .build()
        }
    }
}
