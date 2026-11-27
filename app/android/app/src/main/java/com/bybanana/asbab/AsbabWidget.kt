package com.bybanana.asbab

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.widget.RemoteViews
import com.bybanana.asbab.core.MALAYSIA
import com.bybanana.asbab.core.WAKTU
import com.bybanana.asbab.core.toMin
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime

/** Home screen widget (Phase 6.1): next prayer with a live countdown and the next schedule item. */
class AsbabWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val app = context.applicationContext
        val done = goAsync()
        Scheduler.async { try { update(app) } finally { done.finish() } }
    }

    companion object {
        /** Redraws every Asbab widget. Called after each reminder plan and by Android every 30 minutes. */
        fun update(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, AsbabWidget::class.java))
            if (ids.isEmpty()) return
            val repo = Repo(context)
            val s = repo.settings()
            val now = ZonedDateTime.now(MALAYSIA)
            val today = Repo.today(now)
            val tomorrow = Repo.tomorrow(now)
            val views = RemoteViews(context.packageName, R.layout.widget_asbab)

            // Next prayer (today, or Subuh tomorrow).
            val m = now.hour * 60 + now.minute
            var name = "Waktu solat"; var time = ""; var at: ZonedDateTime? = null
            repo.prayer(s.zone, today)?.let { p ->
                WAKTU.firstOrNull { (k, _) -> p.times[k]?.let { toMin(it) > m } ?: false }?.let { (k, n) ->
                    name = n; time = p.times[k]!!; at = LocalDate.parse(today).atTime(LocalTime.parse(time)).atZone(MALAYSIA)
                }
            }
            if (at == null) repo.prayer(s.zone, tomorrow)?.let { p ->
                p.times["fajr"]?.let { t -> name = "Subuh esok"; time = t; at = LocalDate.parse(tomorrow).atTime(LocalTime.parse(t)).atZone(MALAYSIA) }
            }
            views.setTextViewText(R.id.w_prayer, name)
            views.setTextViewText(R.id.w_prayer_time, if (time.isNotBlank()) "Masuk waktu $time" else "Buka Asbab untuk ambil waktu JAKIM")
            at?.let { target ->
                val left = target.toInstant().toEpochMilli() - System.currentTimeMillis()
                views.setChronometer(R.id.w_count, SystemClock.elapsedRealtime() + left, null, true)
                views.setChronometerCountDown(R.id.w_count, true)
            }

            // Next schedule item.
            val next = repo.notes().filter { it.kind == "jadual" && it.time.isNotBlank() && it.date >= today }
                .map { it to (it.date + " " + it.time) }.filter { (_, w) -> w > "$today ${"%02d:%02d".format(now.hour, now.minute)}" }
                .minByOrNull { it.second }?.first
            views.setTextViewText(R.id.w_next, next?.let { "Seterusnya: ${if (it.date == today) "" else it.date + " "}${it.time} ${it.title}" } ?: "Tiada jadual akan datang.")

            val open = PendingIntent.getActivity(context, 9, Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_ROUTE, "#/hari-ini")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_root, open)
            manager.updateAppWidget(ids, views)
        }
    }
}
