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
