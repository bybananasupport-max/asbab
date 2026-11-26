package com.bybanana.asbab

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.bybanana.asbab.core.Privacy

/**
 * Optional screen text reader (OFF by default: needs the "skrin" toggle AND Android's accessibility switch).
 * - Only apps whose own toggle is on (WhatsApp, email, SMS). Banking, e-wallet, password manager and OTP
 *   apps are on a hard denylist and are never read.
 * - Password fields and text boxes Amin is typing in are skipped.
 * - Heavily throttled (one read per app per minute) and de-duplicated.
 * - It never performs actions in other apps. The only action Asbab ever asks of this service is
 *   locking the screen from the floating moon button (Phase 4), when Amin taps that shortcut.
 */
class ScreenReader : AccessibilityService() {
    private val lastRead = HashMap<String, Long>()
    private val lastHash = HashMap<String, Int>()

    override fun onServiceConnected() {
        instance = this
        Capture.load(applicationContext)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (Capture.paused) return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName || Privacy.screenDenied(pkg)) return
        val s = Capture.settings(applicationContext)
        if (!s.allowed("skrin")) return
        val cat = Privacy.category(pkg) ?: return
        if (cat == Privacy.SMS_BANK && Privacy.isBank(pkg)) return
        if (!s.allowed(cat)) return
        val now = System.currentTimeMillis()
        if (now - (lastRead[pkg] ?: 0) < THROTTLE_MS) return
        lastRead[pkg] = now

        val root = rootInActiveWindow ?: return
        val sb = StringBuilder()
        collect(root, sb, 0)
        val text = sb.toString().trim()
        if (text.length < 20) return
        val hash = text.hashCode()
        if (lastHash[pkg] == hash) return
        lastHash[pkg] = hash
        Capture.intake(applicationContext, "skrin", pkg, "", text, emptyList())
    }

    private fun collect(node: AccessibilityNodeInfo?, sb: StringBuilder, depth: Int) {
        if (node == null || depth > 30 || sb.length > MAX_CHARS) return
        if (node.isPassword || node.isEditable) return
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let { sb.append(it).append('\n') }
        for (i in 0 until node.childCount) collect(node.getChild(i), sb, depth + 1)
    }

    override fun onInterrupt() {}

    /** Lock-screen shortcut for the floating moon button (Android 9+). */
    fun lockScreen(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)

    companion object {
        private const val THROTTLE_MS = 60_000L
        private const val MAX_CHARS = 3000
        @Volatile var instance: ScreenReader? = null
    }
}
