# Asbab

> **Versi ini rujukan web untuk app Android Asbab.** Baca SPEC.md untuk planning terkini dan CLAUDE.md untuk arahan Claude Code. UI dah dikemas kini: gaya kaca, wallpaper custom dengan slider blur, butang bulan yang mengembang jadi jalur, Medan Graviti untuk Project, Hari Ini gaya papan pemuka, dan Tetapan berkategori.

Pembantu peribadi proaktif untuk Amin. Asbab ialah badan (sentiasa hidup, mencatat, mengingatkan), dan Claude ialah otak kedua yang dipanggil hanya bila perlu berfikir.

## Apa yang ada dalam versi ini

**Chat**
- Banyak bilik chat, kekal sampai kau padam. Bilik utama "Asbab" untuk mesej yang Asbab mulakan sendiri.
- Otak sendiri dulu: waktu solat, jadual, nota, idea, belanja, makan, carian catatan, buat bilik atau project baru. Semua ni **tanpa guna AI**. Taip `tolong` untuk senarai.
- Otak kedua (Claude) untuk perkara baharu. Maklumat penting dalam perbualan disimpan sendiri ke Catatan ("AI ajar sekali, Asbab buat selamanya").
- Label "otak sendiri" atau "otak kedua" pada setiap jawapan, had penggunaan harian, dan pilihan minta izin sebelum guna Claude.
- Input suara (Bahasa Melayu).

**Asbab bertindak dulu** (setiap 5 minit, walaupun app ditutup)
- Mod Bilal: ingatkan sebelum setiap waktu solat (lalai 20 minit), dan tanya kalau belum ditanda selepas waktu.
- Peringatan jadual 20 minit sebelum.
- Taklimat pagi (tanpa AI) dan check-in petang, ikut waktu senyap dan had harian.
- Pantau website project 24 jam, dan beritahu bila down atau pulih.

**Hari Ini**: waktu solat JAKIM, lengkung matahari, menara dengan bayang, tanda solat, jadual hari ini dan esok, belanja.

**Project**: sistem suria dengan planet. Project kod disambung ke repo GitHub: minta perubahan dalam chat project, Asbab baca repo, tulis cadangan dengan penjelasan mudah dan tahap risiko, kau **tekan dan tahan untuk lulus**, dan boleh **patah balik**. Kod penuh (diff) hanya dipaparkan di komputer.

**Catatan**: pustaka mingguan, banjaran aktiviti, Bank Idea sebagai langit bintang, belanja, log perkembangan Asbab.

**Tetapan**: zon solat, masa Mod Bilal, taklimat, check-in, waktu senyap, keutamaan, fail personaliti, suis akses telefon, animasi ringan, bunyi angin, notifikasi telefon, dan backup identiti (eksport dan pulihkan).

**Rupa**: alam yang berubah ikut waktu solat (subuh, siang, petang, maghrib, malam), 4 pemandangan, bulan ikut fasa sebenar, hujan ikut cuaca sebenar, kunang-kunang, tanglung, buruj semasa berfikir, daun gugur, butang bulan yang boleh dilempar dan ditidurkan, peralihan bumi ke langit, komet, debu bintang, putaran masa.

## Belum ada dalam versi ini (perlu app Android)

Butang terapung **di atas app lain**, membaca WhatsApp, SMS, notifikasi bank/TNG, isi skrin dan fail telefon. Semua ni hanya boleh dibuat oleh app Android sebenar, bukan website. Suis akses dalam Tetapan dah ada dan disimpan, tapi baru berfungsi bila app Android dibina (peringkat seterusnya). Dalam web app, butang bulan wujud di dalam Asbab sahaja.

## Cara pasang

1. **GitHub**: buat repo baharu dan pilih **Private**. Upload semua isi folder ni (bukan folder itu sendiri), supaya `netlify.toml` berada paling luar.
2. **Netlify**: Add new site, Import an existing project, pilih repo tu. Netlify baca `netlify.toml` sendiri. Tekan Deploy.
3. **Environment variables** (Site configuration > Environment variables), rujuk `.env.example`:
   - `ASBAB_PASSWORD`: tukar daripada password lalai `CHANGE_ME`.
   - `ANTHROPIC_API_KEY`: daripada console.anthropic.com.
   - `GITHUB_TOKEN`: hanya untuk project kod. Fine-grained token, pilih repo tertentu sahaja, permission Contents read and write.
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: untuk notifikasi. Jana di laptop dengan `npx web-push generate-vapid-keys`.
4. **Redeploy** selepas tambah variable (Deploys > Trigger deploy).
5. Buka site di telefon, masuk, kemudian di Chrome pilih **Add to Home screen** supaya Asbab jadi macam app. Pergi Tetapan dan tekan **Hidupkan notifikasi**.

Penyimpanan (Netlify Blobs) dan penjadual 5 minit (Scheduled Functions) berjalan sendiri, tiada setup tambahan.

## Yang dah diuji, dan yang belum

**Dah diuji di sini:** semua kod lulus semakan sintaks; otak sendiri (solat, jadual, belanja, nota, idea, bilik, project), simpanan nota daripada jawapan AI, Mod Bilal dan peringatan jadual (sekali sahaja setiap waktu), pantau website down, eksport identiti, aliran lulus dan commit dengan GitHub tiruan; dan UI dibuka dalam browser untuk Chat, Hari Ini, Project, kad kelulusan, Catatan dan Tetapan.

**Belum diuji:** sambungan sebenar ke Claude, JAKIM, GitHub, Netlify Blobs, penjadual dan notifikasi di Netlify. Sandbox pembina tiada internet. Kalau ada ralat pada deploy pertama, salin mesej ralat (dari skrin atau Netlify > Logs) dan bawa balik untuk dibetulkan.

## Nota penting
- Nama model (`claude-haiku-5-5`, `claude-sonnet-5-5`) boleh ditukar melalui `ASBAB_MODEL_LIGHT` dan `ASBAB_MODEL_HEAVY` kalau keluar ralat "model not found".
- Tiada salinan ujian (staging) untuk website client yang dihos di luar Netlify, jadi baca penjelasan dan risiko setiap cadangan, dan guna Patah balik bila perlu.
- Grafik ialah ilustrasi berlapis yang ringan, bukan foto. Gambar sebenar boleh diganti kemudian (guna gambar sendiri atau berlesen).
- Zon solat lalai `KDH01`. Semak kod zon kau di laman e-Solat JAKIM.

## Struktur
```
public/                    UI: index.html, style.css, scene.js (alam), app.js (chat, bulan), views.js (halaman lain), sw.js
netlify/functions/api.mjs        API utama
netlify/functions/scheduler.mjs  jantung Asbab, setiap 5 minit
netlify/edge-functions/think.js  otak kedua (Claude), strim
netlify/lib/                     otak sendiri, storan, waktu solat, GitHub, notifikasi
```
