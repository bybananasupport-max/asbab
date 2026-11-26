package com.bybanana.asbab.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId

// Pure data + JSON parsing shared by the scheduler. No Android imports, so it is unit-testable on the JVM.
// The JSON shapes are the same ones the web UI (app/www/localapi.js) stores in the database.

val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")

/** Prayer keys and Malay names, in order (same as WAKTU in app/www/core.js). */
val WAKTU = listOf("fajr" to "Subuh", "dhuhr" to "Zohor", "asr" to "Asar", "maghrib" to "Maghrib", "isha" to "Isyak")

data class Settings(
    val name: String = "Amin",
    val zone: String = "KDH01",
    val bilalLead: Int = 20,
    val briefTime: String = "07:30",
    val checkinTime: String = "18:00",
    val quietFrom: String = "00:30",
    val quietTo: String = "05:30",
    val maxProactive: Int = 3,
    val priorities: List<String> = listOf("Solat", "Kecemasan client dan website down", "Kelas dan tugasan", "Bisnes", "Lain-lain"),
    // Phase 3: second brain and phone access
    val aiEnabled: Boolean = true,
    val aiDailyCap: Int = 60,
    val modelLight: String = "claude-haiku-5-5",
    val access: Map<String, Boolean> = emptyMap(),
    val blocklist: List<String> = emptyList(),
    val retentionDays: Int = 3,
    // Phase 4: floating moon button
    val bubble: Boolean = false,
) {
    fun allowed(toggle: String) = access[toggle] == true

    companion object {
        /** Missing or broken fields fall back to the defaults (same defaults as core.js). */
        fun fromJson(raw: String?): Settings {
            val d = Settings()
            val o = parseObject(raw) ?: return d
            val pr = o.optJSONArray("priorities")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }
            return Settings(
                name = o.optString("name", d.name).ifBlank { d.name },
                zone = o.optString("zone", d.zone).ifBlank { d.zone }.uppercase(),
                bilalLead = o.optInt("bilalLead", d.bilalLead).coerceIn(0, 120),
                briefTime = validTime(o.optString("briefTime"), d.briefTime),
                checkinTime = validTime(o.optString("checkinTime"), d.checkinTime),
                quietFrom = validTime(o.optString("quietFrom"), d.quietFrom),
                quietTo = validTime(o.optString("quietTo"), d.quietTo),
                maxProactive = o.optInt("maxProactive", d.maxProactive).coerceAtLeast(0),
                priorities = if (pr.isNullOrEmpty()) d.priorities else pr,
                aiEnabled = o.optBoolean("aiEnabled", d.aiEnabled),
                aiDailyCap = o.optInt("aiDailyCap", d.aiDailyCap).coerceAtLeast(0),
                modelLight = o.optString("modelLight", d.modelLight).ifBlank { d.modelLight },
                access = o.optJSONObject("access")?.let { a -> a.keys().asSequence().associateWith { a.optBoolean(it) } } ?: emptyMap(),
                blocklist = o.optJSONArray("blocklist")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } } ?: emptyList(),
                retentionDays = o.optInt("retentionDays", d.retentionDays).coerceIn(1, 30),
                bubble = o.optBoolean("bubble", d.bubble),
            )
        }
    }
}

data class Note(val id: String, val kind: String, val title: String, val date: String, val time: String, val amount: Double?)

fun parseNotes(raw: String?): List<Note> {
    val a = parseArray(raw) ?: return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        Note(
            id = o.optString("id"),
            kind = o.optString("kind"),
            title = o.optString("title"),
            date = o.optString("date"),
            time = o.optString("time"),
            amount = if (o.has("amount") && !o.isNull("amount")) o.optDouble("amount").takeIf { !it.isNaN() } else null,
        )
    }
}

/** One day of JAKIM prayer times. Times are "HH:MM". */
data class PrayerDay(val date: String, val hijri: String, val times: Map<String, String>) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("date", date)
        put("hijri", hijri)
        for ((k, v) in times) put(k, v)
    }

    companion object {
        val KEYS = listOf("imsak", "fajr", "syuruk", "dhuhr", "asr", "maghrib", "isha")

        fun fromJson(raw: String?): PrayerDay? {
            val o = parseObject(raw) ?: return null
            val times = KEYS.associateWith { o.optString(it) }.filterValues { isTime(it) }
            if (WAKTU.any { (k, _) -> k !in times }) return null
            return PrayerDay(o.optString("date"), o.optString("hijri"), times)
        }
    }
}

/** Which prayers are marked done on a day: the `solat:<date>` record. */
fun parseSolatMarks(raw: String?): Set<String> {
    val o = parseObject(raw) ?: return emptySet()
    return o.keys().asSequence().filter { !o.isNull(it) }.toSet()
}

fun isTime(s: String?): Boolean = s != null && Regex("^([01]?\\d|2[0-3]):[0-5]\\d$").matches(s)

fun validTime(s: String?, fallback: String) = if (isTime(s)) s!! else fallback

/** "13:05" -> 785. */
fun toMin(hhmm: String): Int {
    val (h, m) = hhmm.split(":").map { it.toInt() }
    return h * 60 + m
}

internal fun parseObject(raw: String?): JSONObject? = try {
    if (raw.isNullOrBlank()) null else JSONObject(raw)
} catch (e: Exception) {
    null
}

internal fun parseArray(raw: String?): JSONArray? = try {
    if (raw.isNullOrBlank()) null else JSONArray(raw)
} catch (e: Exception) {
    null
}
