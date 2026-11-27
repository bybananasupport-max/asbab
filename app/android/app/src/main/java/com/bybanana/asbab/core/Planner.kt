package com.bybanana.asbab.core

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.util.Locale

// Asbab's heartbeat, without AI. Ported from web-reference/netlify/functions/scheduler.mjs,
// but instead of waking every 5 minutes it works out the exact time of every upcoming reminder,
// so Android can wake the phone with an exact alarm.

enum class Kind { BILAL, TANYA, JADUAL, BRIEF, CHECKIN, AZAN, WEEKLY }

data class Event(
    val key: String,        // unique per reminder, e.g. "2026-11-25:bilal:fajr"; stored once sent
    val kind: Kind,
    val at: Long,           // epoch millis
    val date: String,       // the day it belongs to (YYYY-MM-DD)
    val waktu: String? = null,
    val noteId: String? = null,
    val title: String,
    val body: String,
)

sealed class Decision {
    object Deliver : Decision()
    data class Skip(val reason: String) : Decision()
}

object Planner {
    /** Reminders older than this are dropped instead of delivered late. */
    const val GRACE_MS = 10 * 60_000L
    /** "Dah solat?" is asked this long after the prayer time if it is not marked done. */
    const val ASK_AFTER_MIN = 40L
    /** Schedule reminders come this long before the item. */
    const val JADUAL_LEAD_MIN = 20L
    /** Weekly summary every Sunday night. */
    const val WEEKLY_TIME = "21:00"

    private val HARI = mapOf(
        DayOfWeek.MONDAY to "Isnin", DayOfWeek.TUESDAY to "Selasa", DayOfWeek.WEDNESDAY to "Rabu", DayOfWeek.THURSDAY to "Khamis",
        DayOfWeek.FRIDAY to "Jumaat", DayOfWeek.SATURDAY to "Sabtu", DayOfWeek.SUNDAY to "Ahad",
    )

    fun hari(date: String): String = HARI[LocalDate.parse(date).dayOfWeek] ?: date

    private fun at(date: String, hhmm: String, plusMin: Long = 0): Long =
        LocalDate.parse(date).atTime(LocalTime.parse(hhmm)).atZone(MALAYSIA).plusMinutes(plusMin).toInstant().toEpochMilli()

    /**
     * Every reminder for today and tomorrow that is not sent yet and not too old, earliest first.
     * prayers: date -> JAKIM times (missing days simply produce no prayer reminders).
     */
    fun plan(
        now: ZonedDateTime,
        s: Settings,
        prayers: Map<String, PrayerDay?>,
        notes: List<Note>,
        sent: Set<String>,
    ): List<Event> {
        val today = now.withZoneSameInstant(MALAYSIA).toLocalDate()
        val out = mutableListOf<Event>()
        for (d in listOf(today, today.plusDays(1))) {
            val date = d.toString()
            prayers[date]?.let { p ->
                for ((k, nama) in WAKTU) {
                    val time = p.times[k] ?: continue
                    if (s.bilalLead > 0) {
                        out += Event(
                            "$date:bilal:$k", Kind.BILAL, at(date, time, -s.bilalLead.toLong()), date, waktu = k,
                            title = "Mod Bilal: $nama",
                            body = "$nama lagi ${s.bilalLead} minit ($time). Masa untuk bersiap, dah mandi dan ambil wuduk?",
                        )
                    }
                    if (k in s.azan && s.azanSound.isNotBlank()) {
                        out += Event("$date:azan:$k", Kind.AZAN, at(date, time), date, waktu = k, title = "Azan $nama", body = "Sudah masuk waktu $nama ($time).")
                    }
                    out += Event(
                        "$date:tanya:$k", Kind.TANYA, at(date, time, ASK_AFTER_MIN), date, waktu = k,
                        title = "Dah solat $nama?",
                        body = "Dah solat $nama? Tekan \"Dah solat\" atau tanda dalam Hari Ini bila dah selesai.",
                    )
                }
            }
            for (n in notes) {
                if (n.kind != "jadual" || n.date != date || !isTime(n.time)) continue
                out += Event(
                    "$date:jadual:${n.id}", Kind.JADUAL, at(date, n.time, -JADUAL_LEAD_MIN), date, noteId = n.id,
                    title = n.title.take(60),
                    body = "${n.title} lagi $JADUAL_LEAD_MIN minit (${n.time}). Standby, bro.",
                )
            }
            out += Event("$date:brief", Kind.BRIEF, at(date, s.briefTime), date, title = "Taklimat pagi", body = "")
            if (s.weeklyOn && d.dayOfWeek == DayOfWeek.SUNDAY) {
                out += Event("$date:mingguan", Kind.WEEKLY, at(date, WEEKLY_TIME), date, title = "Ringkasan minggu ini", body = "")
            }
            out += Event(
                "$date:checkin", Kind.CHECKIN, at(date, s.checkinTime), date, title = "Asbab",
                body = "Assalamualaikum ${s.name}. Hari ni kau buat apa, keluar ke mana? Cerita sikit, aku catatkan.",
            )
        }
        val from = now.toInstant().toEpochMilli() - GRACE_MS
        return out.filter { it.at >= from && it.key !in sent }.sortedWith(compareBy({ it.at }, { it.kind.ordinal }))
    }

