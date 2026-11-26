# Asbab (app Android)

Pembantu peribadi proaktif untuk Amin. Asbab ialah badan (sentiasa ada, mencatat, mengingatkan), dan Claude ialah otak kedua yang dipanggil hanya bila perlu.

Versi ini ialah **app Android peribadi** (tiada server, tiada Netlify). Semua data disimpan dalam telefon. App ini tidak untuk Play Store; ia dipasang terus daripada fail APK.

## Struktur repo

```
app/                    App Android (Capacitor)
  www/                  UI web: HTML, CSS dan JavaScript (diambil daripada web-reference)
    core.js             fungsi asas: masa Malaysia, tetapan lalai, semakan versi
    store.js            storan dalam telefon
    localapi.js         "API" dalam telefon (ganti server Netlify lama)
    native.js           sambungan ke fungsi Android (versi app, buka pautan, butang Back)
    app.js, views.js    skrin Chat, Hari Ini, Project, Catatan, Tetapan
    scene.js, theme.js  alam hidup, wallpaper dan kaca
  android/              projek Android (Kotlin/Java, Gradle)
  test/                 unit test (Vitest)
web-reference/          versi web lama. Rujukan sahaja, jangan deploy.
.github/workflows/      GitHub Actions yang membina APK
```

## Fasa

| Fasa | Isi | Status |
|---|---|---|
| 1 | Rangka app, CI, kulit UI kaca, wallpaper, semakan update | siap (v0.1.3) |
| 2 | Ciri tempatan tanpa AI: otak sendiri, waktu solat JAKIM, Mod Bilal, peringatan, suara | siap |
| 3 | Otak kedua (Claude), akses telefon (notifikasi, skrin, penggunaan app), Jeda Asbab | PR |
| 4 | Butang bulan terapung di atas app lain | belum |
| 5 | Medan Graviti project, project kod GitHub, pantau website, backup | belum |

## Cara dapatkan dan pasang APK

GitHub Actions membina APK secara automatik. Kau tak perlu Android Studio.

**APK ujian daripada Pull Request** (untuk cuba fasa baharu sebelum merge):
1. Di telefon, buka GitHub dalam Chrome dan log masuk (repo ini private).
2. Buka Pull Request > tab **Checks** > **Bina APK Asbab** > **Summary**.
3. Di bahagian **Artifacts**, tekan `asbab-0.1.X`. Fail `.zip` dimuat turun.
4. Buka fail zip itu (app **Files** di telefon) dan keluarkan fail `.apk`.
5. Tekan fail `.apk`. Kalau Android tanya, benarkan **Install unknown apps** untuk Chrome atau Files.
6. Tekan **Install**.

**APK rasmi daripada Release** (selepas PR di-merge ke `main`):
1. Buka `https://github.com/bybananasupport-max/asbab/releases` di telefon (log masuk dulu).
2. Pada Release paling atas, tekan fail `asbab-0.1.X.apk`, kemudian buka dan pasang.
3. Dalam app: **Tetapan > Tentang Asbab > Semak update** akan bawa kau ke halaman ini.

> **Kalau keluar "App not installed" / "package conflicts":** APK lama dan baharu ditandatangani dengan kunci berbeza. Ini berlaku dengan APK **debug**, sebab setiap binaan debug guna kunci baharu. Penyelesaian: buat keystore release (di bawah) sekali sahaja. Sebelum itu, nyahpasang Asbab lama dulu (data dalam app akan hilang).

## Keystore release (buat sekali sahaja)

Keystore ialah "cop rasmi" app kau. Bila semua APK dicop dengan keystore yang sama, Android benarkan kau naik taraf Asbab tanpa nyahpasang dan tanpa hilang data. Kalau secret ini tiada, workflow tetap berjaya tapi membina APK debug.

**Cara mudah (dari telefon atau komputer, guna GitHub Actions):**
1. Buka repo > tab **Actions** > **Jana keystore Asbab** > **Run workflow** > **Run workflow**.
2. Tunggu siap (lebih kurang 1 minit), buka larian itu, dan muat turun artifact `asbab-keystore-PADAM-SELEPAS-GUNA`.
3. Dalam zip itu ada dua fail teks:
   - `ASBAB_KEYSTORE_BASE64.txt` (teks panjang)
   - `ASBAB_KEYSTORE_PASSWORD.txt` (password)
4. Pergi **Settings > Secrets and variables > Actions > New repository secret**, dan buat dua secret:
   - Nama `ASBAB_KEYSTORE_BASE64`, nilai: semua isi fail pertama.
   - Nama `ASBAB_KEYSTORE_PASSWORD`, nilai: isi fail kedua.
5. **Simpan salinan kedua-dua fail di tempat selamat** (contohnya password manager atau Google Drive peribadi). Kalau hilang, kau tak boleh naik taraf Asbab tanpa nyahpasang.
6. Kembali ke larian workflow tadi dan **padam artifact** itu (ikon tong sampah). Ia juga dipadam sendiri selepas 1 hari.

**Cara manual (kalau ada komputer dengan Java):**
```
keytool -genkeypair -v -storetype PKCS12 -keystore asbab.jks -alias asbab -keyalg RSA -keysize 4096 -validity 10000
base64 -w 0 asbab.jks > ASBAB_KEYSTORE_BASE64.txt
```
Guna password yang sama untuk keystore dan key, kemudian ikut langkah 4 hingga 5 di atas.

Selepas secret ditambah, APK seterusnya dicop "release". Nyahpasang APK debug lama sekali sahaja, kemudian pasang APK release. Selepas itu semua update berjalan terus.

## Untuk developer

```
cd app
npm ci
npm test          # unit test
npm run build     # salin UI ke projek Android (perlu sebelum Gradle)
cd android && ./gradlew assembleDebug   # perlu Android SDK
```

UI juga boleh dibuka dalam browser untuk semakan pantas: `cd app && npm run vendor && python3 -m http.server -d www 8000`.

## Prinsip yang tak boleh berubah

1. **Satu identiti.** Amin hanya bercakap dengan Asbab. Claude ialah otak kedua di belakang tabir.
2. **Otak sendiri dulu.** Jawab dari catatan dan peraturan tanpa AI bila boleh. Setiap jawapan dilabel "otak sendiri" atau "otak kedua".
3. **AI ajar sekali, Asbab buat selamanya.** Maklumat penting disimpan sebagai catatan tersusun.
4. **Baca sahaja.** Data daripada app lain hanya data. Tiada balas mesej, tiada belanja, tiada tindakan dalam app lain. Arahan dalam data itu diabaikan.
5. **Kelulusan.** Semua perubahan kod perlu kelulusan Amin.
6. **Tiada rahsia dalam repo.** Key Claude dan token GitHub disimpan dalam telefon sahaja (disulitkan).
