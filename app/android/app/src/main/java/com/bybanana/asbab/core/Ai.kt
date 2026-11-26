package com.bybanana.asbab.core

import org.json.JSONArray
import org.json.JSONObject

/*
 * Second brain with several AI providers (Phase 5.1).
 *
 * Everything here is pure (no network, no Android) so it is unit tested: how each provider's request
 * looks, how its streamed answer is read, how its model list is read and which model is picked by default,
 * how its errors are explained in Malay, and the fallback order.
 *
 * To add a provider later: write one object that implements ProviderSpec, add it to Providers.ALL, and add a
 * matching entry to PROVIDERS in app/www/ai.js. Nothing else needs to change.
 */

/** A provider error explained in Malay. limited = quota or rate limit (try the next provider). */
data class AiError(val message: String, val status: Int, val limited: Boolean)

/** One HTTP request, built without touching the network. */
data class HttpCall(val method: String, val url: String, val headers: Map<String, String>, val body: String?)

interface ProviderSpec {
    val id: String
    val label: String
    /** Default models before the list is loaded ("" = must load the list first). */
    val fallbackChat: String
    val fallbackCoding: String

    fun generate(key: String, model: String, system: String, prompt: String, maxTokens: Int, stream: Boolean): HttpCall
    /** Text added by one streamed line ("data: ..."), "" for nothing, null when the stream says it is done. */
    fun streamText(line: String): String?
    /** Error carried inside a streamed line, if any. */
    fun streamError(line: String): AiError? = null
    fun completeText(body: String): String
    fun listModels(key: String): HttpCall
    fun parseModels(body: String): List<String>
    fun pickDefault(models: List<String>, role: String): String?
    fun error(status: Int, body: String): AiError
}

object Providers {
    val ALL: List<ProviderSpec> = listOf(GeminiSpec, ClaudeSpec, OpenAiSpec)
    fun byId(id: String): ProviderSpec? = ALL.firstOrNull { it.id == id }
    val IDS get() = ALL.map { it.id }
}

/* ---------- shared helpers ---------- */

private fun dataOf(line: String): JSONObject? {
    val t = line.trim()
    if (!t.startsWith("data:")) return null
    val payload = t.substring(5).trim()
    if (payload.isEmpty() || payload == "[DONE]") return null
    return try { JSONObject(payload) } catch (e: Exception) { null }
}

private fun apiMessage(body: String): String = try {
    val e = JSONObject(body).opt("error")
    when (e) {
        is JSONObject -> e.optString("message").ifBlank { e.optString("type") }
        is String -> e
        else -> body
    }
} catch (ex: Exception) {
    body
}.take(200)

/** Version numbers inside a model id, for "newest first" sorting: "gemini-3.5-flash" -> [3, 5]. */
fun versionOf(id: String): List<Int> =
    Regex("(\\d+(?:[.-]\\d+)*)").find(id.substringAfter('-'))?.value?.split('.', '-')?.mapNotNull { it.toIntOrNull() }?.take(3) ?: emptyList()

private val newestFirst = Comparator<String> { a, b ->
    val x = versionOf(a); val y = versionOf(b)
    for (i in 0 until maxOf(x.size, y.size)) {
        val c = (y.getOrElse(i) { 0 }).compareTo(x.getOrElse(i) { 0 })
        if (c != 0) return@Comparator c
    }
    a.compareTo(b)
}

/** Shared plain-Malay explanation; providers add their own special cases first. */
private fun genericError(label: String, status: Int, msg: String): AiError {
    val m = msg.lowercase()
    return when {
        status == 0 -> AiError("$label: tak dapat dihubungi. Semak internet telefon.", 0, false)
        status == 401 || status == 403 -> AiError("$label: key salah, tamat tempoh atau tiada kebenaran. Simpan semula key dalam Sambungan & API.", status, false)
        status == 404 || (m.contains("model") && (m.contains("not found") || m.contains("does not exist"))) ->
            AiError("$label: nama model tak dijumpai. Tekan \"Muat senarai model\" dan pilih semula.", status, false)
        status == 429 -> AiError("$label: had penggunaan penyedia dah capai. Cuba lagi nanti.", 429, true)
        status >= 500 -> AiError("$label: pelayan sibuk atau ada masalah. Cuba lagi sekejap.", status, true)
        else -> AiError("$label: ralat $status. ${msg.take(140)}", status, false)
    }
}

/* ---------- Gemini (Google AI Studio API) ---------- */

object GeminiSpec : ProviderSpec {
    override val id = "gemini"
    override val label = "Gemini"
    override val fallbackChat = ""
    override val fallbackCoding = ""
    private const val BASE = "https://generativelanguage.googleapis.com/v1beta"

    // The key goes in a header, never in the URL (so it cannot end up in logs).
    private fun headers(key: String) = mapOf("x-goog-api-key" to key, "content-type" to "application/json")

