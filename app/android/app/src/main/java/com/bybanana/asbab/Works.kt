package com.bybanana.asbab

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.bybanana.asbab.core.Backup
import com.bybanana.asbab.core.MALAYSIA
import com.bybanana.asbab.core.SiteCheck
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/** Background jobs run by Android's WorkManager (survive reboots, wait for internet). */
object Works {
    private const val SITES = "asbab-sites"
    private const val BACKUP = "asbab-backup"

    /** Starts or stops the jobs to match the data: websites to watch, backup repo set. */
    fun sync(context: Context) {
        val app = context.applicationContext
        val wm = WorkManager.getInstance(app)
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        if (Sites.watched(Repo(app)).isNotEmpty()) {
            wm.enqueueUniquePeriodicWork(SITES, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<SiteWorker>(15, TimeUnit.MINUTES).setConstraints(net).build())
        } else wm.cancelUniqueWork(SITES)
        if (Backups.repo(Repo(app)) != null) {
            wm.enqueueUniquePeriodicWork(BACKUP, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<BackupWorker>(24, TimeUnit.HOURS).setConstraints(net).build())
        } else wm.cancelUniqueWork(BACKUP)
    }
}

class SiteWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        Sites.checkAll(applicationContext)
        return Result.success()
    }
}

class BackupWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val r = Backups.run(applicationContext)
        return if (r.retry) Result.retry() else Result.success()
    }
}

/** Website monitoring every 15 minutes: tells Amin when a project's website goes down or recovers. */
object Sites {
    fun watched(repo: Repo): List<JSONObject> = try {
        val a = JSONArray(repo.db.get("projects") ?: "[]")
        (0 until a.length()).map { a.getJSONObject(it) }.filter { it.optString("url").startsWith("http") && !it.optBoolean("archived") }
    } catch (e: Exception) {
        emptyList()
    }

    private fun probe(url: String): Int? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 10_000
        c.readTimeout = 10_000
        c.setRequestProperty("User-Agent", "Asbab-monitor")
        try { c.responseCode } finally { c.disconnect() }
    } catch (e: Exception) {
        null
    }

    fun checkAll(context: Context) {
        val repo = Repo(context)
        val results = watched(repo).associate { it.optString("id") to SiteCheck.status(probe(it.optString("url"))) }
        if (results.isEmpty()) return
        val changes = mutableListOf<Triple<String, String, String>>() // id, name, message
        repo.db.update("projects") { raw ->
            val a = try { JSONArray(raw ?: "[]") } catch (e: Exception) { JSONArray() }
            for (i in 0 until a.length()) {
                val p = a.optJSONObject(i) ?: continue
                val st = results[p.optString("id")] ?: continue
                val old = if (p.isNull("status")) null else p.optString("status")
                SiteCheck.message(p.optString("name"), p.optString("url"), old, st)?.let { changes += Triple(p.optString("id"), p.optString("name"), it) }
                if (old != st) { p.put("status", st); p.put("checkedAt", System.currentTimeMillis()) }
            }
            a.toString()
        }
        for ((id, name, msg) in changes) {
            repo.addProactiveMessage(msg, "p-$id", name)
            Notifier.showSite(context, id, if (msg.contains("pulih")) "$name pulih" else "$name down", msg)
        }
    }
}

/** Daily encrypted backup of all data, personality and settings to Amin's private GitHub repo. */
object Backups {
    data class Outcome(val ok: Boolean, val message: String, val retry: Boolean = false)

    fun repo(r: Repo): String? = try {
        Backup.cleanRepo(JSONObject(r.db.get("settings") ?: "{}").optString("backupRepo"))
    } catch (e: Exception) {
        null
    }

    /** The identity export (same shape as the web UI's export), as JSON text. */
    fun export(context: Context, r: Repo): String {
        val data = JSONObject()
        for (k in r.db.keys("")) {
            if (Backup.skipKey(k)) continue
            val raw = r.db.get(k) ?: continue
            data.put(k, try { JSONTokener(raw).nextValue() } catch (e: Exception) { raw })
        }
        val version = try { context.packageManager.getPackageInfo(context.packageName, 0).versionName } catch (e: Exception) { "?" }
        return JSONObject().apply {
            put("asbab", "identiti"); put("version", version); put("exportedAt", java.time.Instant.now().toString()); put("data", data)
        }.toString()
    }

    fun run(context: Context): Outcome {
        val r = Repo(context)
        val out = attempt(context, r)
        r.db.put("_backup:last", JSONObject().apply { put("at", System.currentTimeMillis()); put("ok", out.ok); put("message", out.message) }.toString())
        if (!out.ok && !out.retry) r.devlog("Backup gagal: ${out.message}")
        return out
    }

    private fun attempt(context: Context, r: Repo): Outcome {
        val repo = repo(r) ?: return Outcome(false, "Repo backup belum ditetapkan.")
        val token = SecretStore.get(context, SecretStore.GITHUB) ?: return Outcome(false, "Token GitHub belum disimpan.")
        val pass = SecretStore.get(context, SecretStore.BACKUP) ?: return Outcome(false, "Frasa laluan backup belum disimpan.")
        val info = GitHub.request(token, "GET", "/repos/$repo", null)
        if (info.status == 0) return Outcome(false, GitHub.message(info), retry = true)
        if (info.status != 200) return Outcome(false, GitHub.message(info))
        // Safety: never write a backup into a public repo.
        if (!JSONObject(info.body).optBoolean("private", false)) return Outcome(false, "Repo $repo bukan Private. Asbab hanya simpan backup dalam repo Private.")
        val file = try { Backup.encrypt(export(context, r), pass).toString(2) } catch (e: Exception) { return Outcome(false, e.message ?: "Gagal menyulitkan backup.") }
        val date = ZonedDateTime.now(MALAYSIA).toLocalDate().toString()
        for (path in listOf("asbab-backup/$date.json", "asbab-backup/terkini.json")) {
            val existing = GitHub.request(token, "GET", "/repos/$repo/contents/$path", null)
            val sha = if (existing.status == 200) JSONObject(existing.body).optString("sha") else null
            val body = JSONObject().apply {
                put("message", "Asbab: backup $date")
                put("content", java.util.Base64.getEncoder().encodeToString(file.toByteArray(Charsets.UTF_8)))
                if (sha != null) put("sha", sha)
            }.toString()
            val res = GitHub.request(token, "PUT", "/repos/$repo/contents/$path", body)
            if (res.status == 0) return Outcome(false, GitHub.message(res), retry = true)
            if (res.status !in 200..299) return Outcome(false, GitHub.message(res))
        }
        return Outcome(true, "Backup $date disimpan dalam $repo.")
    }
}
