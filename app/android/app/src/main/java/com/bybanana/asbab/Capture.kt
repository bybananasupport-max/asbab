package com.bybanana.asbab

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.bybanana.asbab.core.Extract
import com.bybanana.asbab.core.Ingested
import com.bybanana.asbab.core.NewNote
import com.bybanana.asbab.core.Privacy
import com.bybanana.asbab.core.Settings

/**
 * Shared state for everything that reads other apps. Reads are cached for a few seconds so the
 * listeners stay cheap, and "Jeda Asbab" takes effect immediately through [setPaused].
 */
object Capture {
    @Volatile var paused = false
        private set
    @Volatile private var cached: Settings? = null
    @Volatile private var cachedAt = 0L

    fun load(context: Context) {
        paused = Repo(context).paused
    }

    fun setPaused(context: Context, value: Boolean) {
        paused = value
        Repo(context).paused = value
        AsbabService.refresh(context)
    }

    fun settings(context: Context): Settings {
        val now = System.currentTimeMillis()
        cached?.let { if (now - cachedAt < 15_000) return it }
        val repo = Repo(context)
        paused = repo.paused
        return repo.settings().also { cached = it; cachedAt = now }
    }

    fun invalidate() { cachedAt = 0 }

    private fun appLabel(context: Context, pkg: String): String = try {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
        pkg.substringAfterLast('.')
    }

    /**
     * Stores one captured item if every rule allows it. Bank/e-wallet/SMS spending is logged at once
     * without AI; everything else waits for the hourly AI extraction.
     */
    fun intake(context: Context, src: String, pkg: String, title: String, text: String, names: List<String>) {
        val s = settings(context)
        if (paused) return
        val body = text.trim()
        if (body.isEmpty()) return
        if (Privacy.isSecret("$title $body")) return               // OTP codes and passwords are never stored
        if (Privacy.blocked(names + title, s.blocklist)) return   // Amin's blocklist
        val app = appLabel(context, pkg)
        val item = Ingested(
            id = java.lang.Long.toString(System.currentTimeMillis(), 36) + (100..999).random(),
            ts = System.currentTimeMillis(), src = src, app = app, title = title.take(120), text = body.take(2000), done = false,
        )
        Scheduler.async {
            val repo = Repo(context)
            if (!repo.addIngested(item)) return@async
            val cat = Privacy.category(pkg)
            if (src == "notifikasi" && cat == Privacy.SMS_BANK) {
                Privacy.spending("$title $body")?.let { amount ->
                    repo.addNotes(listOf(NewNote("belanja", "$app: ${title.ifBlank { body }.take(60)}", Repo.today(), "", amount)), "notifikasi", body)
                    repo.markIngestedDone(setOf(item.id))
                    Budget.check(context, repo)
                }
            }
        }
    }

    private const val EXTRACT_EVERY_MS = 60 * 60_000L

    /** When the next AI extraction may run (0 = nothing waiting or not allowed). */
    fun nextExtractAt(context: Context): Long {
        val repo = Repo(context)
        val s = repo.settings()
        if (repo.paused || !s.aiEnabled) return 0
        // Only providers whose "Hantar notifikasi peribadi kepada AI" switch is on may see captured data.
        val cfg = AiRouter.config(context)
        if (cfg.chain("chat", true, { AiRouter.hasKey(context, it) }, { repo.usageFor(it) }).isEmpty()) return 0
        if (repo.ingested().none { !it.done }) return 0
        val last = repo.db.get("_extract:last")?.toLongOrNull() ?: 0
        return maxOf(System.currentTimeMillis() + 60_000, last + EXTRACT_EVERY_MS)
    }

    /** At most hourly, within the daily AI cap: turn waiting items into notes with the light model. */
    fun maybeExtract(context: Context) {
        val at = nextExtractAt(context)
        if (at == 0L || at > System.currentTimeMillis() + 60_000) return
        val repo = Repo(context)
        val waiting = repo.ingested().filter { !it.done }.take(Extract.MAX_ITEMS)
        repo.db.put("_extract:last", System.currentTimeMillis().toString())
        val today = Repo.today()
        val reply = AiRouter.tryComplete(context, "chat", personal = true, system = Extract.system(today), prompt = Extract.prompt(waiting), maxTokens = 1200)?.text ?: return
        val notes = Extract.parse(reply, today)
        repo.addNotes(notes, "ingest")
        repo.markIngestedDone(waiting.map { it.id }.toSet())
        if (notes.isNotEmpty()) repo.devlog("Asbab menyusun ${notes.size} catatan daripada notifikasi dan skrin.")
    }
}

/** Reads notifications from apps Amin allowed. Data only: it never replies or taps any action. */
class AsbabNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        Capture.load(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (Capture.paused) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
        val pkg = sbn.packageName ?: return
        if (pkg == packageName) return
        val cat = Privacy.category(pkg) ?: return
        val s = Capture.settings(applicationContext)
        if (!s.allowed(cat)) return
        val x = n.extras ?: return
        val title = x.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val conversation = x.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString().orEmpty()
        val big = x.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
        val lines = x.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n") { it.toString() }
        val text = big ?: lines ?: x.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val sub = x.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()
        Capture.intake(applicationContext, "notifikasi", pkg, if (conversation.isNotBlank()) "$conversation · $title" else title, text, listOf(conversation, sub))
    }
}
