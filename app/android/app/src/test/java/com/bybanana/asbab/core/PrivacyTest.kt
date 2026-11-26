package com.bybanana.asbab.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrivacyTest {
    @Test
    fun categories() {
        assertEquals(Privacy.WHATSAPP, Privacy.category("com.whatsapp"))
        assertEquals(Privacy.EMAIL, Privacy.category("com.google.android.gm"))
        assertEquals(Privacy.SMS_BANK, Privacy.category("com.google.android.apps.messaging"))
        assertEquals(Privacy.SMS_BANK, Privacy.category("my.com.tngdigital.ewallet"))
        assertNull(Privacy.category("com.instagram.android"))
    }

    @Test
    fun screenDenylistCoversBanksWalletsPasswordsAndOtp() {
        for (pkg in listOf(
            "com.maybank2u.life", "my.com.tngdigital.ewallet", "com.cimb.cimbocto", "com.x8bit.bitwarden",
            "com.google.android.apps.authenticator2", "com.authy.authy", "com.lastpass.lpandroid", "com.agilebits.onepassword",
            "com.anybank.mobile", "com.example.ewallet",
        )) assertTrue(pkg, Privacy.screenDenied(pkg))
        assertFalse(Privacy.screenDenied("com.whatsapp"))
        assertFalse(Privacy.screenDenied("com.google.android.gm"))
    }

    @Test
    fun secretsAreNeverStored() {
        assertTrue(Privacy.isSecret("Your OTP is 123456. Do not share."))
        assertTrue(Privacy.isSecret("TAC anda ialah 884421 untuk pemindahan RM50.00"))
        assertTrue(Privacy.isSecret("Kod pengesahan Shopee anda: 4412"))
        assertTrue(Privacy.isSecret("Verification code: 998877"))
        assertFalse(Privacy.isSecret("Jumpa kat kedai mamak pukul 9 malam"))
    }

    @Test
    fun blocklistMatchesSenderOrGroup() {
        val block = listOf("Grup Sekolah Lama", "  bos  ")
        assertTrue(Privacy.blocked(listOf("grup sekolah lama · Ali"), block))
        assertTrue(Privacy.blocked(listOf("", "Encik Bos Besar"), block))
        assertFalse(Privacy.blocked(listOf("Mak"), block))
        assertFalse(Privacy.blocked(listOf("Mak"), listOf("", " ")))
    }

    @Test
    fun amountsMatchTheJavaScriptRules() {
        assertEquals(listOf(12.5), Privacy.findAmounts("RM12.50"))
        assertEquals(listOf(5.0), Privacy.findAmounts("rm 5"))
        assertEquals(listOf(1250.0), Privacy.findAmounts("RM1,250.00"))
        assertEquals(listOf(3.2), Privacy.findAmounts("MYR 3.20"))
        assertEquals(emptyList<Double>(), Privacy.findAmounts("FORM12.50"))
        assertEquals(emptyList<Double>(), Privacy.findAmounts("RM12,5"))
        assertEquals(listOf(3.5, 2.0, 10.0), Privacy.findAmounts("Beli RM3.50 dan RM 2, baki RM10.00"))
    }

    @Test
    fun spendingOnlyForMoneyGoingOut() {
        assertEquals(45.9, Privacy.spending("Pembayaran RM 45.90 kepada KEDAI ABC berjaya.")!!, 0.001)
        assertEquals(8.0, Privacy.spending("You paid RM8.00 at Petronas")!!, 0.001)
        assertNull(Privacy.spending("Anda telah menerima RM50.00 daripada Ali. Wang diterima."))
        assertNull(Privacy.spending("Refund RM12.00 has been credited"))
        assertNull(Privacy.spending("TAC 123456 untuk pembayaran RM99.00"))
        assertNull(Privacy.spending("Promosi! Diskaun 50%"))
    }

    @Test
    fun durations() {
        assertEquals("<1m", Privacy.duration(30_000))
        assertEquals("45m", Privacy.duration(45 * 60_000L))
        assertEquals("1j 23m", Privacy.duration(83 * 60_000L))
    }
}
