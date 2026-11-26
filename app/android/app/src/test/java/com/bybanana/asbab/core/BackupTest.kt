package com.bybanana.asbab.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupTest {
    @Test
    fun matchesTheJavaScriptVector() {
        // Same inputs as app/test/backup.test.js ("matches the fixed vector ...").
        val salt = ByteArray(16) { it.toByte() }
        val iv = ByteArray(12) { (100 + it).toByte() }
        val f = Backup.encrypt("""{"a":1}""", "asbab-ujian-123", salt, iv, 1000)
        assertEquals("aacBWEv7ad9WWfYYPCQtcYBx9T0JzMk=", f.getString("data"))
        assertEquals("AAECAwQFBgcICQoLDA0ODw==", f.getString("salt"))
        assertEquals(1000, f.getInt("iter"))
        assertEquals("PBKDF2-SHA256", f.getString("kdf"))
    }

    @Test
    fun roundTripAndWrongPassphrase() {
        val f = Backup.encrypt("""{"asbab":"identiti","data":{"notes":[]}}""", "frasa rahsia amin", iter = 1000)
        assertEquals("""{"asbab":"identiti","data":{"notes":[]}}""", Backup.decrypt(JSONObject(f.toString()), "frasa rahsia amin"))
        var failed = false
        try { Backup.decrypt(f, "salah salah") } catch (e: Exception) { failed = true }
        assertTrue(failed)
    }

    @Test(expected = IllegalArgumentException::class)
    fun weakPassphraseRefused() {
        Backup.encrypt("{}", "pendek")
    }

    @Test
    fun skipKeys() {
        for (k in listOf("prayer:KDH01:2026-11-26", "sent:x", "proactive:2026-11-26", "_paused", "ingest")) assertTrue(k, Backup.skipKey(k))
        for (k in listOf("notes", "settings", "msgs:utama", "ingestion")) assertFalse(k, Backup.skipKey(k))
    }

    @Test
    fun repoNames() {
        assertEquals("amin/asbab-backup", Backup.cleanRepo("https://github.com/amin/asbab-backup.git"))
        assertNull(Backup.cleanRepo("amin"))
    }

    @Test
    fun siteMonitoring() {
        assertEquals("ok", SiteCheck.status(200))
        assertEquals("ok", SiteCheck.status(404))
        assertEquals("down", SiteCheck.status(503))
        assertEquals("down", SiteCheck.status(null))
        assertEquals("Website Milo tak dapat dicapai sekarang (https://milo.my). Nak aku siasat?", SiteCheck.message("Milo", "https://milo.my", "ok", "down"))
        assertEquals("Website Milo dah pulih.", SiteCheck.message("Milo", "https://milo.my", "down", "ok"))
        assertNull(SiteCheck.message("Milo", "u", "ok", "ok"))
        assertNull(SiteCheck.message("Milo", "u", null, "ok"))
        assertEquals("Website Milo tak dapat dicapai sekarang (u). Nak aku siasat?", SiteCheck.message("Milo", "u", null, "down"))
    }
}
