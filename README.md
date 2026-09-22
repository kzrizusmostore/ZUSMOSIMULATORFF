# ZUSMO FF

3D mobile character movement simulator built for Android browsers with Three.js.

## What is included

- Original Clock Tower GLB map from the supplied ZIP.
- Original Naruto skinned model and its original skeleton/rig.
- Naruto has 79 joints/bones and no embedded animation clips, so the project uses procedural animation on the existing bones (no re-rig).
- Walk, run, jump, fall, land, crouch, crouch-walk, prone, prone-crawl.
- Camera-relative movement, third-person camera, camera drag, multi-touch controls.
- Real byte-based loading progress with timeout, visible errors, and Retry.
- STANDARD mode (sharpening off) and HD mode (runtime sharpen strength 0.5 / 50%, higher anisotropy and pixel ratio).
- Modular map and character registries for future additions.
- `?debug=1` shows FPS, map, character, quality, state, speed, grounded state and bone count.

## Run / deploy

This is a static website, but it must be served through HTTP/HTTPS because browser `fetch()` is used for GLB loading. Do not open `index.html` directly with `file://`.

You can upload the whole folder to Netlify/GitHub Pages or run any local static server from this folder.

The Clock Tower GLB is about 21.8 MB, below GitHub's 25 MB-per-file workflow constraint mentioned for this project.

## Adding another map

Add its GLB under `assets/maps/`, then add one object to `MAPS` in `src/config/registry.js`. Core movement, camera and UI do not need to be rewritten.

## Adding another character

Add its GLB under `assets/characters/`, then add one object to `CHARACTERS` in `src/config/registry.js`. The current procedural animator is tuned for the supplied Naruto bone names; a future character can use clips or its own bone mapping without changing the movement controller.
