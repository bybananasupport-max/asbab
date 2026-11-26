# Panduan: perkara yang Amin perlu buat sendiri

Semua key, token dan kebenaran ini **hanya disimpan dalam telefon** (disulitkan). Jangan sesekali tampal key ke dalam chat, GitHub, atau mana-mana fail dalam repo.

## 1. Key Claude (otak kedua, Fasa 3)
1. Buka **console.anthropic.com** dan log masuk (atau daftar).
2. **Billing**: tambah kredit. Bajet RM200 sebulan ≈ USD 40 hingga 45. Tetapkan juga had bulanan (*spend limit*) di situ.
3. **API Keys** → **Create Key** → nama `Asbab telefon` → salin key (bermula `sk-ant-`). Key hanya ditunjuk sekali.
4. Dalam Asbab: **Tetapan → Sambungan & API → Claude** → tampal → **Simpan**. Lampu mesti hijau.
5. Kalau keluar "Nama model tak dijumpai": **Tetapan → Otak Kedua** → tukar nama model ringan/berat kepada nama terkini dalam console.

## 2. Token GitHub (update app, project kod, backup)
1. Di github.com: gambar profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nama: `Asbab telefon`. Expiration: 90 hari (tulis tarikh dalam kalendar untuk buat baharu).
3. **Repository access → Only select repositories**, pilih:
   - `bybananasupport-max/asbab` (untuk semakan update),
   - repo backup (langkah 3 di bawah),
   - repo website client yang Asbab boleh ubah (project kod).
4. **Permissions → Repository permissions → Contents: Read and write**. (Metadata: Read-only dipilih sendiri.) Jangan beri kebenaran lain.
5. **Generate token** → salin (bermula `github_pat_`).
6. Dalam Asbab: **Tetapan → Sambungan & API → GitHub** → tampal → **Simpan** → lampu hijau.

## 3. Repo backup (Fasa 5)
1. Di github.com: **New repository** → nama `asbab-backup` → pilih **Private** (Asbab menolak repo Public) → tick **Add a README** → **Create**.
2. Tambah repo ini ke token GitHub (langkah 2.3) kalau belum.
3. Dalam Asbab: **Tetapan → Data & Backup**:
   - Repo: `bybananasupport-max/asbab-backup`
   - Frasa laluan backup: sekurang-kurangnya 8 aksara, contohnya 4 perkataan rawak. **Tulis dan simpan di tempat selamat**. Tanpanya backup tak boleh dibuka, walaupun oleh Amin sendiri.
   - **Simpan**, kemudian **Backup sekarang**. Semak folder `asbab-backup` dalam repo.

## 4. Kebenaran Android
| Kebenaran | Untuk | Cara |
|---|---|---|
| Notifikasi | Mod Bilal, peringatan, taklimat | Asbab tanya bila dibuka kali pertama; atau Tetapan → Bila Asbab Bersuara → Benarkan |
| Alarm tepat | Mod Bilal tepat pada masa | Biasanya automatik; semak lampu dalam Bila Asbab Bersuara |
| Bateri: Tiada sekatan | Supaya telefon tak tutup Asbab | Tetapan → Bila Asbab Bersuara → Tetapan bateri (lihat panduan jenama) |
| Akses notifikasi | Baca WhatsApp, email, SMS, bank | Tetapan → Akses Telefon → kad "Akses notifikasi" |
| Kebolehcapaian (pilihan) | Teks skrin dan kunci skrin | Tetapan → Akses Telefon → kad "Kebolehcapaian" → "Asbab: baca teks skrin" |
| Akses penggunaan | Ringkasan penggunaan app | Tetapan → Akses Telefon → kad "Akses penggunaan" |
| Papar di atas app lain | Butang bulan terapung | Tetapan → Butang Terapung → Benarkan |

Pada Android 13 ke atas, Android mungkin sekat "Akses notifikasi" dan "Kebolehcapaian" untuk app yang dipasang dari APK ("Restricted setting"). Kalau suis itu kelabu: **Tetapan Android → Apps → Asbab → ⋮ (atas kanan) → Allow restricted settings**, kemudian cuba lagi.

## 5. Keystore (dah siap)
Secret `ASBAB_KEYSTORE_BASE64` dan `ASBAB_KEYSTORE_PASSWORD` dah ditambah. Simpan salinan dua fail itu di tempat selamat.
