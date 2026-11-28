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
        val voice = MainActivity.pendingVoice
        MainActivity.pendingRoute = null
        MainActivity.pendingVoice = null
        call.resolve(JSObject().put("route", route).put("text", voice))
    }

    /* ---------- Phase 4: floating moon button ---------- */

    /** Re-reads the moon button settings (call after saving Tetapan > Butang Terapung). */
    @PluginMethod
    fun bubbleSync(call: PluginCall) {
        if (call.getBoolean("unhide") == true) db.del("_bubble:hidden")
        if (call.getBoolean("resetPosition") == true) db.del("_bubble:pos")
        Overlay.remove()
        AsbabService.refresh(context)
        Overlay.sync(context)
        call.resolve(JSObject().put("hidden", db.get("_bubble:hidden") == "1"))
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

    /* ---------- Phase 5.1: several AI providers (Gemini, Claude, OpenAI) ---------- */

    private fun errObj(e: com.bybanana.asbab.core.AiError) = JSObject().put("ok", false).put("detail", e.message).put("raw", e.detail)

    /**
     * Models this key can use, plus the ones Asbab would pick for Chat and Coding (and the fastest "lite" one).
     * Always resolves: {ok, models, chat, coding, lite} or {ok:false, detail, raw}, so the screen never waits forever.
     */
    @PluginMethod
    fun aiListModels(call: PluginCall) {
        val spec = com.bybanana.asbab.core.Providers.byId(call.getString("provider") ?: "") ?: return call.reject("Penyedia tak dikenali")
        val key = SecretStore.get(context, spec.id) ?: return call.resolve(JSObject().put("ok", false).put("detail", "${spec.label}: key belum disimpan.").put("raw", ""))
        net.execute {
            try {
                val models = AiClient.listModels(spec, key).distinct().sorted()
                call.resolve(JSObject().apply {
                    put("ok", true)
                    put("models", JSArray().apply { models.forEach { put(it) } })
                    put("chat", spec.pickDefault(models, "chat"))
                    put("coding", spec.pickDefault(models, "coding"))
                    if (spec is com.bybanana.asbab.core.GeminiSpec) put("lite", spec.pickLite(models))
                })
            } catch (e: AiFailure) {
                call.resolve(errObj(e.error))
            } catch (e: Throwable) {
                call.resolve(errObj(AiClient.network(spec, e, AiClient.LIST_MS).error))
            }
        }
    }

    /**
     * "Uji sambungan": a tiny request to the chosen model (short time limit). For Gemini, if that model is too
     * slow (timeout), Asbab tries the newest Flash-Lite model and reports it as {switchTo}.
     */
    @PluginMethod
    fun aiTest(call: PluginCall) {
        val spec = com.bybanana.asbab.core.Providers.byId(call.getString("provider") ?: "") ?: return call.reject("Penyedia tak dikenali")
        val key = SecretStore.get(context, spec.id) ?: return call.resolve(JSObject().put("ok", false).put("detail", "Key ${spec.label} belum disimpan.").put("raw", ""))
        val model = call.getString("model").orEmpty()
        if (model.isBlank()) return call.resolve(JSObject().put("ok", false).put("detail", "Pilih model dulu (tekan \"Muat senarai model\").").put("raw", ""))
        net.execute {
            val started = System.currentTimeMillis()
            fun ping(m: String) = AiClient.complete(spec, key, m, "Balas dengan satu perkataan sahaja.", "Balas: ok", 256, AiClient.TEST_MS)
            try {
                ping(model)
                Repo(context).bumpUsage(spec.id)
                call.resolve(JSObject().put("ok", true).put("detail", "Bersambung (model $model, ${(System.currentTimeMillis() - started) / 100 / 10.0} saat)."))
            } catch (e: Throwable) {
                val err = (e as? AiFailure)?.error ?: AiClient.network(spec, e, AiClient.TEST_MS).error
                val timedOut = err.detail.startsWith("SocketTimeoutException")
                if (timedOut && spec is com.bybanana.asbab.core.GeminiSpec) {
                    val lite = try { spec.pickLite(AiClient.listModels(spec, key)) } catch (x: Throwable) { null }
                    if (lite != null && lite != model) {
                        try {
                            ping(lite)
                            Repo(context).bumpUsage(spec.id)
                            return@execute call.resolve(JSObject().put("ok", true).put("switchTo", lite)
                                .put("detail", "$model terlalu perlahan (tiada jawapan dalam ${AiClient.TEST_MS / 1000} saat). $lite berjaya, jadi model Chat ditukar ke $lite.")
                                .put("raw", err.detail))
                        } catch (x: Throwable) {
                            val e2 = (x as? AiFailure)?.error ?: AiClient.network(spec, x, AiClient.TEST_MS).error
                            return@execute call.resolve(errObj(err.copy(message = "${err.message} Cubaan dengan $lite juga gagal: ${e2.message}", detail = "${err.detail} | $lite: ${e2.detail}")))
                        }
                    }
                }
                call.resolve(errObj(err))
            }
        }
    }

    /**
     * Second brain answer for a role ("chat" or "coding") with automatic fallback. Text arrives through
     * "aiDelta" events ({id, text}); resolves {text, provider, label, model, fallback, failures}.
     * Rejects with a plain-Malay message when every provider failed (the UI then answers with the own brain).
     */
    @PluginMethod
    fun aiStream(call: PluginCall) {
        val id = call.getString("id") ?: ""
        val role = if (call.getString("role") == "coding") "coding" else "chat"
        val system = call.getString("system") ?: ""
        val prompt = call.getString("prompt") ?: return call.reject("prompt diperlukan")
        val maxTokens = call.getInt("maxTokens") ?: if (role == "coding") 16_000 else 1_200
        val prefer = call.getString("prefer")?.takeIf { it != "auto" }
        // Phase 6.2: pictures, PDF and video sent with the message (base64, compressed in the web UI).
        val parts = try {
            val arr = call.getArray("parts")
            if (arr == null) emptyList() else (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                val data = o.optString("data")
                if (data.isBlank()) null else com.bybanana.asbab.core.Part(o.optString("mime"), data, o.optString("name"))
            }
        } catch (e: Exception) { emptyList() }
        net.execute {
            try {
                val a = AiRouter.run(context, role, false, system, prompt, maxTokens, { soFar ->
                    notifyListeners("aiDelta", JSObject().put("id", id).put("text", soFar))
                }, prefer, parts) { stopped.contains(id) }
                stopped.remove(id)
                call.resolve(JSObject().apply {
                    put("text", a.text); put("provider", a.provider); put("label", a.label); put("model", a.model)
                    put("fallback", a.fallback); put("failures", JSArray().apply { a.failures.forEach { put(it) } })
                    put("note", a.note)
                })
            } catch (e: AiFailure) {
                call.reject(e.error.message)
            } catch (e: Throwable) {
                call.reject("Otak kedua: ralat tak dijangka [${e.javaClass.simpleName}: ${e.message ?: ""}]")
            }
        }
    }

    /** Answers whose "Berhenti" button was pressed; the stream stops at its next line. */
    private val stopped: MutableSet<String> = java.util.Collections.synchronizedSet(mutableSetOf())

    @PluginMethod
    fun aiStop(call: PluginCall) {
        call.getString("id")?.let { stopped.add(it) }
        call.resolve()
    }

    /* ---------- Phase 6.2: attachments stay on this phone only (not in the GitHub backup) ---------- */

    private fun attachFile(id: String) = java.io.File(java.io.File(context.filesDir, "lampiran").apply { mkdirs() }, id.replace(Regex("[^A-Za-z0-9._-]"), "_"))

    @PluginMethod
    fun attachPut(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id diperlukan")
        val data = call.getString("data") ?: return call.reject("data diperlukan")
        net.execute {
            try { attachFile(id).writeText(data); call.resolve() } catch (e: Exception) { call.reject("Lampiran tak dapat disimpan: ${e.message}") }
        }
    }

    @PluginMethod
    fun attachGet(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id diperlukan")
        net.execute {
            val f = attachFile(id)
            if (!f.exists()) call.resolve(JSObject().put("data", null as String?))
            else try { call.resolve(JSObject().put("data", f.readText())) } catch (e: Exception) { call.reject("Lampiran tak dapat dibaca.") }
        }
    }

    /** Reads text in a picture on the phone itself (no AI), used for receipts. */
    @PluginMethod
    fun ocr(call: PluginCall) {
        val data = call.getString("data") ?: return call.reject("data diperlukan")
        try {
            val bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT)
            val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return call.resolve(JSObject().put("ok", false).put("text", ""))
            com.google.mlkit.vision.text.TextRecognition.getClient(com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS)
                .process(com.google.mlkit.vision.common.InputImage.fromBitmap(bmp, 0))
                .addOnSuccessListener { r -> call.resolve(JSObject().put("ok", true).put("text", r.text)) }
                .addOnFailureListener { e -> call.resolve(JSObject().put("ok", false).put("text", "").put("detail", e.message ?: "")) }
        } catch (e: Throwable) {
            call.resolve(JSObject().put("ok", false).put("text", "").put("detail", e.message ?: e.javaClass.simpleName))
        }
    }

    @PluginMethod
    fun shareText(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text diperlukan")
        try {
            val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
            activity.startActivity(Intent.createChooser(send, "Kongsi"))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Tak dapat kongsi: ${e.message}")
        }
    }

    /**
     * Chat screen: a strip on the left edge (200dp tall, from 30% of the height) is taken from Android's back
     * gesture so a swipe there can open the drawer. Off on other pages.
     */
    @PluginMethod
    fun edgeSwipe(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        activity.runOnUiThread {
            try {
                val wv = bridge.webView
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val d = context.resources.displayMetrics.density
                    val top = (wv.height * 0.3f).toInt()
                    wv.systemGestureExclusionRects = if (on) listOf(android.graphics.Rect(0, top, (28 * d).toInt(), top + (200 * d).toInt())) else emptyList()
                }
            } catch (e: Exception) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun copyText(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text diperlukan")
        val cm = context.getSystemService(android.content.ClipboardManager::class.java)
        cm.setPrimaryClip(android.content.ClipData.newPlainText("Asbab", text))
        call.resolve()
    }

    /** Today's usage per provider: {count, by: {gemini: n, ...}}. */
    @PluginMethod
    fun aiUsage(call: PluginCall) {
        val (count, by) = com.bybanana.asbab.core.AiUsage.parse(db.get("usage:${Repo.today()}"))
        call.resolve(JSObject().put("count", count).put("by", JSObject().apply { for ((k, v) in by) put(k, v) }))
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

    /* ---------- Phase 5: website monitoring and backup ---------- */

    /** Starts/stops website monitoring and the daily backup to match the data. */
    @PluginMethod
    fun workSync(call: PluginCall) {
        Scheduler.async {
            try { Works.sync(context) } catch (e: Exception) { android.util.Log.e("Asbab", "works", e) }
            call.resolve()
        }
    }

    /** Checks every watched website now (also runs by itself every 15 minutes). */
    @PluginMethod
    fun checkSites(call: PluginCall) {
        net.execute {
            Sites.checkAll(context)
            call.resolve()
        }
    }

    @PluginMethod
    fun backupNow(call: PluginCall) {
        net.execute {
            val r = Backups.run(context)
            call.resolve(JSObject().put("ok", r.ok).put("message", r.message))
        }
    }

    @PluginMethod
    fun backupStatus(call: PluginCall) {
        val last = db.get("_backup:last")?.let { JSObject(it) }
        call.resolve(JSObject().put("last", last))
    }

    /** Shares a text file (manual export) through Android's share sheet. */
    @PluginMethod
    fun shareFile(call: PluginCall) {
        val name = (call.getString("name") ?: "asbab.json").replace(Regex("[^A-Za-z0-9._-]"), "_")
        val text = call.getString("text") ?: return call.reject("text diperlukan")
        try {
            val dir = java.io.File(context.cacheDir, "share").apply { mkdirs() }
            val f = java.io.File(dir, name).apply { writeText(text) }
            val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(send, "Simpan atau kongsi backup Asbab"))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Tak dapat kongsi fail: ${e.message}")
        }
    }

    /* ---------- Phase 6.1: Amin's own Mod Bilal / azan audio, widget ---------- */

    /** Opens the phone's file picker for an audio file; Asbab keeps permission to play it later. */
    @PluginMethod
    fun pickAudio(call: PluginCall) {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "audio/*"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(call, i, "audioResult")
    }

    @ActivityCallback
    private fun audioResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data ?: return call.resolve(JSObject().put("uri", null))
        try {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (e: Exception) {
            android.util.Log.w("Asbab", "persist uri", e)
        }
        var name = uri.lastPathSegment ?: "audio"
        try {
            context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0) ?: name
            }
        } catch (e: Exception) {}
        call.resolve(JSObject().put("uri", uri.toString()).put("name", name))
    }

    /** "Cuba bunyi": plays the Mod Bilal or azan setting now ({kind: "bilal"|"azan"}). */
    @PluginMethod
    fun soundTest(call: PluginCall) {
        val s = Repo(context).settings()
        if (call.getString("kind") == "azan") {
            if (s.azanSound.isBlank()) return call.reject("Pilih fail azan dulu.")
            SoundService.play(context, s.azanSound, s.azanVolume, "Cuba azan")
        } else when {
            s.bilalVibrateOnly -> SoundService.vibrate(context)
            s.bilalSound.isNotBlank() -> SoundService.play(context, s.bilalSound, s.bilalVolume, "Cuba bunyi Mod Bilal")
            else -> Notifier.showTest(context)
        }
        call.resolve()
    }

    @PluginMethod
    fun soundStop(call: PluginCall) {
        SoundService.stop(context)
        call.resolve()
    }

    @PluginMethod
    fun widgetUpdate(call: PluginCall) {
        Scheduler.async { try { AsbabWidget.update(context) } catch (e: Exception) {}; call.resolve() }
    }

    /** Spending limit check after a note is saved in the app (warning message + notification once). */
    @PluginMethod
    fun budgetCheck(call: PluginCall) {
        Scheduler.async { try { Budget.check(context, Repo(context)) } catch (e: Exception) {}; call.resolve() }
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
