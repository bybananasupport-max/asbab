package com.bybanana.asbab

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/** Fires when the next reminder is due (or for the "Cuba Mod Bilal" test). */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        if (intent.getBooleanExtra(EXTRA_TEST, false)) {
            Notifier.showTest(app)
            return
        }
        val done = goAsync()
        Scheduler.async {
            try { Scheduler.runDue(app) } finally { done.finish() }
        }
    }

    companion object {
        const val ACTION_WAKE = "com.bybanana.asbab.WAKE"
        const val EXTRA_TEST = "test"
    }
}

/** Re-arms the reminders after a reboot, an app update or a clock/time-zone change. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        Scheduler.async {
            try { Scheduler.reschedule(app) } finally { done.finish() }
        }
        AsbabService.refresh(app)
        try { Works.sync(app) } catch (e: Exception) {}
    }
}

/** Notification buttons. "Dah solat" marks the prayer done in Asbab's own database only. */
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SOLAT_DONE) return
        val app = context.applicationContext
        val date = intent.getStringExtra(EXTRA_DATE) ?: return
        val waktu = intent.getStringExtra(EXTRA_WAKTU) ?: return
        NotificationManagerCompat.from(app).cancel(intent.getIntExtra(EXTRA_NOTIF_ID, 0))
        val done = goAsync()
        Scheduler.async {
            try {
                Repo(app).markSolat(date, waktu)
                Scheduler.reschedule(app)
            } finally {
                done.finish()
            }
        }
    }

    companion object {
        const val ACTION_SOLAT_DONE = "com.bybanana.asbab.SOLAT_DONE"
        const val EXTRA_DATE = "date"
        const val EXTRA_WAKTU = "waktu"
        const val EXTRA_NOTIF_ID = "notifId"
    }
}
