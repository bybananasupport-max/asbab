package com.bybanana.asbab.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZonedDateTime

class PlannerTest {
    private val s = Settings()
    private fun at(text: String): ZonedDateTime = LocalDateTime.parse(text).atZone(MALAYSIA)
    private fun ms(text: String) = at(text).toInstant().toEpochMilli()

    private fun day(date: String) = PrayerDay(
        date, "",
        mapOf("fajr" to "05:50", "dhuhr" to "13:10", "asr" to "16:30", "maghrib" to "19:05", "isha" to "20:15"),
    )
    private val prayers = mapOf("2026-11-25" to day("2026-11-25"), "2026-11-26" to day("2026-11-26"))

    @Test
    fun bilalIsLeadMinutesBeforeEachPrayer() {
        val events = Planner.plan(at("2026-11-25T00:00"), s, prayers, emptyList(), emptySet())
        val subuh = events.first { it.key == "2026-11-25:bilal:fajr" }
        assertEquals(ms("2026-11-25T05:30"), subuh.at)
        assertEquals("Mod Bilal: Subuh", subuh.title)
        assertTrue(subuh.body.contains("lagi 20 minit (05:50)"))
        val asked = events.first { it.key == "2026-11-25:tanya:fajr" }
        assertEquals(ms("2026-11-25T06:30"), asked.at)
    }

    @Test
    fun leadIsConfigurable() {
        val events = Planner.plan(at("2026-11-25T00:00"), s.copy(bilalLead = 15), prayers, emptyList(), emptySet())
        assertEquals(ms("2026-11-25T12:55"), events.first { it.key == "2026-11-25:bilal:dhuhr" }.at)
    }

    @Test
    fun plansTodayAndTomorrowEarliestFirstAndSkipsPastOrSent() {
        val now = at("2026-11-25T13:00")
        val events = Planner.plan(now, s, prayers, emptyList(), setOf("2026-11-25:tanya:fajr"))
        assertTrue(events.zipWithNext().all { (a, b) -> a.at <= b.at })
        // 12:50 Zohor reminder is within the 10 minute grace, Subuh ones are too old.
        assertEquals("2026-11-25:bilal:dhuhr", events.first().key)
        assertFalse(events.any { it.key.endsWith("bilal:fajr") && it.date == "2026-11-25" })
        assertTrue(events.any { it.key == "2026-11-26:bilal:fajr" })
    }

    @Test
    fun missingPrayerTimesStillPlanOtherReminders() {
        val notes = listOf(Note("n1", "jadual", "Kelas English", "2026-11-25", "14:00", null))
        val events = Planner.plan(at("2026-11-25T08:00"), s, emptyMap(), notes, emptySet())
        assertFalse(events.any { it.kind == Kind.BILAL })
        val j = events.first { it.kind == Kind.JADUAL }
        assertEquals(ms("2026-11-25T13:40"), j.at)
        assertTrue(j.body.startsWith("Kelas English lagi 20 minit (14:00)"))
    }

    @Test
    fun scheduleNotesWithoutTimeGetNoReminder() {
        val notes = listOf(Note("n1", "jadual", "Hari keluarga", "2026-11-25", "", null))
        assertFalse(Planner.plan(at("2026-11-25T08:00"), s, prayers, notes, emptySet()).any { it.kind == Kind.JADUAL })
    }

    @Test
    fun dueAllowsThirtySecondsEarly() {
        val events = Planner.plan(at("2026-11-25T05:00"), s, prayers, emptyList(), emptySet())
        assertEquals(listOf("2026-11-25:bilal:fajr"), Planner.due(events, ms("2026-11-25T05:29") + 31_000).map { it.key })
        assertTrue(Planner.due(events, ms("2026-11-25T05:29")).isEmpty())
    }

