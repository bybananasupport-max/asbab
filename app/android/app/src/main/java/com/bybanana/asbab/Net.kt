package com.bybanana.asbab

import com.bybanana.asbab.core.Errors
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class NetError(message: String, val status: Int) : Exception(message)

/** Claude (Anthropic Messages API). The key is read from SecretStore by the caller and never reaches the web UI. */
object Claude {
    private const val URL_MESSAGES = "https://api.anthropic.com/v1/messages"

    private fun open(key: String, stream: Boolean): HttpURLConnection =
        (URL(URL_MESSAGES).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = if (stream) 120_000 else 60_000
            setRequestProperty("x-api-key", key)
            setRequestProperty("anthropic-version", "2023-06-01")
            setRequestProperty("content-type", "application/json")
        }

    private fun body(model: String, system: String, prompt: String, maxTokens: Int, stream: Boolean) = JSONObject().apply {
        put("model", model)
        put("max_tokens", maxTokens.coerceIn(16, 32_000))
        if (stream) put("stream", true)
        put("system", JSONArray().put(JSONObject().apply {
            put("type", "text"); put("text", system)
            put("cache_control", JSONObject().put("type", "ephemeral"))
        }))
        put("messages", JSONArray().put(JSONObject().apply { put("role", "user"); put("content", prompt) }))
    }.toString()

    private fun fail(c: HttpURLConnection): Nothing {
        val status = c.responseCode
        val raw = try { c.errorStream?.bufferedReader()?.readText() ?: "" } catch (e: IOException) { "" }
        val msg = try { JSONObject(raw).optJSONObject("error")?.optString("message") ?: raw } catch (e: Exception) { raw }
        throw NetError(Errors.claude(status, msg), status)
    }

    /** One complete answer (used by reminders and extraction). */
    fun complete(key: String, model: String, system: String, prompt: String, maxTokens: Int): String {
        val c = try { open(key, false) } catch (e: IOException) { throw NetError(Errors.claude(0, ""), 0) }
        try {
            c.outputStream.use { it.write(body(model, system, prompt, maxTokens, false).toByteArray()) }
            if (c.responseCode !in 200..299) fail(c)
            val o = JSONObject(c.inputStream.bufferedReader().readText())
            val parts = o.optJSONArray("content") ?: JSONArray()
            return (0 until parts.length()).map { parts.getJSONObject(it) }.filter { it.optString("type") == "text" }.joinToString("") { it.optString("text") }
        } catch (e: IOException) {
            throw NetError(Errors.claude(0, ""), 0)
        } finally {
            c.disconnect()
        }
    }

    /** Streams an answer, calling [onText] with the text so far. Returns the full text. */
    fun stream(key: String, model: String, system: String, prompt: String, maxTokens: Int, onText: (String) -> Unit): String {
        val c = try { open(key, true) } catch (e: IOException) { throw NetError(Errors.claude(0, ""), 0) }
        val out = StringBuilder()
        try {
            c.outputStream.use { it.write(body(model, system, prompt, maxTokens, true).toByteArray()) }
            if (c.responseCode !in 200..299) fail(c)
            var lastPush = 0L
            c.inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    if (!line.startsWith("data:")) continue
                    val ev = try { JSONObject(line.substring(5).trim()) } catch (e: Exception) { continue }
                    when (ev.optString("type")) {
                        "content_block_delta" -> {
                            val d = ev.optJSONObject("delta")
                            if (d?.optString("type") == "text_delta") {
                                out.append(d.optString("text"))
                                val now = System.currentTimeMillis()
                                if (now - lastPush > 60) { onText(out.toString()); lastPush = now }
                            }
                        }
                        "error" -> {
                            val m = ev.optJSONObject("error")?.optString("message") ?: "ralat"
                            if (out.isEmpty()) throw NetError(Errors.claude(529, m), 529)
                        }
                    }
                }
            }
            onText(out.toString())
            return out.toString()
        } catch (e: IOException) {
            if (out.isNotEmpty()) return out.toString()
            throw NetError(Errors.claude(0, ""), 0)
        } finally {
            c.disconnect()
        }
    }
}

/** GitHub REST API with the token from SecretStore. */
object GitHub {
    data class Reply(val status: Int, val body: String)

    fun request(token: String?, method: String, path: String, body: String?): Reply {
        require(path.startsWith("/")) { "path must start with /" }
        val c = (URL("https://api.github.com$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            setRequestProperty("User-Agent", "asbab-android")
            if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) c.outputStream.use { it.write(body.toByteArray()) }
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            return Reply(status, stream?.bufferedReader()?.readText() ?: "")
        } catch (e: IOException) {
            return Reply(0, "")
        } finally {
            c.disconnect()
        }
    }

    fun message(r: Reply): String = Errors.github(r.status, try { JSONObject(r.body).optString("message") } catch (e: Exception) { "" })
}