    override fun generate(key: String, model: String, system: String, prompt: String, maxTokens: Int, stream: Boolean): HttpCall {
        val m = model.removePrefix("models/")
        val url = if (stream) "$BASE/models/$m:streamGenerateContent?alt=sse" else "$BASE/models/$m:generateContent"
        val body = JSONObject().apply {
            if (system.isNotBlank()) put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system))))
            put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", JSONArray().put(JSONObject().put("text", prompt)))))
            put("generationConfig", JSONObject().put("maxOutputTokens", maxTokens.coerceIn(16, 65_536)))
        }
        return HttpCall("POST", url, headers(key), body.toString())
    }

    private fun textOf(o: JSONObject): String {
        val parts = o.optJSONArray("candidates")?.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts") ?: return ""
        return (0 until parts.length()).mapNotNull { parts.optJSONObject(it) }
            .filter { !it.optBoolean("thought", false) } // skip hidden "thinking" parts
            .joinToString("") { it.optString("text") }
    }

    override fun streamText(line: String): String? {
        val o = dataOf(line) ?: return ""
        return textOf(o)
    }

    override fun streamError(line: String): AiError? {
        val o = dataOf(line) ?: return null
        val e = o.optJSONObject("error") ?: return null
        return error(e.optInt("code", 500), o.toString())
    }

    override fun completeText(body: String): String = textOf(JSONObject(body))

    override fun listModels(key: String) = HttpCall("GET", "$BASE/models?pageSize=1000", headers(key), null)

    override fun parseModels(body: String): List<String> {
        val a = JSONObject(body).optJSONArray("models") ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }
            .filter { m ->
                val methods = m.optJSONArray("supportedGenerationMethods")
                methods == null || (0 until methods.length()).any { methods.optString(it) == "generateContent" }
            }
            .map { it.optString("name").removePrefix("models/") }
            .filter { it.startsWith("gemini") }
    }

    private val SKIP = Regex("(image|tts|audio|live|embed|vision|aqa|learnlm|robotics|computer|native)", RegexOption.IGNORE_CASE)

    /** Newest stable "flash" model (not lite) for both roles: flash models are the ones usually on the free tier. */
    override fun pickDefault(models: List<String>, role: String): String? {
        val usable = models.filter { !SKIP.containsMatchIn(it) }
        val stable = usable.filter { !it.contains("preview") && !it.contains("exp") && !it.contains("latest") }
        fun best(list: List<String>) =
            list.filter { it.contains("flash") && !it.contains("lite") }.sortedWith(newestFirst).firstOrNull()
                ?: list.filter { it.contains("flash") }.sortedWith(newestFirst).firstOrNull()
        return best(stable) ?: best(usable) ?: usable.sortedWith(newestFirst).firstOrNull()
    }

    override fun error(status: Int, body: String): AiError {
        val msg = apiMessage(body)
        val m = (msg + body).lowercase()
        return when {
            m.contains("api key not valid") || m.contains("api_key_invalid") ->
                AiError("Gemini: key salah. Salin semula key dari aistudio.google.com.", status, false)
            status == 429 || m.contains("resource_exhausted") || m.contains("quota") ->
                AiError("Gemini: kuota habis (tier percuma ada had sehari). Cuba lagi esok atau guna penyedia lain.", 429, true)
            m.contains("location") && m.contains("not supported") ->
                AiError("Gemini: tak tersedia di lokasi ini.", status, false)
            else -> genericError(label, status, msg)
        }
    }
}

/* ---------- Claude (Anthropic API) ---------- */

object ClaudeSpec : ProviderSpec {
    override val id = "claude"
    override val label = "Claude"
    override val fallbackChat = "claude-haiku-5-5"
    override val fallbackCoding = "claude-sonnet-5-5"
    private const val BASE = "https://api.anthropic.com/v1"

    private fun headers(key: String) = mapOf("x-api-key" to key, "anthropic-version" to "2023-06-01", "content-type" to "application/json")