    @Test
    fun quietHoursAcrossMidnight() {
        assertTrue(Planner.isQuiet(toMin("00:30"), "00:30", "05:30"))
        assertTrue(Planner.isQuiet(toMin("05:29"), "00:30", "05:30"))
        assertFalse(Planner.isQuiet(toMin("05:30"), "00:30", "05:30"))
        assertTrue(Planner.isQuiet(toMin("23:30"), "23:00", "06:00"))
        assertTrue(Planner.isQuiet(toMin("02:00"), "23:00", "06:00"))
        assertFalse(Planner.isQuiet(toMin("12:00"), "23:00", "06:00"))
        assertFalse(Planner.isQuiet(toMin("12:00"), "07:00", "07:00"))
    }

    private fun event(kind: Kind, waktu: String? = null) =
        Event("k", kind, 0, "2026-11-25", waktu = waktu, title = "", body = "")

    @Test
    fun bilalSpeaksEvenInQuietHours() {
        val quiet = s.copy(quietFrom = "04:00", quietTo = "06:00")
        assertEquals(Decision.Deliver, Planner.decide(event(Kind.BILAL), at("2026-11-25T05:30"), quiet, emptySet(), 0))
        assertEquals(Decision.Deliver, Planner.decide(event(Kind.TANYA, "fajr"), at("2026-11-25T05:30"), quiet, emptySet(), 0))
    }

    @Test
    fun askIsSkippedWhenPrayerMarkedDone() {
        assertTrue(Planner.decide(event(Kind.TANYA, "asr"), at("2026-11-25T17:10"), s, setOf("asr"), 0) is Decision.Skip)
    }

    @Test
    fun briefAndCheckinRespectQuietHoursAndDailyLimit() {
        val quiet = s.copy(quietFrom = "17:00", quietTo = "19:00")
        assertTrue(Planner.decide(event(Kind.CHECKIN), at("2026-11-25T18:00"), quiet, emptySet(), 0) is Decision.Skip)
        assertTrue(Planner.decide(event(Kind.BRIEF), at("2026-11-25T18:00"), quiet, emptySet(), 0) is Decision.Skip)
        assertTrue(Planner.decide(event(Kind.CHECKIN), at("2026-11-25T18:00"), s, emptySet(), 3) is Decision.Skip)
        assertEquals(Decision.Deliver, Planner.decide(event(Kind.CHECKIN), at("2026-11-25T18:00"), s, emptySet(), 2))
    }

    @Test
    fun scheduleRemindersInQuietHoursOnlyWhenTopPriority() {
        val quiet = s.copy(quietFrom = "00:00", quietTo = "23:59")
        val now = at("2026-11-25T10:00")
        assertTrue(Planner.decide(event(Kind.JADUAL), now, quiet, emptySet(), 0) is Decision.Skip)
        val classesFirst = quiet.copy(priorities = listOf("Kelas dan tugasan", "Solat"))
        assertEquals(Decision.Deliver, Planner.decide(event(Kind.JADUAL), now, classesFirst, emptySet(), 0))
    }

    @Test
    fun briefFollowsPriorityOrder() {
        val notes = listOf(
            Note("1", "jadual", "Kelas English", "2026-11-25", "10:00", null),
            Note("2", "belanja", "Nasi lemak", "2026-11-24", "", 5.5),
        )
        val text = Planner.brief("2026-11-25", s, notes, day("2026-11-25"), listOf("Milogamingstore"))
        val lines = text.lines()
        assertEquals("Selamat pagi, Amin. Ini hari Rabu kau:", lines[0])
        // Default priorities: Solat, website/client, Kelas, Bisnes.
        assertTrue(lines[1].startsWith("Subuh 05:50"))
        assertEquals("Perhatian: Milogamingstore sedang down.", lines[2])
        assertEquals("• 10:00 Kelas English", lines[3])
        assertEquals("Belanja semalam: RM5.50.", lines[4])
    }

    @Test
    fun briefWithNothingRecorded() {
        val text = Planner.brief("2026-11-29", s, emptyList(), null, emptyList())
        assertEquals("Selamat pagi, Amin. Ini hari Ahad kau:\n• Tiada jadual dalam catatan.", text)
    }
}
