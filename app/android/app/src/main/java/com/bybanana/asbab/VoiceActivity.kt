package com.bybanana.asbab

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.widget.Toast

/**
 * Invisible screen behind the moon button's "Arahan suara": listens in Bahasa Melayu, then opens
 * Asbab's main chat with what Amin said, where it is sent as a normal message.
 */
class VoiceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ms-MY")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Cakap dengan Asbab…")
        }
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(i, REQ)
        } catch (e: Exception) {
            Toast.makeText(this, "Pengecam suara tiada dalam telefon ni.", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    @Deprecated("Activity result API is not needed for this one-shot screen")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (resultCode == RESULT_OK && !text.isNullOrBlank()) {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_ROUTE, "#/chat/utama")
                    .putExtra(MainActivity.EXTRA_VOICE, text)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            )
        }
        finish()
    }

    companion object { private const val REQ = 7 }
}