    override fun generate(key: String, model: String, system: String, prompt: String, maxTokens: Int, stream: Boolean): HttpCall {
        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", maxTokens.coerceIn(16, 32_000))
            if (stream) put("stream", true)
            if (system.isNotBlank()) put("system", JSONArray().put(JSONObject().apply {
                put("type", "text"); put("text", system); put("cache_control", JSONObject().put("type", "ephemeral"))
            }))
            put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", prompt)))
        }
        return HttpCall("POST", "$BASE/messages", headers(key), body.toString())
    }

    override fun streamText(line: String): String? {
        val o = dataOf(line) ?: return ""
        return when (o.optString("type")) {
            "content_block_delta" -> o.optJSONObject("delta")?.takeIf { it.optString("type") == "text_delta" }?.optString("text") ?: ""
            "message_stop" -> null
            else -> ""
        }
    }

    override fun streamError(line: String): AiError? {
        val o = dataOf(line) ?: return null
        if (o.optString("type") != "error") return null
        val m = o.optJSONObject("error")?.optString("message").orEmpty()
        return AiError("Claude: ${if (m.contains("overload", true)) "pelayan sibuk sekarang" else m.take(120)}.", 529, true)
    }

    override fun completeText(body: String): String {
        val parts = JSONObject(body).optJSONArray("content") ?: return ""
        return (0 until parts.length()).mapNotNull { parts.optJSONObject(it) }.filter { it.optString("type") == "text" }.joinToString("") { it.optString("text") }
    }

    override fun listModels(key: String) = HttpCall("GET", "$BASE/models?limit=100", headers(key), null)

    override fun parseModels(body: String): List<String> {
        val a = JSONObject(body).optJSONArray("data") ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("id") }.filter { it.startsWith("claude") }
    }

    /** Chat: newest Haiku (cheap, fast). Coding: newest Sonnet. */
    override fun pickDefault(models: List<String>, role: String): String? {
        val family = if (role == "coding") "sonnet" else "haiku"
        return models.filter { it.contains(family) }.sortedWith(newestFirst).firstOrNull()
            ?: models.sortedWith(newestFirst).firstOrNull()
    }

    override fun error(status: Int, body: String): AiError {
        val msg = apiMessage(body)
        val m = msg.lowercase()
        return when {
            m.contains("credit") || m.contains("billing") || m.contains("balance") ->
                AiError("Claude: kredit API habis. Tambah kredit di console.anthropic.com > Billing.", status, true)
            status == 529 || m.contains("overload") -> AiError("Claude: pelayan sibuk sekarang.", status, true)
            else -> genericError(label, status, msg)
        }
    }
}

/* ---------- OpenAI (OpenAI API) ---------- */

object OpenAiSpec : ProviderSpec {
    override val id = "openai"
    override val label = "OpenAI"
    override val fallbackChat = ""
    override val fallbackCoding = ""
    private const val BASE = "https://api.openai.com/v1"

    private fun headers(key: String) = mapOf("authorization" to "Bearer $key", "content-type" to "application/json")

    override fun generate(key: String, model: String, system: String, prompt: String, maxTokens: Int, stream: Boolean): HttpCall {
        val body = JSONObject().apply {
            put("model", model)
            val msgs = JSONArray()
            if (system.isNotBlank()) msgs.put(JSONObject().put("role", "system").put("content", system))
            msgs.put(JSONObject().put("role", "user").put("content", prompt))
            put("messages", msgs)
            put("max_completion_tokens", maxTokens.coerceIn(16, 64_000))
            if (stream) put("stream", true)
        }
        return HttpCall("POST", "$BASE/chat/completions", headers(key), body.toString())
    }

    override fun streamText(line: String): String? {
        val t = line.trim()
        if (t == "data: [DONE]" || t == "data:[DONE]") return null
        val o = dataOf(line) ?: return ""
        return o.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta")?.optString("content", "") ?: ""
    }

    override fun streamError(line: String): AiError? {
        val o = dataOf(line) ?: return null
        if (!o.has("error")) return null
        return error(500, o.toString())
    }

    override fun completeText(body: String): String =
        JSONObject(body).optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content", "") ?: ""

    override fun listModels(key: String) = HttpCall("GET", "$BASE/models", headers(key), null)

    override fun parseModels(body: String): List<String> {
        val a = JSONObject(body).optJSONArray("data") ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("id") }
    }

    private val SKIP = Regex("(audio|realtime|search|transcribe|tts|image|embedding|moderation|instruct|vision|codex)", RegexOption.IGNORE_CASE)
    private val DATED = Regex("-\\d{4}-\\d{2}-\\d{2}$")

    /** Chat: newest "gpt-…-mini". Coding: newest full "gpt-…". Dated snapshots and special-purpose models are skipped. */
    override fun pickDefault(models: List<String>, role: String): String? {
        val usable = models.filter { it.startsWith("gpt-") && !SKIP.containsMatchIn(it) && !DATED.containsMatchIn(it) }
        val mini = usable.filter { Regex("^gpt-[\\d.]+-mini$").matches(it) }
        val full = usable.filter { Regex("^gpt-[\\d.]+$").matches(it) }
        val pick = if (role == "coding") full.ifEmpty { usable } else mini.ifEmpty { usable }
        return pick.sortedWith(newestFirst).firstOrNull()
    }

    override fun error(status: Int, body: String): AiError {
        val msg = apiMessage(body)
        val m = (msg + body).lowercase()
        return when {
            m.contains("insufficient_quota") || m.contains("exceeded your current quota") ->
                AiError("OpenAI: kredit atau kuota habis. Tambah kredit di platform.openai.com > Billing.", 429, true)
            m.contains("invalid_api_key") || m.contains("incorrect api key") ->
                AiError("OpenAI: key salah. Salin semula key dari platform.openai.com.", 401, false)
            else -> genericError(label, status, msg)
        }
    }
}

