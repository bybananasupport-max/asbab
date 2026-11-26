package com.bybanana.asbab.core

import org.json.JSONArray
import kotlin.math.cos

/** Floating moon button: menu configuration and the real lunar phase. Pure Kotlin, unit tested. */
object Bubble {
    /** Every item the rail can show, in the default order (Tetapan > Butang Terapung can reorder/hide). */
    val ALL = listOf(
        "tutup", "suara", "chat", "hari", "project", "catatan", "pemisah", "projek", "cincin", "tetapan",
        "kamera", "lampu", "kunci",
    )
    val DEFAULT_ON = ALL.toSet()

    /**
     * Ordered list of items to show from the saved setting `bubbleItems`
     * ([{"id":"chat","on":true}, ...]). Unknown ids are ignored, missing ones are appended (on),
     * and "tutup" is always present so the rail can be closed.
     */
    fun items(raw: JSONArray?): List<String> {
        val seen = LinkedHashMap<String, Boolean>()
        if (raw != null) for (i in 0 until raw.length()) {
            val o = raw.optJSONObject(i) ?: continue
            val id = o.optString("id")
            if (id in ALL && id !in seen) seen[id] = o.optBoolean("on", true)
        }
        for (id in ALL) if (id !in seen) seen[id] = id in DEFAULT_ON
        seen["tutup"] = true
        return seen.filterValues { it }.keys.toList()
    }

    /** Which rail item matches the page Asbab last showed (e.g. "#/hari-ini" -> "hari"). */
    fun current(route: String?): String? {
        val page = route?.removePrefix("#/")?.substringBefore('/') ?: return null
        return mapOf("chat" to "chat", "hari-ini" to "hari", "project" to "project", "catatan" to "catatan", "tetapan" to "tetapan")[page]
    }

    /** Moon phase 0..1 (0 = new moon, 0.5 = full), same formula as app/www/scene.js. */
    fun moonPhase(epochMs: Long): Double {
        val synodic = 29.530588853
        val ref = 947182440000.0 / 86_400_000.0 // 2000-01-06 18:14 UTC, a known new moon
        val days = epochMs / 86_400_000.0 - ref
        return (((days % synodic) + synodic) % synodic) / synodic
    }

    /** Lit fraction of the disc (0 new .. 1 full). */
    fun illumination(phase: Double) = (1 - cos(2 * Math.PI * phase)) / 2

    /** Side of the screen to snap to after a drag: true = left edge. */
    fun snapLeft(centerX: Float, screenWidth: Int) = centerX < screenWidth / 2f

    /** Dragged into the bottom strip -> hide the button. */
    fun shouldHide(centerY: Float, screenHeight: Int, stripPx: Float) = centerY > screenHeight - stripPx

    /** Rail opens upward when the button sits in the lower half of the screen. */
    fun opensUp(centerY: Float, screenHeight: Int) = centerY > screenHeight / 2f
}
