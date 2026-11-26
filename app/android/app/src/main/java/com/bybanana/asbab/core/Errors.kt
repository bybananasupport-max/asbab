package com.bybanana.asbab.core

/** Plain-Malay explanations for connection errors (Sambungan & API page and chat). */
object Errors {
    fun claude(status: Int, apiMessage: String): String {
        val m = apiMessage.lowercase()
        return when {
            status == 0 -> "Tak dapat hubungi Claude. Semak internet telefon dan cuba lagi."
            status == 401 -> "Key Claude salah atau dah dibatalkan. Salin semula key dari console.anthropic.com."
            status == 403 -> "Key Claude tiada kebenaran untuk ini. Semak tetapan akaun di console.anthropic.com."
            m.contains("credit") || m.contains("billing") || m.contains("balance") ->
                "Kredit API Claude dah habis. Tambah kredit di console.anthropic.com > Billing."
            status == 404 || m.contains("model") && m.contains("not") ->
                "Nama model tak dijumpai. Tukar nama model dalam Tetapan > Otak Kedua."
            status == 429 -> "Terlalu banyak permintaan dalam masa singkat. Tunggu seminit dan cuba lagi."
            status == 529 || status >= 500 -> "Pelayan Claude sibuk atau ada masalah sekarang. Cuba lagi sekejap."
            status == 400 -> "Claude tolak permintaan ni: ${apiMessage.take(160)}"
            else -> "Claude membalas ralat $status: ${apiMessage.take(160)}"
        }
    }

    fun github(status: Int, apiMessage: String): String = when (status) {
        0 -> "Tak dapat hubungi GitHub. Semak internet telefon dan cuba lagi."
        401 -> "Token GitHub salah atau dah tamat tempoh. Buat token baharu di github.com > Settings > Developer settings."
        403 -> if (apiMessage.lowercase().contains("rate limit")) "Had GitHub dah capai. Cuba lagi dalam sejam."
        else "Token GitHub tiada kebenaran untuk ini. Semak kebenaran token (Contents: Read and write)."
        404 -> "Repo atau fail tak dijumpai, atau token tiada akses kepada repo itu."
        409 -> "Repo GitHub masih kosong atau sedang berubah. Cuba lagi."
        422 -> "GitHub tolak permintaan ni: ${apiMessage.take(160)}"
        else -> "GitHub membalas ralat $status: ${apiMessage.take(160)}"
    }
}