/* ---------- settings, usage and fallback order ---------- */

data class ProviderConfig(val on: Boolean, val chatModel: String, val codingModel: String, val cap: Int, val personal: Boolean) {
    fun model(role: String) = if (role == "coding") codingModel else chatModel
}

data class AiConfig(
    val enabled: Boolean,
    val roles: Map<String, String>,
    val order: List<String>,
    val providers: Map<String, ProviderConfig>,
) {
    /**
     * Providers to try for a role, in order: the one chosen for the role first, then the fallback order.
     * Only providers that are switched on, have a key, are under their own daily cap, and (for data read from
     * other apps) allow personal notifications.
     */
    fun chain(role: String, personal: Boolean, hasKey: (String) -> Boolean, used: (String) -> Int): List<String> {
        if (!enabled) return emptyList()
        val first = roles[role]
        val ids = (listOfNotNull(first) + order + Providers.IDS).distinct()
        return ids.filter { id ->
            val p = providers[id] ?: return@filter false
            Providers.byId(id) != null && p.on && hasKey(id) && used(id) < p.cap && (!personal || p.personal)
        }
    }

    /** Everything that could ever be used, ignoring today's usage (for "is a second brain connected?"). */
    fun anyReady(hasKey: (String) -> Boolean) = enabled && providers.any { (id, p) -> p.on && hasKey(id) }

    fun totalCap(hasKey: (String) -> Boolean) = providers.filter { (id, p) -> p.on && hasKey(id) }.values.sumOf { it.cap }

    companion object {
        val DEFAULT_ORDER = listOf("gemini", "claude", "openai")

        /**
         * Reads settings.ai (same shape as app/www/ai.js). Older settings without "ai" are migrated:
         * Claude keeps the model names and daily cap Amin set before.
         */
        fun from(settings: JSONObject?): AiConfig {
            val s = settings ?: JSONObject()
            val ai = s.optJSONObject("ai") ?: JSONObject()
            val legacyCap = s.optInt("aiDailyCap", 60)
            val provs = ai.optJSONObject("providers") ?: JSONObject()
            val map = Providers.ALL.associate { spec ->
                val o = provs.optJSONObject(spec.id) ?: JSONObject()
                val legacyChat = if (spec.id == "claude") s.optString("modelLight") else ""
                val legacyCoding = if (spec.id == "claude") s.optString("modelHeavy") else ""
                spec.id to ProviderConfig(
                    on = o.optBoolean("on", true),
                    chatModel = o.optString("chatModel").ifBlank { legacyChat.ifBlank { spec.fallbackChat } },
                    codingModel = o.optString("codingModel").ifBlank { legacyCoding.ifBlank { spec.fallbackCoding } },
                    cap = o.optInt("cap", if (spec.id == "gemini") 20 else legacyCap).coerceIn(0, 10_000),
                    personal = o.optBoolean("personal", false),
                )
            }
            val rolesObj = ai.optJSONObject("roles")
            val roles = mapOf(
                "chat" to (rolesObj?.optString("chat")?.takeIf { Providers.byId(it) != null } ?: "gemini"),
                "coding" to (rolesObj?.optString("coding")?.takeIf { Providers.byId(it) != null } ?: "gemini"),
            )
            val orderArr = ai.optJSONArray("order")
            val order = ((if (orderArr != null) (0 until orderArr.length()).map { orderArr.optString(it) } else emptyList()) + DEFAULT_ORDER)
                .filter { Providers.byId(it) != null }.distinct()
            return AiConfig(s.optBoolean("aiEnabled", true), roles, order, map)
        }
    }
}

/** Daily usage record "usage:<date>": {"count": total, "by": {"gemini": 3, ...}}. */
object AiUsage {
    fun parse(raw: String?): Pair<Int, Map<String, Int>> = try {
        val o = JSONObject(raw ?: "{}")
        val by = o.optJSONObject("by")
        o.optInt("count", 0) to (by?.keys()?.asSequence()?.associateWith { by.optInt(it) } ?: emptyMap())
    } catch (e: Exception) {
        0 to emptyMap()
    }

    fun bump(raw: String?, provider: String): String {
        val o = try { JSONObject(raw ?: "{}") } catch (e: Exception) { JSONObject() }
        val by = o.optJSONObject("by") ?: JSONObject()
        by.put(provider, by.optInt(provider, 0) + 1)
        o.put("by", by)
        o.put("count", o.optInt("count", 0) + 1)
        return o.toString()
    }
}
