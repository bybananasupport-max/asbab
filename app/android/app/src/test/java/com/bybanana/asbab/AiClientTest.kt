package com.bybanana.asbab

import com.bybanana.asbab.core.GeminiSpec
import com.bybanana.asbab.core.OpenAiSpec
import org.junit.Assert.assertTrue
import org.junit.Test

class AiClientTest {
    @Test
    fun timeoutsAreExplainedAndKeepTheRealException() {
        val e = AiClient.network(GeminiSpec, java.net.SocketTimeoutException("Read timed out"), AiClient.TEST_MS).error
        assertTrue(e.message, e.message.contains("tiada jawapan dalam 25 saat"))
        assertTrue(e.limited)
        assertTrue(e.detail, e.detail.startsWith("SocketTimeoutException: Read timed out"))
    }

    @Test
    fun otherNetworkProblems() {
        assertTrue(AiClient.network(GeminiSpec, java.net.UnknownHostException("generativelanguage.googleapis.com"), 1000).error.message.contains("alamat pelayan"))
        assertTrue(AiClient.network(OpenAiSpec, javax.net.ssl.SSLHandshakeException("bad cert"), 1000).error.message.contains("SSL"))
        val odd = AiClient.network(OpenAiSpec, IllegalStateException("boom"), 1000).error
        assertTrue(odd.message.contains("ralat tak dijangka"))
        assertTrue(odd.detail.contains("IllegalStateException: boom"))
    }
}
