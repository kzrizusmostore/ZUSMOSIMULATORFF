ZUSMO FF V14 - FREE FIRE REFERENCE VIDEO PASS
==============================================

Reference used:
- User-provided 913259.mp4 (47 seconds), reviewed across the full recording.

V14 animation changes:
- Rebuilt locomotion defaults around the silhouettes/timing visible in the reference.
- Reduced excessive hand/foot travel.
- Corrected Naruto forearm bend sign: both elbows bend forward on local -Z.
- Walk: compact stride, restrained body bob/hip sway, arms closer to body.
- Run: elbows clearly bent, hands kept near torso, smaller shoulder swing.
- Jump/Fall: short hop, asymmetric lead knee, both forearms in front.
- Land: compact knee/hip compression.
- Crouch: deeper squat, shorter steps, torso forward, hands near thighs.
- Prone: flatter body, elbows/forearms forward, subtle crawl amplitude.
- Added punch overlay and PUKUL mobile button.
- Tap PUKUL for one punch; hold PUKUL for repeated punches.
- Jump Power default/reset = 4.20.

Preserved defaults requested by user:
- Character scale: 0.71x
- Walk: 4.00 m/s
- Run: 5.15 m/s
- Crouch: 1.80 m/s
- Prone: 0.90 m/s

Tuning migration:
- New storage: zusmoff_tuning_v14
- Carries forward movement speeds, character size, spawn/grounding and visual filters.
- Does NOT carry legacy animation amplitudes or old jumpPower, so V14 animation becomes the real default/reset baseline.

Changed runtime files from V13:
- index.html
- style.css
- src/AnimationController.js
- src/CharacterController.js
- src/MobileInput.js
- src/UIManager.js
