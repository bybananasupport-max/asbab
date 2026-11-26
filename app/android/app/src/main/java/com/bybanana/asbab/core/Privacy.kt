package com.bybanana.asbab.core

import java.util.Locale

/**
 * Privacy rules for reading other apps. Everything read is DATA ONLY: Asbab never replies,
 * sends, pays or acts in another app. Pure Kotlin so the rules are unit tested.
 */
object Privacy {
    /** Source category -> the access toggle (Tetapan > Akses Telefon) that must be on. */
    const val WHATSAPP = "whatsapp"
    const val EMAIL = "email"
    const val SMS_BANK = "sms_bank"

    private val WHATSAPP_APPS = setOf("com.whatsapp", "com.whatsapp.w4b")
    private val EMAIL_APPS = setOf(
        "com.google.android.gm", "com.microsoft.office.outlook", "com.yahoo.mobile.client.android.mail",
        "com.samsung.android.email.provider", "ch.protonmail.android",
    )
    private val SMS_APPS = setOf(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
        "com.android.messaging", "com.oneplus.mms", "com.miui.smsextra", "com.coloros.mms", "com.vivo.message",
    )

    /** Banks and e-wallets common in Malaysia (best effort; matched exactly or by prefix). */
    val BANK_APPS = setOf(
        "com.maybank2u.life", "my.com.maybank2u.m2umobile", "com.cimb.cimbocto", "com.cimbmalaysia",
        "com.rhbgroup.rhbmobilebanking", "com.publicbank.pbengage", "com.hongleong.hlbconnect",
        "com.ambank.ambankonline", "com.bankislam.mobile", "com.bsn.mybsn", "com.bankrakyat.irakyat",
        "com.affinbank.affinalwaysapp", "com.alliancebank.allianceonline", "com.uob.mighty.app",
        "com.ocbc.mobile", "com.hsbc.hsbcmalaysia", "com.standardchartered.mobile.my",
        "my.com.tngdigital.ewallet", "my.com.myboost", "com.grabtaxi.passenger", "com.shopee.my",
        "com.tpaay.bigpay", "com.mcash.app", "my.gxbank.app", "com.aeonbank.my",
    )

    /** Never read the screen of these, whatever the toggles say. */
    private val DENY_KEYWORDS = listOf(
        "bank", "wallet", "ewallet", "pay", "maybank", "cimb", "rhb", "ambank", "affin", "bsn", "rakyat",
        "tngdigital", "boost", "bigpay", "password", "passwd", "keepass", "bitwarden", "1password", "lastpass",
        "dashlane", "keeper", "authenticator", "authy", "otp", "2fa", "duo", "vault", "crypto", "binance", "luno",
    )

    fun category(pkg: String): String? = when {
        pkg in WHATSAPP_APPS -> WHATSAPP
        pkg in EMAIL_APPS -> EMAIL
        pkg in SMS_APPS || isBank(pkg) -> SMS_BANK
        else -> null
    }

    fun isBank(pkg: String) = BANK_APPS.any { pkg == it || pkg.startsWith("$it.") }

    /** Hard denylist for screen reading: banking, e-wallet, password manager and OTP apps. */
    fun screenDenied(pkg: String): Boolean {
        val p = pkg.lowercase(Locale.ROOT)
        return isBank(pkg) || DENY_KEYWORDS.any { p.contains(it) }
    }

    private val OTP = Regex(
        "\\b(otp|tac|pin|one[- ]time|kod (pengesahan|keselamatan|sekali guna|tac)|verification code|security code|" +
            "kata laluan|password|passcode|2fa|login code|kod log masuk)\\b",
        RegexOption.IGNORE_CASE,
    )

    /** Messages carrying one-time codes or passwords are never stored. */
    fun isSecret(text: String): Boolean = OTP.containsMatchIn(text)

    /** True if a sender or group name is on Amin's blocklist (case-insensitive, whole entry contained). */
    fun blocked(names: List<String>, blocklist: List<String>): Boolean {
        val list = blocklist.map { it.trim().lowercase(Locale.ROOT) }.filter { it.isNotEmpty() }
        return names.any { n -> val x = n.lowercase(Locale.ROOT); list.any { x.contains(it) } }
    }

    /* ---------- Ringgit amounts (same rules as app/www/money.js) ---------- */

    private val AMOUNT = Regex("(?:^|[^a-z0-9])(?:rm|myr)\\s?((?:\\d{1,3}(?:,\\d{3})+)|\\d+)(?:\\.(\\d{1,2}))?(?![\\d.,]*\\d)", RegexOption.IGNORE_CASE)

    fun findAmounts(text: String): List<Double> = AMOUNT.findAll(text).mapNotNull { m ->
        val whole = m.groupValues[1].replace(",", "")
        val cents = m.groupValues[2].padEnd(2, '0').ifEmpty { "00" }
        "$whole.$cents".toDoubleOrNull()?.let { Math.round(it * 100) / 100.0 }
    }.toList()

    private val SPEND = Regex(
        "\\b(bayar|dibayar|pembayaran|paid|payment|purchase|pembelian|beli|debit|didebit|spent|charged|caj|" +
            "transfer(red)? to|dipindahkan ke|pindahan ke|withdraw|pengeluaran|reload|tambah nilai|toll|tol)\\b",
        RegexOption.IGNORE_CASE,
    )
    private val INCOME = Regex(
        "\\b(terima|diterima|received|credited|dikreditkan|masuk|refund|bayaran balik|cashback|transfer(red)? from|dari akaun)\\b",
        RegexOption.IGNORE_CASE,
    )

    /** Spending amount in a bank/e-wallet/SMS message, or null if it is not clearly money going out. */
    fun spending(text: String): Double? {
        if (isSecret(text) || !SPEND.containsMatchIn(text) || INCOME.containsMatchIn(text)) return null
        return findAmounts(text).firstOrNull { it > 0 }
    }

    /** 4_980_000 ms -> "1j 23m"; under a minute -> "<1m". */
    fun duration(ms: Long): String {
        val min = ms / 60_000
        return when {
            min < 1 -> "<1m"
            min < 60 -> "${min}m"
            else -> "${min / 60}j ${min % 60}m"
        }
    }
}
