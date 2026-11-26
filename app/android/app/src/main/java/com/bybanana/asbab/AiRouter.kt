package com.bybanana.asbab

import android.content.Context
import com.bybanana.asbab.core.AiConfig
import com.bybanana.asbab.core.AiError
import com.bybanana.asbab.core.HttpCall
import com.bybanana.asbab.core.ProviderSpec
import com.bybanana.asbab.core.Providers
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class AiFailure(val error: AiError) : Exception(error.message)

/** Network side of a provider: sends the requests that core/Ai.kt describes. */
object AiClient {
    private fun open(call: HttpCall, readTimeoutMs: Int): HttpURLConnection =
        (URL(call.url).openConnection() as HttpURLConnection).apply {
            requestMethod = call.method
            connectTimeout = 15_000
            readTimeout = readTimeoutMs
            for ((k, v) in call.headers) setRequestProperty(k, v)
            if (call.body != null) doOutput = true
        }

    private fun fail(spec: ProviderSpec, c: HttpURLConnection): Nothing {
        val status = c.responseCode
        val raw = try { c.errorStream?.bufferedReader()?.readText() ?: "" } catch (e: IOException) { "" }
        throw AiFailure(spec.error(status, raw))
    }

    private fun offline(spec: ProviderSpec) = AiFailure(spec.error(0, ""))

    fun complete(spec: ProviderSpec, key: String, model: String, system: String, prompt: String, maxTokens: Int): String {
        val call = spec.generate(key, model, system, prompt, maxTokens, false)
        val c = try { open(call, 90_000) } catch (e: IOException) { throw offline(spec) }
        try {
            call.body?.let { b -> c.outputStream.use { it.write(b.toByteArray()) } }
            if (c.responseCode !in 200..299) fail(spec, c)
            return spec.completeText(c.inputStream.bufferedReader().readText())
        } catch (e: IOException) {
            throw offline(spec)
        } finally {
            c.disconnect()
        }
    }

    /** Streams an answer; [onText] gets the text so far. A broken stream after some text returns that text. */
    fun stream(spec: ProviderSpec, key: String, model: String, system: String, prompt: String, maxTokens: Int, onText: (String) -> Unit): String {
        val call = spec.generate(key, model, system, prompt, maxTokens, true)
        val c = try { open(call, 120_000) } catch (e: IOException) { throw offline(spec) }
        val out = StringBuilder()
        try {
            call.body?.let { b -> c.outputStream.use { it.write(b.toByteArray()) } }
            if (c.responseCode !in 200..299) fail(spec, c)
            var last = 0L
            c.inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    spec.streamError(line)?.let { if (out.isEmpty()) throw AiFailure(it) }
                    val piece = spec.streamText(line) ?: break
                    if (piece.isEmpty()) continue
                    out.append(piece)
                    val now = System.currentTimeMillis()
                    if (now - last > 60) { onText(out.toString()); last = now }
                }
            }
            onText(out.toString())
            if (out.isEmpty()) throw AiFailure(AiError("${spec.label}: jawapan kosong.", 200, true))
            return out.toString()
        } catch (e: IOException) {
            if (out.isNotEmpty()) return out.toString()
            throw offline(spec)
        } finally {
            c.disconnect()
        }
    }

    fun listModels(spec: ProviderSpec, key: String): List<String> {
        val call = spec.listModels(key)
        val c = try { open(call, 30_000) } catch (e: IOException) { throw offline(spec) }
        try {
            if (c.responseCode !in 200..299) fail(spec, c)
            return spec.parseModels(c.inputStream.bufferedReader().readText())
        } catch (e: IOException) {
            throw offline(spec)
        } finally {
            c.disconnect()
        }
    }
}

/**
 * Picks a provider for a role ("chat" or "coding") and falls back through Amin's order when one fails or is
 * out of quota. Counts usage per provider. Returns null-safe results so callers can fall back to the own brain.
 */
object AiRouter {
    data class Answer(val text: String, val provider: String, val label: String, val model: String, val fallback: Boolean, val failures: List<String>)

    fun config(context: Context): AiConfig = AiConfig.from(try { JSONObject(AsbabDb.get(context).get("settings") ?: "{}") } catch (e: Exception) { null })

    fun hasKey(context: Context, id: String) = SecretStore.has(context, id)

    /** Message shown when nothing worked; the own brain answers instead. */
    fun allFailedMessage(failures: List<String>): String =
        if (failures.isEmpty()) "Tiada otak kedua yang hidup dan ada key sekarang (atau had harian semua penyedia dah habis). Aku jawab dari catatan aku sendiri."
        else "Semua otak kedua tak dapat dihubungi sekarang (${failures.joinToString("; ")}). Aku jawab dari catatan aku sendiri."

    /**
     * Runs the request through the fallback chain. personal = the prompt contains data read from other apps
     * (only providers with "Hantar notifikasi peribadi kepada AI" switched on may receive it).
     */
    fun run(
        context: Context, role: String, personal: Boolean, system: String, prompt: String, maxTokens: Int,
        onText: ((String) -> Unit)?,
    ): Answer {
        val repo = Repo(context)
        val cfg = config(context)
        val chain = cfg.chain(role, personal, { hasKey(context, it) }, { repo.usageFor(it) })
        val failures = mutableListOf<String>()
        for ((i, id) in chain.withIndex()) {
            val spec = Providers.byId(id) ?: continue
            val key = SecretStore.get(context, id) ?: continue
            val model = cfg.providers[id]?.model(role).orEmpty()
            if (model.isBlank()) { failures += "${spec.label}: model belum dipilih"; continue }
            try {
                onText?.invoke("")
                val text = if (onText != null) AiClient.stream(spec, key, model, system, prompt, maxTokens, onText)
                else AiClient.complete(spec, key, model, system, prompt, maxTokens)
                repo.bumpUsage(id)
                return Answer(text, id, spec.label, model, i > 0, failures)
            } catch (e: AiFailure) {
                failures += e.error.message
            } catch (e: Exception) {
                failures += "${spec.label}: ${e.message ?: "ralat"}"
            }
        }
        throw AiFailure(AiError(allFailedMessage(failures), 0, true))
    }

    /** Same as [run] but returns null instead of throwing (reminders and extraction). */
    fun tryComplete(context: Context, role: String, personal: Boolean, system: String, prompt: String, maxTokens: Int): Answer? =
        try { run(context, role, personal, system, prompt, maxTokens, null) } catch (e: Exception) { null }
}
