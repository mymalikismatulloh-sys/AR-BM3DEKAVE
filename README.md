# AR BM3 DEKAVE - WebAR Showcase

Aplikasi Augmented Reality berbasis Web (WebAR) untuk menampilkan karya siswa Desain Komunikasi Visual (DKV) SMK Bina Mandiri Multimedia menggunakan **MindAR.js** dan **A-Frame**.

---

## ⚡ Cara Menjalankan Cepat

```powershell
# Jalankan server web lokal di folder proyek:
python -m http.server 8080
```
Buka browser di: [http://localhost:8080](http://localhost:8080)

---

## 📖 Dokumentasi Lengkap

Untuk panduan arsitektur, daftar marker, fitur interaksi, panduan HP, hingga cara compile marker baru, silakan baca dokumentasi lengkap di:
👉 **[DOKUMENTASI.md](./DOKUMENTASI.md)**

**Studio Editor** tersedia di `/studio.html`. Tanpa konfigurasi backend, data hanya disimpan lokal di browser. Untuk menerbitkan karya ke semua pengunjung, konfigurasikan Supabase dan akun admin sesuai bagian [Katalog publik dan Studio Editor admin](./DOKUMENTASI.md#-katalog-publik-dan-studio-editor-admin). Pengunjung umum hanya dapat melihat karya aktif; hanya admin terdaftar yang dapat mengubah katalog.
