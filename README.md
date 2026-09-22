# ZUSMO FF V6

V6 menyederhanakan tuning supaya nyaman dipakai langsung saat gameplay di Android.

## Update V6
- Live tuning sekarang berupa popup kecil di sisi layar, bukan panel yang menutup game.
- Area game di luar popup tetap terlihat dan tetap dapat menerima kontrol.
- Semua nilai punya slider + input angka manual + tombol minus/plus.
- Perubahan terlihat langsung dan otomatis disimpan.
- Tombol SIMPAN hanya menyimpan setting; tidak respawn/teleport karakter.
- Spawn X/Y/Z/Facing dapat diedit tanpa memindahkan karakter. Teleport hanya melalui tombol TELEPORT TEST.
- PAKAI POSISI SAAT INI menyimpan lokasi karakter sebagai spawn map tanpa memindahkan karakter.
- STANDARD/HD tetap tersedia di popup.
- Setting V5 dimigrasikan otomatis ke storage V6.

## File runtime yang berubah dari V5
- `index.html`
- `style.css`
- `src/UIManager.js`

Asset Naruto dan Clock Tower tidak berubah.


## V7 UI / Tuning
- Rendering is permanently HD; there is no Standard/HD selector or label.
- LIVE TUNE is a draggable floating popup.
- Category tabs scroll horizontally; settings content scrolls vertically/horizontally.
- Spawn X/Y/Z/Facing automatically follow the live character position and are saved per map.


## V8 UI TUNE
- Slider touch diganti custom intent-lock: swipe vertikal memprioritaskan scroll; nilai hanya berubah ketika gesture jelas horizontal.
- Popup TUNE dibuat lebih kotak/compact dan tetap draggable.
- Tombol COPY menyalin seluruh tuning sebagai JSON `ZUSMO FF TUNE V8` agar bisa langsung ditempel ke chat.
- Setting lama V7 tetap dibaca; perubahan baru disimpan ke `zusmoff_tuning_v8`.

## V9 tuning fixes
- Idle/stop arm pose now keeps a relaxed baseline instead of falling back toward the raw T-pose.
- Mobile tuning is scroll-first: touch sliders are display-only; use the manual value or hold -/+ to adjust continuously.
- Tuning popup is clamped to the Visual Viewport so it cannot remain cut off at the right edge.
- COPY SETTINGS uses Clipboard API, execCommand fallback, Android share fallback, then a manual selected-text fallback.
