package com.bybanana.asbab.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AiTest {
    /* ---------- requests ---------- */

    @Test
    fun geminiRequestKeepsKeyOutOfUrl() {
        val c = GeminiSpec.generate("KEY123", "gemini-9.9-flash", "Kau Asbab", "Hai", 500, true)
        assertEquals("https://generativelanguage.googleapis.com/v1beta/models/gemini-9.9-flash:streamGenerateContent?alt=sse", c.url)
        assertFalse(c.url.contains("KEY123"))
        assertEquals("KEY123", c.headers["x-goog-api-key"])
        val b = JSONObject(c.body!!)
        assertEquals("Kau Asbab", b.getJSONObject("systemInstruction").getJSONArray("parts").getJSONObject(0).getString("text"))
        assertEquals("Hai", b.getJSONArray("contents").getJSONObject(0).getJSONArray("parts").getJSONObject(0).getString("text"))
        assertEquals(500, b.getJSONObject("generationConfig").getInt("maxOutputTokens"))
        assertTrue(GeminiSpec.generate("k", "models/gemini-x", "", "p", 10, false).url.endsWith("/models/gemini-x:generateContent"))
    }

    @Test
    fun openAiAndClaudeRequests() {
        val o = OpenAiSpec.generate("sk-x", "gpt-9-mini", "sys", "hai", 300, true)
        assertEquals("https://api.openai.com/v1/chat/completions", o.url)
        assertEquals("Bearer sk-x", o.headers["authorization"])
        val ob = JSONObject(o.body!!)
        assertEquals("system", ob.getJSONArray("messages").getJSONObject(0).getString("role"))
        assertEquals(300, ob.getInt("max_completion_tokens"))
        assertTrue(ob.getBoolean("stream"))

        val c = ClaudeSpec.generate("sk-ant", "claude-haiku-5-5", "sys", "hai", 300, false)
        assertEquals("https://api.anthropic.com/v1/messages", c.url)
        assertEquals("2023-06-01", c.headers["anthropic-version"])
        assertFalse(JSONObject(c.body!!).has("stream"))
    }

    /* ---------- streamed answers ---------- */

    @Test
    fun geminiStreamSkipsThinkingParts() {
        val line = """data: {"candidates":[{"content":{"parts":[{"text":"fikir","thought":true},{"text":"Hai Amin"}]}}]}"""
        assertEquals("Hai Amin", GeminiSpec.streamText(line))
        assertEquals("", GeminiSpec.streamText(""))
    }

    @Test
    fun openAiStream() {
        assertEquals("Hai", OpenAiSpec.streamText("""data: {"choices":[{"delta":{"content":"Hai"}}]}"""))
        assertEquals("", OpenAiSpec.streamText("""data: {"choices":[{"delta":{"role":"assistant"}}]}"""))
        assertNull(OpenAiSpec.streamText("data: [DONE]"))
    }

    @Test
    fun claudeStream() {
        assertEquals("Hai", ClaudeSpec.streamText("""data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hai"}}"""))
        assertEquals("", ClaudeSpec.streamText("event: ping"))
        assertNull(ClaudeSpec.streamText("""data: {"type":"message_stop"}"""))
        assertTrue(ClaudeSpec.streamError("""data: {"type":"error","error":{"message":"Overloaded"}}""")!!.limited)
    }

    @Test
    fun completeAnswers() {
        assertEquals("ok", GeminiSpec.completeText("""{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}"""))
        assertEquals("ok", OpenAiSpec.completeText("""{"choices":[{"message":{"content":"ok"}}]}"""))
        assertEquals("ok", ClaudeSpec.completeText("""{"content":[{"type":"text","text":"ok"}]}"""))
    }

    /* ---------- model lists and defaults ---------- */

    @Test
    fun geminiPicksNewestStableFlash() {
        val body = """{"models":[
            {"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-3.5-flash","supportedGenerationMethods":["generateContent","countTokens"]},
            {"name":"models/gemini-3.5-flash-lite","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-4.0-flash-preview","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-3.5-pro","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-3.5-flash-image","supportedGenerationMethods":["generateContent"]},
            {"name":"models/text-embedding-004","supportedGenerationMethods":["embedContent"]}]}"""
        val models = GeminiSpec.parseModels(body)
        assertFalse("text-embedding-004" in models)
        assertEquals("gemini-3.5-flash", GeminiSpec.pickDefault(models, "chat"))
        assertEquals("gemini-3.5-flash", GeminiSpec.pickDefault(models, "coding"))
        assertEquals("gemini-4.0-flash-preview", GeminiSpec.pickDefault(listOf("gemini-4.0-flash-preview"), "chat"))
    }

    @Test
    fun openAiPicksMiniForChatAndFullForCoding() {
        val models = OpenAiSpec.parseModels("""{"data":[{"id":"gpt-5"},{"id":"gpt-6"},{"id":"gpt-6-mini"},{"id":"gpt-5-mini"},
            {"id":"gpt-6-2026-01-10"},{"id":"gpt-6-realtime"},{"id":"gpt-6-mini-tts"},{"id":"dall-e-3"}]}""")
        assertEquals("gpt-6-mini", OpenAiSpec.pickDefault(models, "chat"))
        assertEquals("gpt-6", OpenAiSpec.pickDefault(models, "coding"))
    }

    @Test
    fun claudePicksHaikuForChatAndSonnetForCoding() {
        val models = ClaudeSpec.parseModels("""{"data":[{"id":"claude-haiku-4-5-20251001"},{"id":"claude-haiku-5-5"},{"id":"claude-sonnet-5-5"},{"id":"claude-opus-5-5"}]}""")
        assertEquals("claude-haiku-5-5", ClaudeSpec.pickDefault(models, "chat"))
        assertEquals("claude-sonnet-5-5", ClaudeSpec.pickDefault(models, "coding"))
    }

    /* ---------- errors ---------- */

    @Test
    fun errorsAreMalayAndKnowWhenToFallBack() {
        val g = GeminiSpec.error(429, """{"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}""")
        assertTrue(g.limited); assertTrue(g.message.startsWith("Gemini: kuota habis"))
        assertFalse(GeminiSpec.error(400, """{"error":{"message":"API key not valid. Please pass a valid API key."}}""").limited)
        assertTrue(OpenAiSpec.error(429, """{"error":{"message":"You exceeded your current quota","code":"insufficient_quota"}}""").message.contains("kredit"))
        assertTrue(ClaudeSpec.error(400, """{"error":{"message":"Your credit balance is too low"}}""").limited)
        assertTrue(ClaudeSpec.error(404, """{"error":{"message":"model: x"}}""").message.contains("Muat senarai model"))
        assertTrue(OpenAiSpec.error(0, "").message.contains("internet"))
        assertTrue(GeminiSpec.error(503, "").limited)
    }

    /* ---------- settings, fallback order, usage ---------- */

    @Test
    fun defaultsAreGeminiFirstAndMigrateOldClaudeSettings() {
        val cfg = AiConfig.from(JSONObject("""{"modelLight":"claude-haiku-x","modelHeavy":"claude-sonnet-x","aiDailyCap":30}"""))
        assertEquals("gemini", cfg.roles["chat"]); assertEquals("gemini", cfg.roles["coding"])
        assertEquals(listOf("gemini", "claude", "openai"), cfg.order)
        assertEquals("claude-haiku-x", cfg.providers["claude"]!!.chatModel)
        assertEquals("claude-sonnet-x", cfg.providers["claude"]!!.codingModel)
        assertEquals(30, cfg.providers["claude"]!!.cap)
        assertTrue(cfg.providers.values.none { it.personal })  // personal data to AI: OFF by default
    }

    @Test
    fun chainFollowsRoleThenOrderAndSkipsUnusable() {
        val cfg = AiConfig.from(JSONObject("""{"ai":{"roles":{"chat":"claude","coding":"openai"},"order":["openai","gemini","claude"],
            "providers":{"gemini":{"on":true,"chatModel":"g","cap":2},"claude":{"on":true,"chatModel":"c","cap":5},"openai":{"on":false,"chatModel":"o"}}}}"""))
        val allKeys = { _: String -> true }
        assertEquals(listOf("claude", "gemini"), cfg.chain("chat", false, allKeys) { 0 })        // openai is off
        assertEquals(listOf("claude"), cfg.chain("chat", false, allKeys) { if (it == "gemini") 2 else 0 }) // gemini cap reached
        assertEquals(listOf("gemini"), cfg.chain("chat", false, { it != "claude" }) { 0 })       // no Claude key
        assertEquals(emptyList<String>(), cfg.chain("chat", true, allKeys) { 0 })                // personal data: nobody allowed
        val off = AiConfig.from(JSONObject("""{"aiEnabled":false}"""))
        assertEquals(emptyList<String>(), off.chain("chat", false, allKeys) { 0 })
    }

    @Test
    fun personalDataOnlyToProvidersThatAllowIt() {
        val cfg = AiConfig.from(JSONObject("""{"ai":{"providers":{"gemini":{"personal":false,"chatModel":"g"},"claude":{"personal":true,"chatModel":"c"}}}}"""))
        assertEquals(listOf("claude"), cfg.chain("chat", true, { true }) { 0 })
    }

    @Test
    fun usagePerProvider() {
        var raw: String? = null
        raw = AiUsage.bump(raw, "gemini"); raw = AiUsage.bump(raw, "gemini"); raw = AiUsage.bump(raw, "claude")
        val (count, by) = AiUsage.parse(raw)
        assertEquals(3, count)
        assertEquals(mapOf("gemini" to 2, "claude" to 1), by)
        assertEquals(1 to emptyMap<String, Int>(), AiUsage.parse("""{"count":1}"""))
    }

    @Test
    fun versions() {
        assertEquals(listOf(3, 5), versionOf("gemini-3.5-flash"))
        assertEquals(listOf(5, 5), versionOf("claude-haiku-5-5"))
        assertEquals(listOf(6), versionOf("gpt-6-mini"))
    }

    @Test
    fun googlesOwnMessageIsKept() {
        val body = """{"error":{"code":403,"message":"Generative Language API has not been used in project 123 before or it is disabled.","status":"PERMISSION_DENIED"}}"""
        val e = GeminiSpec.error(403, body)
        assertTrue(e.message.contains("API belum dihidupkan"))
        assertEquals("HTTP 403 PERMISSION_DENIED: Generative Language API has not been used in project 123 before or it is disabled.", e.detail)
        assertEquals("HTTP 400 INVALID_ARGUMENT: API key not valid.",
            GeminiSpec.error(400, """{"error":{"code":400,"message":"API key not valid.","status":"INVALID_ARGUMENT"}}""").detail)
        assertEquals("HTTP 429 insufficient_quota: You exceeded your current quota",
            OpenAiSpec.error(429, """{"error":{"message":"You exceeded your current quota","type":"insufficient_quota"}}""").detail)
        assertEquals("HTTP 502: <html>Bad Gateway</html>", rawDetail(502, "<html>Bad   Gateway</html>").replace("Bad Gateway", "Bad Gateway"))
        assertEquals("Tiada jawapan HTTP", rawDetail(0, ""))
    }

    @Test
    fun liteIsTheFastFallback() {
        val models = listOf("gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-4.0-flash-lite-preview")
        assertEquals("gemini-3.5-flash-lite", GeminiSpec.pickLite(models))
        assertEquals("gemini-4.0-flash-lite-preview", GeminiSpec.pickLite(listOf("gemini-4.0-flash-lite-preview", "gemini-3.5-flash")))
        assertNull(GeminiSpec.pickLite(listOf("gemini-3.5-flash")))
    }

    @Test
    fun roomCanPreferAProvider() {
        val cfg = AiConfig.from(JSONObject("""{"ai":{"providers":{"gemini":{"chatModel":"g"},"openai":{"chatModel":"o"}}}}"""))
        assertEquals(listOf("openai", "gemini", "claude"), cfg.chainPrefer("chat", false, "openai", { true }, { 0 }))
        assertEquals(listOf("gemini", "claude", "openai"), cfg.chainPrefer("chat", false, "auto", { true }, { 0 }))
        assertEquals(listOf("gemini", "claude", "openai"), cfg.chainPrefer("chat", false, null, { true }, { 0 }))
    }

    /* ---------- Phase 6.2: attachments ---------- */

    @Test
    fun attachmentsGoInEachProvidersOwnShape() {
        val img = Part("image/jpeg", "QUJD", "resit.jpg")
        val pdf = Part("application/pdf", "UERG", "nota.pdf")
        val g = JSONObject(GeminiSpec.generate("k", "gemini-x", "", "apa ni", 100, true, listOf(img)).body!!)
        val gp = g.getJSONArray("contents").getJSONObject(0).getJSONArray("parts")
        assertEquals("image/jpeg", gp.getJSONObject(0).getJSONObject("inline_data").getString("mime_type"))
        assertEquals("apa ni", gp.getJSONObject(1).getString("text"))

        val c = JSONObject(ClaudeSpec.generate("k", "claude-x", "", "apa ni", 100, false, listOf(img, pdf)).body!!)
        val cc = c.getJSONArray("messages").getJSONObject(0).getJSONArray("content")
        assertEquals("image", cc.getJSONObject(0).getString("type"))
        assertEquals("document", cc.getJSONObject(1).getString("type"))
        assertEquals("text", cc.getJSONObject(2).getString("type"))

        val o = JSONObject(OpenAiSpec.generate("k", "gpt-x", "", "apa ni", 100, false, listOf(img, pdf)).body!!)
        val oc = o.getJSONArray("messages").getJSONObject(0).getJSONArray("content")
        assertEquals("data:image/jpeg;base64,QUJD", oc.getJSONObject(1).getJSONObject("image_url").getString("url"))
        assertEquals("nota.pdf", oc.getJSONObject(2).getJSONObject("file").getString("filename"))
        // No attachments: the plain text shape stays the same as before.
        assertEquals("hai", JSONObject(OpenAiSpec.generate("k", "gpt-x", "", "hai", 100, false).body!!).getJSONArray("messages").getJSONObject(0).getString("content"))
    }

    @Test
    fun videoOnlyGoesToAProviderThatReadsIt() {
        val cfg = AiConfig.from(JSONObject("{}"))
        val video = listOf(Part("video/mp4", "AAAA"))
        val (chain, switched) = cfg.chainFor("chat", "claude", video, { true }, { 0 })
        assertEquals(listOf("gemini"), chain)
        assertEquals("claude", switched)
        val (chain2, switched2) = cfg.chainFor("chat", "openai", listOf(Part("image/png", "AAAA")), { true }, { 0 })
        assertEquals("openai", chain2.first())
        assertNull(switched2)
    }
}
