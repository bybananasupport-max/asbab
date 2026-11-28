package com.bybanana.asbab

import android.content.Context
import com.bybanana.asbab.core.MALAYSIA
import com.bybanana.asbab.core.Planner
import java.time.ZonedDateTime

/** Spending limits (Phase 6.1): a gentle warning at 80% and when over, once per day / month per level. */
object Budget {
    fun check(context: Context, repo: Repo) {
        val s = repo.settings()
        if (s.budgetDaily <= 0 && s.budgetMonthly <= 0) return
        val now = ZonedDateTime.now(MALAYSIA)
        val today = Repo.today(now)
        val month = today.take(7)
        val notes = repo.notes().filter { it.kind == "belanja" }
        val day = notes.filter { it.date == today }.sumOf { it.amount ?: 0.0 }
        val mon = notes.filter { it.date.startsWith(month) }.sumOf { it.amount ?: 0.0 }
        val masjid = Planner.inMasjid(now, s, repo.prayer(s.zone, today))
        for ((period, key, total, limit) in listOf(
            Quad("hari ni", "budget:$today", day, s.budgetDaily),
            Quad("bulan ni", "budget:$month", mon, s.budgetMonthly),
        )) {
            val level = Planner.budgetLevel(total, limit) ?: continue
            val k = "$key:$level"
            if (repo.db.get(k) != null) continue
            repo.db.put(k, System.currentTimeMillis().toString())
            val msg = Planner.budgetMessage(level, period, total, limit)
            repo.addProactiveMessage(msg)
            if (!masjid) Notifier.showBudget(context, k, msg)
        }
    }

    private data class Quad(val a: String, val b: String, val c: Double, val d: Double)
}
