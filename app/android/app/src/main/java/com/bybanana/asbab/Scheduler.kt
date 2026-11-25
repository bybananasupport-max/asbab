package com.bybanana.asbab

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.bybanana.asbab.core.Decision
import com.bybanana.asbab.core.Event
import com.bybanana.asbab.core.Kind
import com.bybanana.asbab.core.MALAYSIA
import com.bybanana.asbab.core.Planner
import org.json.JSONObject
import java.time.Instant
import java.time.ZonedDateTime
import java.util.concurrent.Executors

/**
 * Keeps exactly one alarm armed: the next reminder. When it fires, AlarmReceiver calls [runDue],
 * which delivers what is due and arms the next one. Works with the app closed and after a reboot.
 */
object Scheduler {
    private const val REQ_NEXT = 1001
    private const val REQ_TEST = 1002
    private const val RETRY_MS = 60 * 60_000L
    val worker = Executors.newSingleThreadExecutor()

    private fun now(): ZonedDateTime = ZonedDateTime.now(MALAYSIA)

    /** Plans from the database (fetching prayer times if needed) and arms the next alarm. Call off the main thread. */
    fun reschedule(context: Context) {
        val repo = Repo(context)
        val now = now()
        val s = repo.settings()
        val today = Repo.today(now)
        val tomorrow = Repo.tomorrow(now)
        val prayers = mapOf(today to repo.prayerOrFetch(s.zone, today), tomorrow to repo.prayerOrFetch(s.zone, tomorrow))
        val events = Planner.plan(now, s, prayers, repo.notes(), repo.sentKeys())

        var next = events.firstOrNull()?.at
        // Missing prayer times (no internet yet): try again in an hour.
        if (prayers.values.any { it == null }) {
            val retry = System.currentTimeMillis() + RETRY_MS
            next = if (next == null) retry else minOf(next, retry)
        }
        if (next == null) next = System.currentTimeMillis() + RETRY_MS
        arm(context, next)
        val first = events.firstOrNull()
        repo.db.put("_scheduler:next", JSONObject().apply {
            put("at", next)
            put("title", first?.title ?: "")
            put("missingPrayer", prayers.values.any { it == null })
            put("exact", canExact(context))
        }.toString())
        repo.prune(now)
    }

    /** Delivers every reminder that is due now, then arms the next alarm. Call off the main thread. */
    fun runDue(context: Context) {
        val repo = Repo(context)
        val now = now()
        val s = repo.settings()
        val today = Repo.today(now)
        val tomorrow = Repo.tomorrow(now)
        val prayers = mapOf(today to repo.prayerOrFetch(s.zone, today), tomorrow to repo.prayer(s.zone, tomorrow))
        val events = Planner.plan(now, s, prayers, repo.notes(), repo.sentKeys())
        for (e in Planner.due(events, System.currentTimeMillis())) {
            repo.markSent(e.key) // first, so a crash can never repeat a reminder
            val decision = Planner.decide(e, now, s, repo.solatDone(e.date), repo.proactiveCount(e.date))
            if (decision is Decision.Skip) continue
            val body = if (e.kind == Kind.BRIEF) Planner.brief(e.date, s, repo.notes(), prayers[e.date], repo.downSites()) else e.body
            deliver(context, repo, e, body)
        }
        reschedule(context)
    }

    private fun deliver(context: Context, repo: Repo, e: Event, body: String) {
        repo.addProactiveMessage(body)
        if (e.kind == Kind.CHECKIN) repo.bumpProactive(e.date)
        Notifier.show(context, e, body)
    }

    fun canExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    }

    private fun pending(context: Context, req: Int, test: Boolean): PendingIntent {
        val i = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_WAKE
            putExtra(AlarmReceiver.EXTRA_TEST, test)
        }
        return PendingIntent.getBroadcast(context, req, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun arm(context: Context, atMs: Long, req: Int = REQ_NEXT, test: Boolean = false) {
        val am = context.getSystemService(AlarmManager::class.java)
        val at = maxOf(atMs, System.currentTimeMillis() + 1_000)
        val pi = pending(context, req, test)
        try {
            if (canExact(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    /** "Cuba Mod Bilal": a test notification through the real alarm path, in [seconds]. */
    fun armTest(context: Context, seconds: Int) = arm(context, System.currentTimeMillis() + seconds * 1000L, REQ_TEST, test = true)

    /** Runs [block] on the scheduler thread (alarms and plugin calls never block the UI). */
    fun async(block: () -> Unit) = worker.execute {
        try { block() } catch (e: Exception) { android.util.Log.e("Asbab", "scheduler", e) }
    }

    fun describeNext(context: Context): JSONObject? = try {
        AsbabDb.get(context).get("_scheduler:next")?.let { JSONObject(it) }?.also {
            it.put("atText", Instant.ofEpochMilli(it.optLong("at")).atZone(MALAYSIA).toLocalDateTime().toString().replace('T', ' ').take(16))
        }
    } catch (e: Exception) {
        null
    }
}
