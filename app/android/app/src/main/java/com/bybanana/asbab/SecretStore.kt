package com.bybanana.asbab

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keys and tokens (Claude, GitHub, backup passphrase), encrypted with an AES key that lives in the
 * Android Keystore and never leaves the phone. Secrets are only read by Kotlin code; the web UI can
 * save, delete and ask "is it saved?", but never read a secret back.
 */
object SecretStore {
    const val CLAUDE = "claude"
    const val GITHUB = "github"
    const val BACKUP = "backup"
    val NAMES = setOf(CLAUDE, GITHUB, BACKUP)

    private const val ALIAS = "asbab_secrets_v1"
    private const val PREFS = "asbab_secret_store"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun set(context: Context, name: String, value: String) {
        require(name in NAMES) { "unknown secret" }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val ct = c.doFinal(value.trim().toByteArray(Charsets.UTF_8))
        val packed = Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
        prefs(context).edit().putString(name, packed).apply()
    }

    @Synchronized
    fun get(context: Context, name: String): String? {
        val packed = prefs(context).getString(name, null) ?: return null
        return try {
            val (iv, ct) = packed.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(c.doFinal(ct), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    fun has(context: Context, name: String) = !get(context, name).isNullOrEmpty()

    fun delete(context: Context, name: String) {
        prefs(context).edit().remove(name).apply()
    }
}
