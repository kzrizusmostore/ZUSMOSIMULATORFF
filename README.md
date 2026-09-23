# ZUSMO FF V18

Pembaruan besar sistem pengaturan, karakter, peta, dan pemuatan aset untuk versi mobile.

## Default baru
V18 menggunakan nilai dasar dari **ZUSMO FF PENGATURAN V16** yang diberikan pengguna:

- Jalan: 4.50 m/s
- Lari: 7.50 m/s
- Jongkok: 2.30 m/s
- Tiarap: 0.90 m/s
- Akselerasi: 14
- Perlambatan: 18
- Kecepatan berputar: 24
- Kekuatan lompat: 4
- Gravitasi: 16.5
- Ukuran karakter: 0.71x
- Clock Tower spawn: X 5.27 / Y 24.56 / Z -8.21 / yaw 36°
- Grafik HD tetap menggunakan seluruh nilai pencahayaan/filter yang diberikan pengguna.

RESET memakai baseline baru ini. V18 sengaja tidak mengimpor tuning lama agar instalasi yang pernah memakai V17/V16 juga mendapatkan default baru yang sama.

## Pengaturan animasi per aksi
Gerakan sekarang memiliki tab dan parameter terpisah:

- JALAN
- LARI
- LOMPAT
- JONGKOK
- TIARAP
- PUKUL
- DIAM
- UMUM

Nilai aksi tambahan dimulai di 1.00x agar preset dasar pengguna tetap menjadi baseline, lalu dapat disetel tanpa mengubah aksi lain.

## Tiarap
Pose tiarap V18 tidak lagi sekadar merebahkan seluruh karakter. Transisi melewati jongkok dalam, tubuh menghadap tanah, dada diberi jarak dari tanah, siku menopang badan, kepala diangkat, dan crawl memakai gerak tangan/kaki kecil yang terpisah.

## Karakter dan peta
Registry sekarang memuat:

### Karakter
- Naruto — `assets/characters/naruto_free_fire.glb`
- Rouk — `assets/characters/free_fire_rouk_ff_3d_model.glb`

### Peta
- Clock Tower — `assets/maps/free_fire_clocktower_3d_model_by_ffxn.glb`
- Old Rampage — `assets/maps/free_fire_old_rampage_lobby_3d_model.glb`

Rouk dan Old Rampage terdaftar sebagai aset eksternal karena file GLB tersebut belum tersedia pada sumber proyek yang diterima saat V18 dibuat. Letakkan file asli dengan nama persis di jalur di atas.

## Pemuatan hemat data
Ketika pengguna baru membuka menu, aplikasi hanya memuat HTML/CSS serta modul UI ringan. Three.js, renderer, modul gameplay, dan seluruh GLB karakter/peta belum diminta. Mesin 3D baru di-import setelah pengguna memilih karakter + peta dan menekan **MULAI GAME**.

Saat game aktif, karakter dapat diganti dari **PENGATURAN LANGSUNG → PILIH KARAKTER**. Pergantian karakter hanya memuat GLB karakter baru dan mempertahankan peta yang sedang aktif.

## UI pengaturan V18
Panel pengaturan dirancang ulang agar tidak sesak:

- layout lebar dua kolom di landscape;
- daftar kategori berada di sisi kiri;
- kontrol aktif berada di area besar sebelah kanan;
- dua kolom slider pada layar landscape;
- satu kolom pada portrait;
- tombol +/- dan input angka diperbesar;
- kategori dapat digeser horizontal pada portrait;
- seluruh teks pengaturan menggunakan Bahasa Indonesia.

## Kamera dan analog
Perilaku kamera/analog V17 dipertahankan:

- kamera bebas digeser dan tidak hard-lock / auto-kembali;
- kamera zoom-in dengan jarak sekitar 3.15;
- analog 360° bebas;
- arah gerak mengikuti basis kamera secara langsung;
- tombol LARI tetap terpisah.

## Menjalankan proyek
Gunakan HTTP/HTTPS. Jangan membuka `index.html` melalui `file://`.
