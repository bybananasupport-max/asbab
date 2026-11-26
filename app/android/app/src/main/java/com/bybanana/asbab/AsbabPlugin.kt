package com.bybanana.asbab

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.speech.RecognizerIntent
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Bridge between the web UI (app/www) and Android: database, prayer times, reminders,
 * permission status and voice input. Exposed to JavaScript as Capacitor plugin "AsbabNative".
 */
@CapacitorPlugin(
    name = "AsbabNative",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class AsbabPlugin : Plugin() {
    private val db get() = AsbabDb.get(context)
    private val net = java.util.concurrent.Executors.newCachedThreadPool()

    /* ---------- database ---------- */

    @PluginMethod
    fun dbGet(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key diperlukan")
        call.resolve(JSObject().put("value", db.get(key)))
    }

    @PluginMethod
    fun dbPut(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key diperlukan")
        val value = call.getString("value") ?: return call.reject("value diperlukan")
        db.put(key, value)
        call.resolve()
    }

    @PluginMethod
    fun dbDel(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key diperlukan")
        db.del(key)
        call.resolve()
    }

    @PluginMethod
    fun dbKeys(call: PluginCall) {
        val keys = JSArray()
        for (k in db.keys(call.getString("prefix") ?: "")) keys.put(k)
        call.resolve(JSObject().put("keys", keys))
    }

    /* ---------- prayer times and reminders ---------- */

    /** JAKIM times for one day: {times: {date, hijri, fajr, ...}} or {times: null} when offline. */
    @PluginMethod
    fun prayerTimes(call: PluginCall) {
        val zone = (call.getString("zone") ?: "KDH01").uppercase()
        val date = call.getString("date") ?: return call.reject("date diperlukan")
        Scheduler.async {
            val p = Repo(context).prayerOrFetch(zone, date)
            call.resolve(JSObject().put("times", p?.let { JSObject(it.toJson().toString()) }))
        }
    }

    /** Re-plans every reminder. The UI calls this after changing notes, settings or prayer marks. */
    @PluginMethod
    fun reschedule(call: PluginCall) {
        Scheduler.async {
            Scheduler.reschedule(context)
            call.resolve()
        }
    }

    @PluginMethod
    fun testBilal(call: PluginCall) {
        val seconds = call.getInt("seconds") ?: 10
        Notifier.ensureChannels(context)
        Scheduler.armTest(context, seconds.coerceIn(3, 600))
        call.resolve()
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val out = JSObject()
        out.put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled())
        out.put("exactAlarms", Scheduler.canExact(context))
        out.put("sdk", Build.VERSION.SDK_INT)
        out.put("manufacturer", Build.MANUFACTURER)
        Scheduler.describeNext(context)?.let { out.put("next", JSObject(it.toString())) }
        call.resolve(out)
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            return call.resolve(JSObject().put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled()))
        }
        requestPermissionForAlias("notifications", call, "notificationsResult")
    }

    @PermissionCallback
    private fun notificationsResult(call: PluginCall) {
        Notifier.ensureChannels(context)
        call.resolve(JSObject().put("granted", getPermissionState("notifications") == PermissionState.GRANTED))
    }

    /** Opens an Android settings page: "notifications", "exactAlarm", "battery" or "app". */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        val pkg = context.packageName
        val intent = when (call.getString("page")) {
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            "exactAlarm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg")) else null
            "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            "notificationListener" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "usage" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$pkg"))
            else -> null
        } ?: Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
        try {
            activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }

    /** The page a tapped notification asked for (e.g. "#/hari-ini"), once. */
    @PluginMethod
    fun takeRoute(call: PluginCall) {
        val route = MainActivity.pendingRoute
        MainActivity.pendingRoute = null
        call.resolve(JSObject().put("route", route))
    }

    /* ---------- Phase 3: keys (never returned to the web UI) ---------- */

    @PluginMethod
    fun secretSet(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("name diperlukan")
        val value = call.getString("value")?.trim().orEmpty()
        if (name !in SecretStore.NAMES) return call.reject("Nama tak dikenali")
        if (value.isEmpty()) SecretStore.delete(context, name) else SecretStore.set(context, name, value)
        call.resolve(secretStatusObj())
    }

    @PluginMethod
    fun secretStatus(call: PluginCall) = call.resolve(secretStatusObj())

    private fun secretStatusObj() = JSObject().apply {
        for (n in SecretStore.NAMES) put(n, SecretStore.has(context, n))
    }

    /** "Uji sambungan" for Claude: a tiny request with the light model. */
    @PluginMethod
    fun testClaude(call: PluginCall) {
        val key = SecretStore.get(context, SecretStore.CLAUDE) ?: return call.resolve(JSObject().put("ok", false).put("detail", "Key Claude belum disimpan."))
        val model = call.getString("model") ?: "claude-haiku-5-5"
        net.execute {
            try {
                Claude.complete(key, model, "Balas dengan satu perkataan.", "Balas: ok", 16)
                call.resolve(JSObject().put("ok", true).put("detail", "Bersambung (model $model)."))
            } catch (e: NetError) {
                call.resolve(JSObject().put("ok", false).put("detail", e.message))
            }
        }
    }

    @PluginMethod
    fun testGithub(call: PluginCall) {
        val token = SecretStore.get(context, SecretStore.GITHUB) ?: return call.resolve(JSObject().put("ok", false).put("detail", "Token GitHub belum disimpan."))
        net.execute {
            val r = GitHub.request(token, "GET", "/user", null)
            if (r.status == 200) {
                val login = try { org.json.JSONObject(r.body).optString("login") } catch (e: Exception) { "" }
                call.resolve(JSObject().put("ok", true).put("detail", "Bersambung sebagai $login."))
            } else call.resolve(JSObject().put("ok", false).put("detail", GitHub.message(r)))
        }
    }

    /** Streams a Claude answer. Text arrives through "claudeDelta" events ({id, text}); resolves with {text}. */
    @PluginMethod
    fun claudeStream(call: PluginCall) {
        val key = SecretStore.get(context, SecretStore.CLAUDE) ?: return call.reject("Key Claude belum disimpan. Tampal dalam Tetapan > Sambungan & API.")
        val id = call.getString("id") ?: ""
        val model = call.getString("model") ?: "claude-haiku-5-5"
        val system = call.getString("system") ?: ""
        val prompt = call.getString("prompt") ?: return call.reject("prompt diperlukan")
        val maxTokens = call.getInt("maxTokens") ?: 1200
        net.execute {
            try {
                val text = Claude.stream(key, model, system, prompt, maxTokens) { soFar ->
                    notifyListeners("claudeDelta", JSObject().put("id", id).put("text", soFar))
                }
                call.resolve(JSObject().put("text", text))
            } catch (e: NetError) {
                call.reject(e.message)
            }
        }
    }

    /** GitHub API call with the saved token (or none). Resolves {status, body, message?}. */
    @PluginMethod
    fun github(call: PluginCall) {
        val method = (call.getString("method") ?: "GET").uppercase()
        val path = call.getString("path") ?: return call.reject("path diperlukan")
        if (!path.startsWith("/") || method !in setOf("GET", "POST", "PUT", "PATCH", "DELETE")) return call.reject("Permintaan GitHub tak sah")
        val body = call.getString("body")
        val token = SecretStore.get(context, SecretStore.GITHUB)
        net.execute {
            val r = GitHub.request(token, method, path, body)
            val out = JSObject().put("status", r.status).put("body", r.body)
            if (r.status !in 200..299) out.put("message", GitHub.message(r))
            call.resolve(out)
        }
    }

    /* ---------- Phase 3: phone access ---------- */

    @PluginMethod
    fun accessStatus(call: PluginCall) {
        val pkg = context.packageName
        val listeners = NotificationManagerCompat.getEnabledListenerPackages(context)
        val a11y = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        val repo = Repo(context)
        val items = repo.ingested()
        call.resolve(JSObject().apply {
            put("notificationListener", pkg in listeners)
            put("accessibility", a11y.split(':').any { it.startsWith("$pkg/") })
            put("usage", Usage.granted(context))
            put("overlay", Settings.canDrawOverlays(context))
            put("paused", repo.paused)
            put("service", AsbabService.needed(context))
            put("ingestTotal", items.size)
            put("ingestWaiting", items.count { !it.done })
        })
    }

    @PluginMethod
    fun setPaused(call: PluginCall) {
        Capture.setPaused(context, call.getBoolean("paused") ?: true)
        call.resolve(JSObject().put("paused", Capture.paused))
    }

    /** Starts or stops the foreground service to match the settings (call after saving settings). */
    @PluginMethod
    fun serviceSync(call: PluginCall) {
        Capture.invalidate()
        AsbabService.refresh(context)
        call.resolve()
    }

    @PluginMethod
    fun ingestClear(call: PluginCall) {
        Scheduler.async {
            Repo(context).clearIngested()
            call.resolve()
        }
    }

    /* ---------- voice input (Bahasa Melayu) ---------- */

    @PluginMethod
    fun listen(call: PluginCall) {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang") ?: "ms-MY")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Cakap dengan Asbab…")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        if (intent.resolveActivity(context.packageManager) == null) {
            return call.reject("Pengecam suara tiada dalam telefon ni. Pasang atau hidupkan app Google.")
        }
        startActivityForResult(call, intent, "voiceResult")
    }

    @ActivityCallback
    private fun voiceResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val text = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (text.isNullOrBlank()) call.resolve(JSObject().put("text", "")) else call.resolve(JSObject().put("text", text))
    }
}
