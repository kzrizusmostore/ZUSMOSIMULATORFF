ZUSMO FF V12 - CAMERA LOCK FIX

Perubahan utama:
- Kamera default selalu dikunci dari belakang karakter selama area kamera tidak disentuh.
- Tidak ada followDelay / tunggu sebelum kamera kembali ke belakang.
- Free-look hanya aktif saat pointer/jari masih menyentuh camera zone.
- Setelah free-look dilepas, kamera kembali ke belakang karakter pada frame berikutnya.
- Posisi kamera auto-follow tidak lagi lerp dari samping; posisi rig dihitung langsung di belakang yaw karakter.
- Movement memakai controlYaw terpisah agar lock kamera tidak membuat karakter berputar terus saat joystick lateral ditahan.

File runtime yang berubah dari V11:
- src/ThirdPersonCamera.js
- src/Game.js
