package com.bybanana.asbab.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject
import java.time.LocalDateTime
import java.time.ZonedDateTime

class Phase61Test {
    private fun at(text: String): ZonedDateTime = LocalDateTime.parse(text).atZone(MALAYSIA)
    private val day = PrayerDay("2026-11-29", "", mapOf("fajr" to "05:50", "dhuhr" to "13:10", "asr" to "16:30", "maghrib" to "19:05", "isha" to "20:15"))
    private fun ev(kind: Kind) = Event("k", kind, 0, "2026-11-29", waktu = "dhuhr", title = "", body = "")

    @Test
    fun settingsReadTheNewFields() {
        val s = Settings.fromJson("""{"masjid":{"on":true,"minit":25},"ringkasanMingguan":false,
            "bunyi":{"bilalUri":"content://x","bilalVol":60,"getarSahaja":true,"azanUri":"content://a","azan":{"fajr":true,"asr":false}},
            "belanjaHad":{"harian":30,"bulanan":600}}""")
        assertTrue(s.masjidOn); assertEquals(25, s.masjidMinutes); assertFalse(s.weeklyOn)
        assertEquals("content://x", s.bilalSound); assertEquals(60, s.bilalVolume); assertTrue(s.bilalVibrateOnly)
        assertEquals(setOf("fajr"), s.azan)
        assertEquals(30.0, s.budgetDaily, 0.0); assertEquals(600.0, s.budgetMonthly, 0.0)
        val d = Settings.fromJson("{}")
        assertFalse(d.masjidOn); assertTrue(d.weeklyOn); assertEquals(0.0, d.budgetDaily, 0.0)
    }

    @Test
    fun masjidModeSilencesEverythingExceptBilal() {
        val s = Settings(masjidOn = true, masjidMinutes = 20)
        assertTrue(Planner.inMasjid(at("2026-11-29T13:15"), s, day))
        assertFalse(Planner.inMasjid(at("2026-11-29T13:31"), s, day))
        assertFalse(Planner.inMasjid(at("2026-11-29T13:15"), s.copy(masjidOn = false), day))
        val now = at("2026-11-29T13:15")
        assertEquals(Decision.Deliver, Planner.decide(ev(Kind.BILAL), now, s, emptySet(), 0, true))
        assertEquals(Decision.Deliver, Planner.decide(ev(Kind.AZAN), now, s, emptySet(), 0, true))
        for (k in listOf(Kind.TANYA, Kind.JADUAL, Kind.BRIEF, Kind.CHECKIN, Kind.WEEKLY))
            assertTrue(k.name, Planner.decide(ev(k), now, s, emptySet(), 0, true) is Decision.Skip)
    }

    @Test
    fun azanOnlyForChosenPrayersWithAFile() {
        val s = Settings(azan = setOf("fajr", "maghrib"), azanSound = "content://azan")
        val events = Planner.plan(at("2026-11-29T00:00"), s, mapOf("2026-11-29" to day), emptyList(), emptySet())
        assertEquals(listOf("2026-11-29:azan:fajr", "2026-11-29:azan:maghrib"), events.filter { it.kind == Kind.AZAN && it.date == "2026-11-29" }.map { it.key })
        assertEquals(LocalDateTime.parse("2026-11-29T05:50").atZone(MALAYSIA).toInstant().toEpochMilli(), events.first { it.kind == Kind.AZAN }.at)
        val noFile = Planner.plan(at("2026-11-29T00:00"), s.copy(azanSound = ""), mapOf("2026-11-29" to day), emptyList(), emptySet())
        assertTrue(noFile.none { it.kind == Kind.AZAN })
    }

    @Test
    fun weeklySummaryOnSundayNight() {
        val sunday = Planner.plan(at("2026-11-29T00:00"), Settings(), emptyMap(), emptyList(), emptySet())
        assertEquals(LocalDateTime.parse("2026-11-29T21:00").atZone(MALAYSIA).toInstant().toEpochMilli(), sunday.first { it.kind == Kind.WEEKLY }.at)
        val wednesday = Planner.plan(at("2026-11-25T00:00"), Settings(), emptyMap(), emptyList(), emptySet())
        assertTrue(wednesday.none { it.kind == Kind.WEEKLY })
        assertTrue(Planner.plan(at("2026-11-29T00:00"), Settings(weeklyOn = false), emptyMap(), emptyList(), emptySet()).none { it.kind == Kind.WEEKLY })
    }

    @Test
    fun weeklySummaryText() {
        val notes = listOf(
            Note("1", "belanja", "Teh", "2026-11-24", "", 3.5),
            Note("2", "belanja", "Minyak", "2026-11-29", "", 50.0),
            Note("3", "belanja", "Lama", "2026-11-20", "", 99.0),
            Note("4", "jadual", "Kelas English", "2026-12-01", "10:00", null),
            Note("5", "jadual", "Jauh", "2026-12-10", "10:00", null),
        )
        val all = setOf("fajr", "dhuhr", "asr", "maghrib", "isha")
        val marks = (23..29).associate { "2026-11-$it" to all } + mapOf("2026-11-27" to all - "fajr", "2026-11-28" to all - "fajr" - "asr")
        val text = Planner.weekly("2026-11-29", Settings(), notes, marks)
        assertTrue(text, text.contains("Belanja: RM53.50 (2 rekod"))
        assertTrue(text, text.contains("Solat belum ditanda: Subuh 2, Asar 1."))
        assertTrue(text, text.contains("• Selasa 10:00 Kelas English"))
        assertFalse(text.contains("Jauh"))
        assertTrue(Planner.weekly("2026-11-29", Settings(), emptyList(), (23..29).associate { "2026-11-$it" to all }).contains("semua waktu ditanda"))
    }

    @Test
    fun spendingLimits() {
        assertNull(Planner.budgetLevel(10.0, 0.0))
        assertNull(Planner.budgetLevel(23.9, 30.0))
        assertEquals("near", Planner.budgetLevel(24.0, 30.0))
        assertEquals("near", Planner.budgetLevel(30.0, 30.0))
        assertEquals("over", Planner.budgetLevel(30.5, 30.0))
        assertEquals("Belanja hari ni dah 80% daripada had (RM24.00 / RM30.00).", Planner.budgetMessage("near", "hari ni", 24.0, 30.0))
        assertTrue(Planner.budgetMessage("over", "bulan ni", 650.0, 600.0).startsWith("Belanja bulan ni dah melebihi had"))
    }
}
