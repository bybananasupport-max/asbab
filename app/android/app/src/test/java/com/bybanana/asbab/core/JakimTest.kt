package com.bybanana.asbab.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JakimTest {
    // Shape of the e-Solat TakwimSolat response (period=week), trimmed to two days plus one broken day.
    private val sample = """
        {"prayerTime":[
          {"hijri":"1448-06-05","date":"25-Nov-2026","day":"Wednesday","imsak":"05:40:00","fajr":"05:50:00",
           "syuruk":"07:02:00","dhuhr":"13:10:00","asr":"16:30:00","maghrib":"19:05:00","isha":"20:15:00"},
          {"hijri":"1448-06-06","date":"26-Nov-2026","day":"Thursday","imsak":"05:40:00","fajr":"05:50:00",
           "syuruk":"07:03:00","dhuhr":"13:10:00","asr":"16:31:00","maghrib":"19:05:00","isha":"20:16:00"},
          {"hijri":"","date":"27-Nov-2026","fajr":"","dhuhr":"13:11:00"}
        ],"status":"OK!","serverTime":"2026-11-25 10:00:00","periodType":"week","lang":"ms_my","zone":"KDH01","bearing":"292° 54′ 25″"}
    """.trimIndent()

    @Test
    fun parsesDaysAndSkipsBrokenOnes() {
        val days = Jakim.parse(sample)
        assertEquals(listOf("2026-11-25", "2026-11-26"), days.map { it.date })
        val d = days[0]
        assertEquals("05:50", d.times["fajr"])
        assertEquals("20:15", d.times["isha"])
        assertEquals("07:02", d.times["syuruk"])
        assertEquals("1448-06-05", d.hijri)
    }

    @Test
    fun convertsJakimDates() {
        assertEquals("2026-11-25", Jakim.isoDate("25-Nov-2026"))
        assertEquals("2026-01-05", Jakim.isoDate("5-Jan-2026"))
        assertEquals("2026-12-31", Jakim.isoDate("31-Dis-2026"))
        assertEquals("2026-03-01", Jakim.isoDate("01-03-2026"))
        assertEquals("2026-11-25", Jakim.isoDate("2026-11-25"))
        assertNull(Jakim.isoDate("hari ini"))
        assertNull(Jakim.isoDate("25-Xyz-2026"))
    }

    @Test
    fun badResponsesGiveNothing() {
        assertTrue(Jakim.parse(null).isEmpty())
        assertTrue(Jakim.parse("<html>maintenance</html>").isEmpty())
        assertTrue(Jakim.parse("""{"status":"NO_RECORD!"}""").isEmpty())
    }

    @Test
    fun cachedDayRoundTrips() {
        val d = Jakim.parse(sample)[0]
        assertEquals(d, PrayerDay.fromJson(d.toJson().toString()))
        assertNull(PrayerDay.fromJson("""{"date":"2026-11-25","fajr":"05:50"}"""))
    }

    @Test
    fun urlUsesZoneAndPeriod() {
        assertEquals(
            "https://www.e-solat.gov.my/index.php?r=esolatApi/TakwimSolat&period=week&zone=KDH01",
            Jakim.url("KDH01", "week"),
        )
    }
}
