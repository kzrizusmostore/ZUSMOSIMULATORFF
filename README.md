# ZUSMO FF V21

V21 melanjutkan UX landscape V20 dan menambahkan aset pilihan baru tanpa mengubah baseline gameplay/animasi Naruto.

## Peta
- Clock Tower — `assets/maps/free_fire_clocktower_3d_model_by_ffxn.glb`
- Dapur MBG-KOPDES — `assets/maps/dapur_mbg_kopdes.glb`
- Old Rampage — terdaftar, tetapi masih BELUM TERPASANG karena file `free_fire_old_rampage_lobby_3d_model.glb` belum tersedia.

## Karakter
- Naruto — rigged, animasi tulang prosedural aktif.
- Rouk — model statis, tanpa skeleton/skin.
- Rias Sexy — model statis, tanpa skeleton/skin.
- The Amazing Spiderman — model statis, tanpa skeleton/skin.

Model statis tetap dapat dipilih dan digerakkan sebagai karakter, tetapi pose/animasi tulang seperti Naruto tidak dapat diterapkan karena file sumber memang tidak memiliki skeleton.

## Pemuatan hemat data
Aset karakter dan peta tetap baru dimuat setelah pemain memilih karakter+peta dan menekan MULAI PERMAINAN. Mengganti karakter saat game aktif hanya memuat karakter tersebut dan tidak memuat ulang peta.

## Paket FULL mulai V21
**FULL PROJECT sengaja TANPA folder `assets/`.**

Tujuannya agar source project ringan dan update kode tidak memaksa pengguna mengunduh ulang GLB besar. Salin aset secara terpisah ke jalur berikut:

```
assets/characters/naruto_free_fire.glb
assets/characters/free_fire_rouk_ff_3d_model.glb
assets/characters/rias_sexy.glb
assets/characters/the_amazing_spiderman.glb
assets/maps/free_fire_clocktower_3d_model_by_ffxn.glb
assets/maps/dapur_mbg_kopdes.glb
assets/maps/free_fire_old_rampage_lobby_3d_model.glb  # belum tersedia
```

## Default tuning
Baseline tetap menggunakan preset pengguna dari ZUSMO FF PENGATURAN V16 yang dipakai sejak V18: Jalan 4.5, Lari 7.5, Jongkok 2.3, Tiarap 0.9, Turn 24, Jump 4, Gravity 16.5, Scale 0.71, dan profil HD tetap.

## Menjalankan
Gunakan HTTP/HTTPS. Jangan membuka `index.html` melalui `file://`.
