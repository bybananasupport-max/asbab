package com.bybanana.asbab

import android.content.Context
import com.bybanana.asbab.core.Jakim
import com.bybanana.asbab.core.MALAYSIA
import com.bybanana.asbab.core.Note
import com.bybanana.asbab.core.PrayerDay
import com.bybanana.asbab.core.Settings
import com.bybanana.asbab.core.parseNotes
import com.bybanana.asbab.core.parseSolatMarks
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZonedDateTime

/** Typed access to the records the reminders need. */
class Repo(context: Context) {
    val db = AsbabDb.get(context)

    fun settings() = Settings.fromJson(db.get("settings"))
    fun notes(): List<Note> = parseNotes(db.get("notes"))
    fun solatDone(date: String) = parseSolatMarks(db.get("solat:$date"))
    fun sentKeys(): Set<String> = db.keys("sent:").map { it.removePrefix("sent:") }.toSet()
    fun markSent(key: String) = db.put("sent:$key", System.currentTimeMillis().toString())
    fun proactiveCount(date: String) = db.get("proactive:$date")?.toIntOrNull() ?: 0
    fun bumpProactive(date: String) = db.update("proactive:$date") { ((it?.toIntOrNull() ?: 0) + 1).toString() }

    fun downSites(): List<String> = try {
        val a = JSONArray(db.get("projects") ?: "[]")
        (0 until a.length()).map { a.getJSONObject(it) }
            .filter { it.optString("status") == "down" && !it.optBoolean("archived") }
            .map { it.optString("name") }
    } catch (e: Exception) {
        emptyList()
    }

    /** Marks a prayer as done (same format as the web UI: waktu -> timestamp). */
    fun markSolat(date: String, waktu: String) = db.update("solat:$date") { raw ->
        val o = try { JSONObject(raw ?: "{}") } catch (e: Exception) { JSONObject() }
        o.put(waktu, System.currentTimeMillis()).toString()
    }

    /** Adds a message that Asbab starts itself to the pinned main room "Asbab", and marks it unread. */
    fun addProactiveMessage(text: String) {
        val now = System.currentTimeMillis()
        db.update("msgs:utama") { raw ->
            val list = try { JSONArray(raw ?: "[]") } catch (e: Exception) { JSONArray() }
            list.put(JSONObject().apply {
                put("id", java.lang.Long.toString(now, 36) + (100..999).random())
                put("ts", now)
                put("role", "asbab")
                put("text", text)
                put("ai", false)
                put("proactive", true)
            })
            // Keep the last 500 messages, like the web version.
            val start = maxOf(0, list.length() - 500)
            JSONArray((start until list.length()).map { list.get(it) }).toString()
        }
        db.update("rooms") { raw ->
            val rooms = try { JSONArray(raw ?: "[]") } catch (e: Exception) { JSONArray() }
            var found = false
            for (i in 0 until rooms.length()) {
                val r = rooms.optJSONObject(i) ?: continue
                if (r.optString("id") == "utama") {
                    r.put("unread", r.optInt("unread", 0) + 1)
                    r.put("updatedAt", now)
                    found = true
                }
            }
            if (!found) {
                val main = JSONObject().apply {
                    put("id", "utama"); put("name", "Asbab"); put("pinned", true); put("scene", "kampung")
                    put("createdAt", now); put("updatedAt", now); put("unread", 1)
                }
                val out = JSONArray().put(main)
                for (i in 0 until rooms.length()) out.put(rooms.get(i))
                return@update out.toString()
            }
            rooms.toString()
        }
    }

    fun prayer(zone: String, date: String): PrayerDay? = PrayerDay.fromJson(db.get("prayer:$zone:$date"))

    /**
     * Prayer times for one day: from the database, or fetched from JAKIM (a week at a time) and cached.
     * Network work: never call on the main thread.
     */
    fun prayerOrFetch(zone: String, date: String): PrayerDay? {
        prayer(zone, date)?.let { return it }
        for (period in listOf("week", "month")) {
            val days = fetchJakim(zone, period)
            for (d in days) db.put("prayer:$zone:${d.date}", d.toJson().toString())
            days.firstOrNull { it.date == date }?.let { return it }
        }
        return null
    }

    private fun fetchJakim(zone: String, period: String): List<PrayerDay> = try {
        val c = URL(Jakim.url(zone, period)).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000
        c.readTimeout = 15_000
        c.setRequestProperty("Accept", "application/json")
        try {
            if (c.responseCode in 200..299) Jakim.parse(c.inputStream.bufferedReader().readText()) else emptyList()
        } finally {
            c.disconnect()
        }
    } catch (e: Exception) {
        emptyList()
    }

    /** Removes old "sent:" markers and old prayer days so the database stays small. */
    fun prune(now: ZonedDateTime) {
        val keepFrom = now.withZoneSameInstant(MALAYSIA).toLocalDate().minusDays(3).toString()
        for (k in db.keys("sent:")) if (k.removePrefix("sent:").take(10) < keepFrom) db.del(k)
        for (k in db.keys("prayer:")) if (k.takeLast(10) < keepFrom) db.del(k)
        for (k in db.keys("proactive:")) if (k.takeLast(10) < keepFrom) db.del(k)
    }

    companion object {
        fun today(now: ZonedDateTime = ZonedDateTime.now(MALAYSIA)): String = now.withZoneSameInstant(MALAYSIA).toLocalDate().toString()
        fun tomorrow(now: ZonedDateTime = ZonedDateTime.now(MALAYSIA)): String = LocalDate.parse(today(now)).plusDays(1).toString()
    }
}
