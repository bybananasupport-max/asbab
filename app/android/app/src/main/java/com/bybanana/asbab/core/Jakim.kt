package com.bybanana.asbab.core

// Parses the e-Solat JAKIM "TakwimSolat" response (same logic as web-reference/netlify/lib/prayer.mjs).
// Example item: {"date":"25-Nov-2026","hijri":"1448-06-05","fajr":"05:50:00", ...}
object Jakim {
    private val MONTHS = mapOf(
        "jan" to "01", "feb" to "02", "mar" to "03", "apr" to "04", "may" to "05", "jun" to "06",
        "jul" to "07", "aug" to "08", "sep" to "09", "oct" to "10", "nov" to "11", "dec" to "12",
        // Malay month names, in case JAKIM ever localises them.
        "mac" to "03", "mei" to "05", "ogo" to "08", "okt" to "10", "dis" to "12",
    )

    fun url(zone: String, period: String) =
        "https://www.e-solat.gov.my/index.php?r=esolatApi/TakwimSolat&period=$period&zone=$zone"

    /** "25-Nov-2026" or "2026-11-25" -> "2026-11-25". Returns null if unreadable. */
    fun isoDate(s: String): String? {
        val t = s.trim()
        if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(t)) return t
        val p = t.split("-")
        if (p.size != 3) return null
        val (d, m, y) = p
        val month = MONTHS[m.lowercase().take(3)] ?: m.takeIf { Regex("^\\d{1,2}$").matches(it) }?.padStart(2, '0') ?: return null
        if (!Regex("^\\d{4}$").matches(y) || !Regex("^\\d{1,2}$").matches(d)) return null
        return "$y-$month-${d.padStart(2, '0')}"
    }

    /** "05:50:00" -> "05:50" */
    fun hm(s: String) = s.trim().take(5)

    /** Parses the whole response. Days with missing or broken times are skipped. */
    fun parse(raw: String?): List<PrayerDay> {
        val o = parseObject(raw) ?: return emptyList()
        val list = o.optJSONArray("prayerTime") ?: return emptyList()
        return (0 until list.length()).mapNotNull { i ->
            val p = list.optJSONObject(i) ?: return@mapNotNull null
            val date = isoDate(p.optString("date")) ?: return@mapNotNull null
            val times = PrayerDay.KEYS.associateWith { hm(p.optString(it)) }.filterValues { isTime(it) }
            if (WAKTU.any { (k, _) -> k !in times }) return@mapNotNull null
            PrayerDay(date, p.optString("hijri"), times)
        }
    }
}
