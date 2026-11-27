package com.bybanana.asbab

import android.graphics.Color
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject

/**
 * Fingerprint / PIN lock (Phase 6.1). Asks when Asbab is opened, or comes back after a few minutes in the
 * background. Can be switched off in Tetapan > Keselamatan. Uses the phone's own lock (fingerprint, face, PIN,
 * pattern); Asbab never sees or stores it.
 */
object AppLock {
    private var unlockedAt = 0L
    private var pausedAt = 0L
    private var cover: View? = null
    /** The system fingerprint/PIN screen pauses and resumes the app; don't ask again while it is showing. */
    private var prompting = false

    private data class Cfg(val on: Boolean, val minutes: Int)

    private fun cfg(activity: FragmentActivity): Cfg = try {
        val k = JSONObject(AsbabDb.get(activity).get("settings") ?: "{}").optJSONObject("kunci")
        Cfg(k?.optBoolean("on", true) ?: true, (k?.optInt("minit", 3) ?: 3).coerceIn(0, 120))
    } catch (e: Exception) {
        Cfg(true, 3)
    }

    private fun authenticators() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        else BiometricManager.Authenticators.BIOMETRIC_WEAK

    fun onPause() { if (cover == null) pausedAt = System.currentTimeMillis() }

    fun onResume(activity: FragmentActivity) {
        val c = cfg(activity)
        if (!c.on) { hide(); return }
        if (prompting) return
        val now = System.currentTimeMillis()
        val firstOpen = unlockedAt == 0L
        val away = pausedAt > 0 && now - pausedAt >= c.minutes * 60_000L
        if (cover == null && !firstOpen && !away) return
        val can = BiometricManager.from(activity).canAuthenticate(authenticators())
        val deviceSecure = (activity.getSystemService(android.app.KeyguardManager::class.java))?.isDeviceSecure == true
        if (can != BiometricManager.BIOMETRIC_SUCCESS && !deviceSecure) {
            // No fingerprint and no screen lock on this phone: nothing to check against.
            hide(); unlockedAt = now
            if (firstOpen) Toast.makeText(activity, "Kunci Asbab tak aktif kerana telefon ini tiada kunci skrin.", Toast.LENGTH_LONG).show()
            return
        }
        show(activity)
        prompt(activity)
    }

    private fun show(activity: FragmentActivity) {
        if (cover != null) return
        val root = activity.window.decorView as ViewGroup
        val box = FrameLayout(activity).apply {
            setBackgroundColor(Color.rgb(11, 16, 34))
            isClickable = true
            elevation = 100f
            addView(LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                addView(TextView(activity).apply { text = "Asbab dikunci"; setTextColor(Color.WHITE); textSize = 22f; gravity = Gravity.CENTER })
                addView(TextView(activity).apply {
                    text = "Guna cap jari atau PIN telefon untuk buka."; setTextColor(Color.argb(170, 255, 255, 255)); textSize = 14f; gravity = Gravity.CENTER
                    setPadding(0, 16, 0, 32)
                })
                addView(Button(activity).apply { text = "Buka kunci"; setOnClickListener { prompt(activity) } })
            }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        root.addView(box, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        cover = box
    }

    private fun hide() {
        cover?.let { (it.parent as? ViewGroup)?.removeView(it) }
        cover = null
    }

    private fun prompt(activity: FragmentActivity) {
        if (prompting) return
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Buka Asbab")
            .setSubtitle("Cap jari atau PIN telefon")
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setAllowedAuthenticators(authenticators())
                else @Suppress("DEPRECATION") setDeviceCredentialAllowed(true)
            }
            .build()
        val p = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                prompting = false
                unlockedAt = System.currentTimeMillis(); pausedAt = 0; hide()
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                prompting = false // stays locked; "Buka kunci" asks again
            }
        })
        prompting = true
        try { p.authenticate(info) } catch (e: Exception) { prompting = false; android.util.Log.e("Asbab", "lock", e) }
    }
}
