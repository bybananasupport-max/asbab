package com.bybanana.asbab.core

import org.json.JSONObject
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Encrypted backup format v1, identical to app/www/backup.js:
 * {"asbab":"backup","v":1,"kdf":"PBKDF2-SHA256","iter":200000,"salt":b64,"iv":b64,"data":b64(AES-256-GCM)}
 */
object Backup {
    const val ITER = 200_000

    /** Keys left out of every backup (same rule as backup.js). */
    fun skipKey(k: String) = Regex("^(prayer:|sent:|proactive:|_|ingest$)").containsMatchIn(k)

    private fun key(passphrase: String, salt: ByteArray, iter: Int): SecretKeySpec {
        val f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val bytes = f.generateSecret(PBEKeySpec(passphrase.toCharArray(), salt, iter, 256)).encoded
        return SecretKeySpec(bytes, "AES")
    }

    fun encrypt(plain: String, passphrase: String, salt: ByteArray? = null, iv: ByteArray? = null, iter: Int = ITER): JSONObject {
        require(passphrase.length >= 8) { "Frasa laluan backup mesti sekurang-kurangnya 8 aksara." }
        val rnd = SecureRandom()
        val s = salt ?: ByteArray(16).also { rnd.nextBytes(it) }
        val v = iv ?: ByteArray(12).also { rnd.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key(passphrase, s, iter), GCMParameterSpec(128, v))
        val ct = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        val b64 = Base64.getEncoder()
        return JSONObject().apply {
            put("asbab", "backup"); put("v", 1); put("kdf", "PBKDF2-SHA256"); put("iter", iter)
            put("salt", b64.encodeToString(s)); put("iv", b64.encodeToString(v)); put("data", b64.encodeToString(ct))
        }
    }

    /** Throws if the passphrase is wrong or the file was changed. */
    fun decrypt(file: JSONObject, passphrase: String): String {
        require(file.optString("asbab") == "backup" && file.optInt("v") == 1) { "Fail ni bukan backup Asbab yang disulitkan." }
        val d = Base64.getDecoder()
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(passphrase, d.decode(file.getString("salt")), file.optInt("iter", ITER)), GCMParameterSpec(128, d.decode(file.getString("iv"))))
        return String(c.doFinal(d.decode(file.getString("data"))), Charsets.UTF_8)
    }

    /** "owner/name" or null. */
    fun cleanRepo(r: String?): String? {
        val m = Regex("^([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)$").find(r.orEmpty().trim().removePrefix("https://github.com/").removeSuffix(".git"))
        return m?.let { "${it.groupValues[1]}/${it.groupValues[2]}" }
    }
}

/** Website monitoring decisions (pure). */
object SiteCheck {
    /** Up if the server answered below 500 (redirects and 4xx pages still mean the site is reachable). */
    fun status(httpCode: Int?): String = if (httpCode != null && httpCode in 100..499) "ok" else "down"

    /** Adds one check [time, 1/0, ms, code] to the history (newest last), keeping the last [max]. */
    fun appendHistory(raw: String?, time: Long, ok: Boolean, ms: Long, code: Int?, max: Int = 672): String {
        val a = try { org.json.JSONArray(raw ?: "[]") } catch (e: Exception) { org.json.JSONArray() }
        a.put(org.json.JSONArray().put(time).put(if (ok) 1 else 0).put(ms).put(code ?: 0))
        val out = org.json.JSONArray()
        for (i in maxOf(0, a.length() - max) until a.length()) out.put(a.get(i))
        return out.toString()
    }

    /** Message to send when the status changes, or null when nothing changed worth telling. */
    fun message(name: String, url: String, old: String?, new: String): String? = when {
        old == new -> null
        new == "down" -> "Website $name tak dapat dicapai sekarang ($url). Nak aku siasat?"
        old == "down" -> "Website $name dah pulih."
        else -> null
    }
}
