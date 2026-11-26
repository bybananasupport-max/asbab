package com.bybanana.asbab.core

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class BubbleTest {
    @Test
    fun defaultItemsInOrder() {
        assertEquals(Bubble.ALL, Bubble.items(null))
        assertEquals("tutup", Bubble.items(null).first())
    }

    @Test
    fun customOrderHidingAndUnknownIds() {
        val raw = JSONArray("""[{"id":"chat","on":true},{"id":"kamera","on":false},{"id":"hack","on":true},{"id":"tutup","on":false},{"id":"chat","on":false}]""")
        val items = Bubble.items(raw)
        assertEquals("chat", items[0])
        assertFalse("kamera" in items)
        assertFalse("hack" in items)
        assertTrue("tutup" in items)   // can never be hidden
        assertTrue("lampu" in items)   // missing ids are appended
        assertEquals(1, items.count { it == "chat" })
    }

    @Test
    fun currentPage() {
        assertEquals("hari", Bubble.current("#/hari-ini"))
        assertEquals("chat", Bubble.current("#/chat/abc"))
        assertEquals("tetapan", Bubble.current("#/tetapan/akses"))
        assertNull(Bubble.current(null))
        assertNull(Bubble.current("#/lain"))
    }

    @Test
    fun moonPhaseMatchesKnownDates() {
        // 2000-01-06 18:14 UTC is the reference new moon.
        assertEquals(0.0, Bubble.moonPhase(Instant.parse("2000-01-06T18:14:00Z").toEpochMilli()), 1e-9)
        // About 14.77 days later it is full.
        val full = Bubble.moonPhase(Instant.parse("2000-01-21T12:40:00Z").toEpochMilli())
        assertEquals(0.5, full, 0.01)
        assertEquals(1.0, Bubble.illumination(full), 0.01)
        val p = Bubble.moonPhase(Instant.parse("2026-11-26T00:00:00Z").toEpochMilli())
        assertTrue(p in 0.0..1.0)
    }

    @Test
    fun dragRules() {
        assertTrue(Bubble.snapLeft(100f, 1080))
        assertFalse(Bubble.snapLeft(900f, 1080))
        assertTrue(Bubble.shouldHide(2300f, 2400, 200f))
        assertFalse(Bubble.shouldHide(1200f, 2400, 200f))
        assertTrue(Bubble.opensUp(1500f, 2400))
        assertFalse(Bubble.opensUp(500f, 2400))
    }
}
