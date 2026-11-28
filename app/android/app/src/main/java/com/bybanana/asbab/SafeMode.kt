package com.bybanana.asbab

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Phase 7.2 "Mod selamat" and crash reports.
 * - Every crash is written to files/crash.log (newest at the end), so one tap in Asbab turns it into a
 *   "Baiki bug" request with the log.
 * - Each start counts as a failed opening until the web UI says it opened fine (AsbabPlugin.bootOk).
 *   After 3 failed openings in a row Asbab offers to go back to the previous version. A backup to the
 *   backup repo runs first, and Amin sees "Backup selesai" before anything else happens.
 */
object SafeMode {
    private const val KEY = "_boot:gagal"
    private const val LIMIT = 3

    @JvmStatic
    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
                val f = File(app.filesDir, "crash.log")
                f.appendText("=== $stamp versi ${version(app)} (${t.name})\n${e.stackTraceToString().take(6000)}\n")
                if (f.length() > 60_000) f.writeText(f.readText().takeLast(40_000))
            } catch (ignored: Throwable) {
            }
            previous?.uncaughtException(t, e)
        }
    }

    private fun version(c: Context): String = try { c.packageManager.getPackageInfo(c.packageName, 0).versionName ?: "?" } catch (e: Exception) { "?" }

    /** Called at every start: counts the opening and, after repeated failures, offers to go back. */
    @JvmStatic
    fun onStart(activity: Activity) {
        val db = AsbabDb.get(activity)
        val n = (db.get(KEY)?.toIntOrNull() ?: 0) + 1
        db.put(KEY, n.toString())
        if (n < LIMIT) return
        val prev = try { JSONObject("{\"v\":${db.get("versi:sebelum") ?: "null"}}").optString("v") } catch (e: Exception) { "" }
        if (prev.isBlank() || prev == "null") return
        AlertDialog.Builder(activity)
            .setTitle("Mod selamat")
            .setMessage("Asbab gagal dibuka $n kali berturut-turut selepas kemas kini. Nak kembali ke versi sebelum ($prev)?\n\nAsbab akan buat backup dulu, kemudian bina semula versi $prev dengan nombor versi baharu. Kau akan dapat notifikasi bila sedia untuk dipasang.")
            .setPositiveButton("Patah balik") { _, _ -> rollBack(activity, prev) }
            .setNegativeButton("Cuba lagi", null)
            .show()
    }

    private fun rollBack(activity: Activity, prev: String) {
        val app = activity.applicationContext
        val main = Handler(Looper.getMainLooper())
        Toast.makeText(app, "Backup sedang dibuat…", Toast.LENGTH_SHORT).show()
        Thread {
            val backup = Backups.run(app)
            main.post {
                if (!backup.ok) {
                    AlertDialog.Builder(activity).setTitle("Backup gagal")
                        .setMessage("${backup.message}\n\nPatah balik dibatalkan supaya data kau selamat. Cuba lagi bila ada internet.")
                        .setPositiveButton("OK", null).show()
                    return@post
                }
                Toast.makeText(app, "Backup selesai", Toast.LENGTH_SHORT).show()
                Thread {
                    val body = JSONObject().put("ref", "main").put("inputs", JSONObject().put("ref", "v$prev")).toString()
                    val r = GitHub.request(SecretStore.get(app, "github"), "POST", "/repos/bybananasupport-max/asbab/actions/workflows/android.yml/dispatches", body)
                    main.post {
                        val ok = r.status in 200..299
                        AlertDialog.Builder(activity).setTitle(if (ok) "Backup selesai" else "Patah balik gagal")
                            .setMessage(if (ok) "Binaan versi $prev dimulakan. Dalam beberapa minit, kemas kini muncul dalam Tetapan > Tentang Asbab." else GitHub.message(r))
                            .setPositiveButton("OK", null).show()
                    }
                }.start()
            }
        }.start()
    }
}
