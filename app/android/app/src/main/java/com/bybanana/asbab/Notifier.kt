package com.bybanana.asbab

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bybanana.asbab.core.Event
import com.bybanana.asbab.core.Kind

/** Shows Asbab's notifications. Notifications only inform; they never act in other apps. */
object Notifier {
    const val CH_BILAL = "bilal"
    const val CH_REMIND = "peringatan"
    const val CH_BRIEF = "taklimat"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_BILAL, "Mod Bilal", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Peringatan sebelum waktu solat dan pertanyaan selepas waktu"
        })
        nm.createNotificationChannel(NotificationChannel(CH_REMIND, "Peringatan jadual", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Peringatan 20 minit sebelum jadual"
        })
        nm.createNotificationChannel(NotificationChannel(CH_BRIEF, "Taklimat dan check-in", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Taklimat pagi dan check-in petang"
        })
    }

    /** Stable notification id per reminder key, so a repeat replaces instead of stacking. */
    fun idFor(key: String) = key.hashCode() and 0x7fffffff

    private fun openApp(context: Context, route: String, requestCode: Int): PendingIntent {
        val i = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_ROUTE, route)
        }
        return PendingIntent.getActivity(context, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun show(context: Context, e: Event, body: String) {
        ensureChannels(context)
        val id = idFor(e.key)
        val channel = when (e.kind) {
            Kind.BILAL, Kind.TANYA -> CH_BILAL
            Kind.JADUAL -> CH_REMIND
            Kind.BRIEF, Kind.CHECKIN -> CH_BRIEF
        }
        val route = if (e.kind == Kind.BILAL || e.kind == Kind.TANYA) "#/hari-ini" else "#/chat/utama"
        val b = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle(e.title)
            .setContentText(body.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openApp(context, route, id))
            .setAutoCancel(true)
            .setCategory(if (e.kind == Kind.JADUAL) NotificationCompat.CATEGORY_EVENT else NotificationCompat.CATEGORY_REMINDER)
            .setPriority(if (channel == CH_BRIEF) NotificationCompat.PRIORITY_DEFAULT else NotificationCompat.PRIORITY_HIGH)

        if (e.kind == Kind.TANYA && e.waktu != null) {
            val done = Intent(context, ActionReceiver::class.java).apply {
                action = ActionReceiver.ACTION_SOLAT_DONE
                putExtra(ActionReceiver.EXTRA_DATE, e.date)
                putExtra(ActionReceiver.EXTRA_WAKTU, e.waktu)
                putExtra(ActionReceiver.EXTRA_NOTIF_ID, id)
            }
            b.addAction(0, "Dah solat", PendingIntent.getBroadcast(context, id, done, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        notify(context, id, b)
    }

    fun showTest(context: Context) {
        ensureChannels(context)
        val b = NotificationCompat.Builder(context, CH_BILAL)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle("Mod Bilal: ujian")
            .setContentText("Kalau kau nampak ni, alarm Asbab berfungsi walaupun app ditutup.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("Kalau kau nampak ni, alarm Asbab berfungsi walaupun app ditutup."))
            .setContentIntent(openApp(context, "#/tetapan/suara", 1))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
        notify(context, 1, b)
    }

    private fun notify(context: Context, id: Int, b: NotificationCompat.Builder) {
        val nm = NotificationManagerCompat.from(context)
        if (!nm.areNotificationsEnabled()) return
        try {
            nm.notify(id, b.build())
        } catch (e: SecurityException) {
            // Notification permission was removed; the message is still saved in the "Asbab" chat room.
        }
    }
}
