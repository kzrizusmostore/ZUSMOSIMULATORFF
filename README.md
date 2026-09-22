# ZUSMO FF V11

Major movement/camera/tuning rebuild based on the existing Naruto + Clock Tower project.

## Fixed defaults
- Character scale: 0.71x
- Walk: 4.00 m/s
- Run: 5.15 m/s
- Crouch: 1.80 m/s
- Prone: 0.90 m/s
- HD render profile remains fixed.

`RESET` returns to these V11 defaults. V11 intentionally does not import old movement, animation, or character-size tuning from V10/V9; it only preserves prior map spawn, grounding, and visual/filter calibration.

## Movement / animation
- Reduced arm and leg travel so hands/feet no longer swing excessively far forward/back.
- Compact walk/run gait with restrained hip rotation, torso counter-rotation, knee bend, foot roll, and toe push-off.
- Jump, fall, landing, crouch, crouch-walk, prone and crawl poses rebuilt with smaller mobile-shooter-style motions.
- Shorter landing hold so sprint can resume quickly.
- Drag joystick above the normal radius to sprint; RUN button still works.

## Camera
- Camera now starts behind the character, looking at the character's back.
- While moving and not manually dragging the camera, it smoothly returns behind the character.
- Manual camera drag temporarily enables free-look.
- In the air, automatic yaw follow pauses so mid-air character turning does not drag the camera.
- Camera height/distance adapts slightly to standing, crouch, prone and running.
- Fixed camera-relative right-vector direction.

## Live Tune V11
- Smaller popup designed to remain inside Android Visual Viewport.
- Popup position is saved as normalized viewport coordinates so rotation/fullscreen changes do not cut it off on the right.
- Dedicated `MOVE` button is the only drag handle; header text is not draggable/clickable.
- On touch devices the meter/slider is display-only. Vertical swipes are reserved for scrolling.
- Values are changed by manual number input or `- / +`.
- Holding `- / +` repeats continuously after a short delay.
- Tabs are a compact grid instead of a competing horizontal swipe surface.
- Decorative text does not capture pointer input.
- COPY SETTINGS exports `ZUSMO FF TUNE V11`.

## Run correctly
Serve over HTTP/HTTPS. Do not open `index.html` directly via `file://`.
