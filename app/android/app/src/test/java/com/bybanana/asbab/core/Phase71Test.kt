package com.bybanana.asbab.core

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Test

class Phase71Test {
    @Test
    fun uptimeHistoryKeepsTheNewestChecks() {
        var raw: String? = null
        for (i in 1..5) raw = SiteCheck.appendHistory(raw, i * 1000L, i != 3, 100L + i, if (i == 3) null else 200, max = 3)
        val a = JSONArray(raw)
        assertEquals(3, a.length())
        assertEquals(3000L, a.getJSONArray(0).getLong(0))
        assertEquals(0, a.getJSONArray(0).getInt(1))
        assertEquals(0, a.getJSONArray(0).getInt(3))
        assertEquals(105L, a.getJSONArray(2).getLong(2))
        assertEquals(1, JSONArray(SiteCheck.appendHistory("rosak", 1L, true, 5L, 200)).length())
    }
}
