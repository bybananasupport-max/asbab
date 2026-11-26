package com.bybanana.asbab

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import com.bybanana.asbab.core.MALAYSIA
import com.bybanana.asbab.core.NewNote
import com.bybanana.asbab.core.Privacy
import java.time.LocalDate

/** Daily summary of which apps were used and for how long (needs Android's "Usage access"). */
object Usage {
    fun granted(context: Context): Boolean {
        val ops = context.getSystemService(AppOpsManager::class.java)
        @Suppress("DEPRECATION")
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        else ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** Foreground time per app label for one day, longest first (apps under 1 minute are left out). */
    fun day(context: Context, date: String): List<Pair<String, Long>> {
        if (!granted(context)) return emptyList()
        val usm = context.getSystemService(UsageStatsManager::class.java)
        val d = LocalDate.parse(date)
        val start = d.atStartOfDay(MALAYSIA).toInstant().toEpochMilli()
        val end = d.plusDays(1).atStartOfDay(MALAYSIA).toInstant().toEpochMilli()
        val stats = usm.queryAndAggregateUsageStats(start, end)
        val pm = context.packageManager
        return stats.values
            .filter { it.totalTimeInForeground >= 60_000 && it.packageName != context.packageName }
            .map { s ->
                val label = try { pm.getApplicationLabel(pm.getApplicationInfo(s.packageName, 0)).toString() } catch (e: Exception) { s.packageName.substringAfterLast('.') }
                label to s.totalTimeInForeground
            }
            .sortedByDescending { it.second }
    }

    /**
     * Yesterday's summary as one line for the morning brief, also saved once as a "log" note in Catatan.
     * Returns null when the toggle or the Android permission is off.
     */
    fun yesterdayLine(context: Context, repo: Repo, today: String): String? {
        if (!repo.settings().allowed("penggunaan_app") || !granted(context)) return null
        val yesterday = LocalDate.parse(today).minusDays(1).toString()
        val apps = day(context, yesterday)
        if (apps.isEmpty()) return null
        val total = apps.sumOf { it.second }
        val top = apps.take(5).joinToString(", ") { "${it.first} ${Privacy.duration(it.second)}" }
        if (repo.db.get("_usage:logged") != yesterday) {
            repo.db.put("_usage:logged", yesterday)
            repo.addNotes(
                listOf(NewNote("log", "Penggunaan app: ${Privacy.duration(total)}", yesterday, "", null)), "penggunaan",
                apps.take(15).joinToString("\n") { "${it.first}: ${Privacy.duration(it.second)}" },
            )
        }
        return "Skrin semalam: ${Privacy.duration(total)} ($top)."
    }
}
