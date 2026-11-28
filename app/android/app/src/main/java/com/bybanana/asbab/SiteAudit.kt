package com.bybanana.asbab

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Phase 7.3: what a visitor sees from outside. Status, response time, SSL certificate expiry and broken
 * links on the first page (same site only, at most 15). Only reads; the page content is DATA for the AI.
 */
object SiteAudit {
    private fun open(url: String, method: String = "GET"): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            instanceFollowRedirects = true
            connectTimeout = 10_000
            readTimeout = 12_000
            setRequestProperty("User-Agent", "Asbab-semak/1.0")
        }

    fun run(url: String): JSObject {
        val out = JSObject().put("url", url)
        val t0 = System.currentTimeMillis()
        val c = open(url)
        val html: String
        try {
            val code = c.responseCode
            out.put("status", code).put("ms", System.currentTimeMillis() - t0).put("ok", code in 200..399)
            if (c is HttpsURLConnection) {
                try {
                    val cert = c.serverCertificates.firstOrNull() as? java.security.cert.X509Certificate
                    if (cert != null) out.put("sslHari", ((cert.notAfter.time - System.currentTimeMillis()) / 86_400_000L).toInt()).put("sslPenerbit", cert.issuerX500Principal.name.substringAfter("O=").substringBefore(",").take(60))
                } catch (e: Exception) { /* certificate details not available */ }
            } else out.put("ssl", false)
            html = try { (if (code in 200..399) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText().take(400_000) } ?: "" } catch (e: Exception) { "" }
        } catch (e: Exception) {
            return out.put("ok", false).put("ralat", "Tak dapat dihubungi: ${e.javaClass.simpleName}").put("ms", System.currentTimeMillis() - t0)
        } finally {
            c.disconnect()
        }
        Regex("<title[^>]*>([\\s\\S]*?)</title>", RegexOption.IGNORE_CASE).find(html)?.let { out.put("tajuk", it.groupValues[1].trim().take(120)) }
        // Links on the same site, checked one by one (a short list, to stay light).
        val base = URL(url)
        val links = Regex("href=[\"']([^\"'#]+)[\"']", RegexOption.IGNORE_CASE).findAll(html).map { it.groupValues[1] }
            .mapNotNull { try { URL(base, it).toString() } catch (e: Exception) { null } }
            .filter { it.startsWith("http") && URL(it).host == base.host && !Regex("\\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip)(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(it) }
            .distinct().take(15).toList()
        val broken = JSArray()
        for (l in links) {
            val code = try { val h = open(l, "HEAD"); try { h.responseCode.let { if (it == 405) open(l).let { g -> try { g.responseCode } finally { g.disconnect() } } else it } } finally { h.disconnect() } } catch (e: Exception) { 0 }
            if (code == 0 || code >= 400) broken.put(JSObject().put("url", l).put("status", code))
        }
        return out.put("pautanDisemak", links.size).put("pautanRosak", broken)
    }
}
