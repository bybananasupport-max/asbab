package com.bybanana.asbab.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ModelTest {
    @Test
    fun settingsFallBackToDefaults() {
        assertEquals(Settings(), Settings.fromJson(null))
        assertEquals(Settings(), Settings.fromJson("not json"))
        val s = Settings.fromJson("""{"name":"Amin","zone":"kdh02","bilalLead":15,"briefTime":"25:99","priorities":[]}""")
        assertEquals("KDH02", s.zone)
        assertEquals(15, s.bilalLead)
        assertEquals("07:30", s.briefTime) // invalid time ignored
        assertEquals(Settings().priorities, s.priorities)
    }

    @Test
    fun notesFromTheWebUiFormat() {
        val notes = parseNotes("""[{"id":"a","kind":"belanja","title":"Teh","date":"2026-11-25","time":"","amount":2.5},
            {"id":"b","kind":"jadual","title":"Kelas","date":"2026-11-25","time":"14:00"}]""")
        assertEquals(2.5, notes[0].amount!!, 0.0001)
        assertNull(notes[1].amount)
        assertEquals("14:00", notes[1].time)
    }

    @Test
    fun solatMarks() {
        assertEquals(setOf("fajr", "asr"), parseSolatMarks("""{"fajr":1764030000000,"asr":1764050000000}"""))
        assertEquals(emptySet<String>(), parseSolatMarks(null))
    }
}