    /** The planned reminders that should be delivered now (allowing a 30 second early wake-up). */
    fun due(events: List<Event>, nowMs: Long): List<Event> = events.filter { it.at <= nowMs + 30_000 }

    /** True if minute-of-day falls inside quiet hours (which may cross midnight). */
    fun isQuiet(minute: Int, from: String, to: String): Boolean {
        val a = toMin(from)
        val b = toMin(to)
        if (a == b) return false
        return if (a < b) minute in a until b else minute >= a || minute < b
    }

    private val CATEGORY = mapOf(
        "solat" to Regex("solat|sembahyang|bilal", RegexOption.IGNORE_CASE),
        "jadual" to Regex("kelas|jadual|tugasan|kuliah|kerja", RegexOption.IGNORE_CASE),
        "website" to Regex("website|client|kecemasan", RegexOption.IGNORE_CASE),
        "belanja" to Regex("bisnes|belanja|duit|kewangan", RegexOption.IGNORE_CASE),
    )

    /** Position of a category in Amin's priority list (0 = most important). Unknown = after everything. */
    fun rank(category: String, priorities: List<String>): Int {
        val re = CATEGORY[category] ?: return Int.MAX_VALUE
        val i = priorities.indexOfFirst { re.containsMatchIn(it) }
        return if (i < 0) Int.MAX_VALUE else i
    }

    /**
     * Final check right before delivering.
     * - Mod Bilal and "Dah solat?" always speak, even in quiet hours (Amin's choice: solat comes first).
     * - "Dah solat?" is skipped when that prayer is already marked done.
     * - In quiet hours, schedule reminders only speak if schedules are Amin's top priority.
     * - The morning brief and evening check-in never speak in quiet hours; the check-in also obeys the daily limit.
     */
    fun decide(e: Event, now: ZonedDateTime, s: Settings, solatDone: Set<String>, proactiveToday: Int, inMasjid: Boolean = false): Decision {
        val local = now.withZoneSameInstant(MALAYSIA)
        val quiet = isQuiet(local.hour * 60 + local.minute, s.quietFrom, s.quietTo)
        // Mod Masjid: completely silent except Mod Bilal (and the azan Amin chose, which marks the start).
        if (inMasjid && e.kind != Kind.BILAL && e.kind != Kind.AZAN) return Decision.Skip("mod masjid")
        return when (e.kind) {
            Kind.BILAL, Kind.AZAN -> Decision.Deliver
            Kind.WEEKLY -> if (quiet) Decision.Skip("waktu senyap") else Decision.Deliver
            Kind.TANYA -> if (e.waktu in solatDone) Decision.Skip("sudah ditanda") else Decision.Deliver
            Kind.JADUAL -> if (quiet && rank("jadual", s.priorities) != 0) Decision.Skip("waktu senyap") else Decision.Deliver
            Kind.BRIEF -> if (quiet) Decision.Skip("waktu senyap") else Decision.Deliver
            Kind.CHECKIN -> when {
                quiet -> Decision.Skip("waktu senyap")
                proactiveToday >= s.maxProactive -> Decision.Skip("had harian")
                else -> Decision.Deliver
            }
        }
    }

    private fun rm(n: Double) = "RM" + String.format(Locale.US, "%.2f", n)

    /** True while Mod Masjid is on and now is within [prayer time, prayer time + masjidMinutes). */
    fun inMasjid(now: ZonedDateTime, s: Settings, today: PrayerDay?): Boolean {
        if (!s.masjidOn || today == null) return false
        val local = now.withZoneSameInstant(MALAYSIA)
        val m = local.hour * 60 + local.minute
        return WAKTU.any { (k, _) -> today.times[k]?.let { t -> m >= toMin(t) && m < toMin(t) + s.masjidMinutes } ?: false }
    }

    /**
     * Sunday night summary, no AI: spending this week (Monday to Sunday), prayers not marked this week,
     * and next week's schedule. solatByDate = prayers marked done per date.
     */
    fun weekly(sunday: String, s: Settings, notes: List<Note>, solatByDate: Map<String, Set<String>>): String {
        val sun = LocalDate.parse(sunday)
        val mon = sun.minusDays(6)
        val days = (0L..6L).map { mon.plusDays(it).toString() }
        val spend = notes.filter { it.kind == "belanja" && it.date in days }
        val total = spend.sumOf { it.amount ?: 0.0 }
        val missed = WAKTU.map { (k, nama) -> nama to days.count { d -> k !in (solatByDate[d] ?: emptySet()) } }.filter { it.second > 0 }
        val nextDays = (1L..7L).map { sun.plusDays(it).toString() }
        val next = notes.filter { it.kind == "jadual" && it.date in nextDays }.sortedBy { it.date + it.time }
        val lines = mutableListOf("Ringkasan minggu ni, ${s.name} (${mon} hingga ${sunday}):")
        lines += "Belanja: ${rm(total)}" + if (spend.isNotEmpty()) " (${spend.size} rekod, purata ${rm(total / 7)} sehari)." else "."
        lines += if (missed.isEmpty()) "Solat: semua waktu ditanda. Alhamdulillah." else "Solat belum ditanda: " + missed.joinToString(", ") { "${it.first} ${it.second}" } + "."
        lines += if (next.isEmpty()) "Jadual minggu depan: tiada lagi dalam catatan." else "Jadual minggu depan:\n" + next.take(10).joinToString("\n") { "• ${hari(it.date)} ${it.time.ifBlank { "--:--" }} ${it.title}" }
        return lines.joinToString("\n")
    }

    /** Spending limit level: null, "near" (80% or more) or "over" (more than the limit). */
    fun budgetLevel(total: Double, limit: Double): String? = when {
        limit <= 0 -> null
        total > limit -> "over"
        total >= limit * 0.8 -> "near"
        else -> null
    }

    fun budgetMessage(level: String, period: String, total: Double, limit: Double): String =
        if (level == "over") "Belanja $period dah melebihi had: ${rm(total)} daripada ${rm(limit)}. Perlahan sikit, bro."
        else "Belanja $period dah ${Math.round(total / limit * 100)}% daripada had (${rm(total)} / ${rm(limit)})."

    /**
     * Morning brief without AI. Sections follow Amin's priority list.
     * downSites: names of projects whose website is down (Phase 5 fills this in).
     */
    fun brief(date: String, s: Settings, notes: List<Note>, prayer: PrayerDay?, downSites: List<String>): String {
        val yesterday = LocalDate.parse(date).minusDays(1).toString()
        val jadual = notes.filter { it.kind == "jadual" && it.date == date }.sortedBy { it.time }
        val semalam = notes.filter { it.kind == "belanja" && it.date == yesterday }.sumOf { it.amount ?: 0.0 }
        val sections = mutableListOf<Pair<String, String>>()
        sections += "jadual" to (if (jadual.isEmpty()) "• Tiada jadual dalam catatan." else jadual.joinToString("\n") { "• ${it.time.ifBlank { "--:--" }} ${it.title}" })
        prayer?.let { p -> sections += "solat" to "Subuh ${p.times["fajr"]}, Zohor ${p.times["dhuhr"]}, Asar ${p.times["asr"]}, Maghrib ${p.times["maghrib"]}, Isyak ${p.times["isha"]}." }
        if (semalam > 0) sections += "belanja" to "Belanja semalam: ${rm(semalam)}."
        if (downSites.isNotEmpty()) sections += "website" to "Perhatian: ${downSites.joinToString(", ")} sedang down."
        val ordered = sections.withIndex().sortedWith(compareBy({ rank(it.value.first, s.priorities) }, { it.index })).map { it.value.second }
        return (listOf("Selamat pagi, ${s.name}. Ini hari ${hari(date)} kau:") + ordered).joinToString("\n")
    }
}
