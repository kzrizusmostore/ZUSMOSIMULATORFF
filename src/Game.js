import * as THREE from 'three';
import { AssetLoader } from './AssetLoader.js';
import { MapManager } from './MapManager.js';
import { CharacterManager } from './CharacterManager.js';
import { CollisionSystem } from './CollisionSystem.js';
import { GraphicsManager } from './GraphicsManager.js';
import { MobileInput } from './MobileInput.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { AnimationController } from './AnimationController.js';
import { CharacterController } from './CharacterController.js';

export class Game {
  constructor(canvas, ui, maps, characters) {
    this.canvas = canvas;
    this.ui = ui;
    this.maps = maps;
    this.characters = characters;
    this.debugEnabled = new URLSearchParams(location.search).get('debug') === '1';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x98a4ae);
    this.scene.fog = new THREE.Fog(0x98a4ae, 180, 520);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 520);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x98a4ae, 1);
    this.clock = new THREE.Clock();
    this.assetLoader = new AssetLoader();
    this.mapManager = new MapManager(this.scene);
    this.characterManager = new CharacterManager(this.scene);
    this.collision = new CollisionSystem();
    this.graphics = new GraphicsManager(this.renderer, this.camera);
    this.input = new MobileInput();
    this.cameraRig = new ThirdPersonCamera(this.camera, this.collision);
    this.controller = null;
    this.animation = null;
    this.gameActive = false;
    this.loadGeneration = 0;
    this.currentMap = null;
    this.currentCharacter = null;
    this.currentGraphics = 'hd';
    this.tuning = null;
    this.fps = 60;
    this.fpsTimer = 0;
    this.frameCount = 0;
    this.#createLights();
    this.#bindSystemEvents();
    this.graphics.setQuality('hd');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  #createLights() {
    this.hemi = new THREE.HemisphereLight(0xe8f4ff, 0x676b61, 1.20);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff4dc, 1.75);
    this.sun.position.set(24, 40, 18);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.camera.left = -30;
    this.sun.shadow.camera.right = 30;
    this.sun.shadow.camera.top = 30;
    this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.bias = -0.00022;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0xddeaff, 0.45);
    this.fill.position.set(-22, 18, -26);
    this.fill.castShadow = false;
    this.scene.add(this.fill);
    this.scene.add(this.fill.target);
    this.graphics.setLights([this.sun]);
  }

  async start(selection) {
    const generation = ++this.loadGeneration;
    this.gameActive = false;
    this.input.setEnabled(false);
    this.ui.hideHUD();
    this.#disposeWorld();

    const mapDef = this.maps.find((x) => x.id === selection.mapId && x.available);
    const charDef = this.characters.find((x) => x.id === selection.characterId && x.available);
    if (!mapDef || !charDef) {
      this.ui.showError('Peta atau karakter yang dipilih tidak tersedia.');
      return;
    }

    this.currentMap = mapDef;
    this.currentCharacter = charDef;
    this.currentGraphics = 'hd';
    this.tuning = selection.tuning || this.tuning;
    this.graphics.setQuality(this.currentGraphics);
    this.#applyTuning();

    const total = (mapDef.bytes || 0) + (charDef.bytes || 0);
    this.ui.showLoading(total);
    let mapLoaded = 0;
    let charLoaded = 0;

    const updateTransfer = (status) => {
      const loaded = Math.min(total, mapLoaded + charLoaded);
      const pct = total ? (loaded / total) * 92 : 0;
      this.ui.updateLoading(pct, status, loaded, total);
    };

    try {
      const mapGltf = await this.assetLoader.loadGLB(mapDef, (p) => {
        mapLoaded = Math.min(mapDef.bytes || p.total || p.loaded, p.loaded);
        updateTransfer(`Memuat ${mapDef.name}...`);
      });
      if (generation !== this.loadGeneration) return;
      mapLoaded = mapDef.bytes;
      updateTransfer(`Memproses ${mapDef.name}...`);
      await this.#nextFrame();

      const mapRoot = this.mapManager.install(mapDef, mapGltf);
      this.collision.setMap(mapRoot, this.mapManager.bounds);
      this.graphics.trackObject(mapRoot, 'map');
      if (mapDef.environment) {
        this.scene.fog.near = mapDef.environment.fogNear || 120;
        this.scene.fog.far = mapDef.environment.fogFar || 300;
      }
      this.ui.updateLoading(total ? (mapLoaded / total) * 92 : 0, 'Clock Tower siap. Memuat Naruto...', mapLoaded, total);

      const charGltf = await this.assetLoader.loadGLB(charDef, (p) => {
        charLoaded = Math.min(charDef.bytes || p.total || p.loaded, p.loaded);
        updateTransfer(`Memuat ${charDef.name}...`);
      });
      if (generation !== this.loadGeneration) return;
      charLoaded = charDef.bytes;
      this.ui.updateLoading(94, 'Menyiapkan rangka karakter...', total, total);
      await this.#nextFrame();

      const characterInfo = this.characterManager.install(charDef, charGltf);
      this.graphics.trackObject(this.characterManager.group, 'character');
      console.info('[ZUSMO FF] Naruto dimuat');
      console.info(`[ZUSMO FF] Rangka terdeteksi: ${characterInfo.skeletonCount > 0}`);
      console.info(`[ZUSMO FF] Jumlah tulang: ${characterInfo.boneCount}`);
      console.info(`[ZUSMO FF] Klip animasi: ${characterInfo.animations.map((a) => a.name || '(tanpa nama)').join(', ') || 'tidak ada - animasi tulang prosedural aktif'}`);

      if (characterInfo.skeletonCount < 1 || characterInfo.boneCount < 1) {
        throw new Error('Naruto berhasil dimuat, tetapi rangka/tulang asli tidak terdeteksi.');
      }

      this.ui.updateLoading(98, 'Menyiapkan tekstur...', total, total);
      await this.#nextFrame();
      const spawnConfig = this.#getSpawnConfig(mapDef);
      const spawn = this.#resolveSpawnPoint(mapDef, spawnConfig);
      const spawnYaw = THREE.MathUtils.degToRad(spawnConfig.yaw || 0);
      this.characterManager.spawn(spawn, spawnYaw);
      this.characterManager.setVisualTuning(this.tuning);
      this.animation = new AnimationController(characterInfo, this.characterManager.baseVisualY, this.tuning);
      this.controller = new CharacterController(
        this.characterManager.group,
        this.input,
        this.cameraRig,
        this.collision,
        this.animation,
        spawn,
        this.tuning,
        spawnYaw
      );
      this.cameraRig.reset(spawn);
      this.#applyTuning();
      this.ui.updateLoading(100, 'Memasuki dunia...', total, total);
      await this.#nextFrame();
      if (generation !== this.loadGeneration) return;

      this.gameActive = true;
      this.input.setEnabled(true);
      this.clock.getDelta();
      this.ui.showHUD(mapDef, this.currentGraphics, this.debugEnabled);
    } catch (error) {
      console.error('[ZUSMO FF] Kesalahan pemuatan', error);
      if (generation !== this.loadGeneration) return;
      this.gameActive = false;
      this.input.setEnabled(false);
      this.ui.showError(`${error?.message || error}\n\nJalur aset mengikuti index.html. Jalankan melalui HTTP/HTTPS (GitHub Pages, Netlify, atau server lokal), bukan file://.`);
    }
  }

  setQuality(_mode, tuning = null) {
    this.currentGraphics = 'hd';
    if (tuning) this.tuning = tuning;
    this.graphics.setQuality(this.currentGraphics);
    this.#applyTuning();
    this.ui.updateHUDQuality?.(this.currentGraphics);
  }

  setTuning(tuning) {
    this.tuning = tuning;
    this.#applyTuning();
  }

  captureSpawn() {
    if (!this.gameActive || !this.currentMap || !this.characterManager.group) return null;
    const p = this.characterManager.group.position;
    let yaw = THREE.MathUtils.radToDeg(this.characterManager.group.rotation.y);
    yaw = ((yaw + 180) % 360 + 360) % 360 - 180;
    return { mapId: this.currentMap.id, x: p.x, y: p.y, z: p.z, yaw };
  }

  teleportToSpawn(mapId, spawnConfig) {
    if (!this.gameActive || !this.currentMap || this.currentMap.id !== mapId || !this.controller) return false;
    const config = { ...this.#getSpawnConfig(this.currentMap), ...(spawnConfig || {}) };
    const point = this.#resolveSpawnPoint(this.currentMap, config);
    const yaw = THREE.MathUtils.degToRad(config.yaw || 0);
    this.controller.setSpawn(point, yaw, true);
    this.cameraRig.reset(point);
    return true;
  }

  #getSpawnConfig(mapDef) {
    const base = mapDef?.spawn || {};
    const custom = this.tuning?.mapSpawns?.[mapDef?.id] || {};
    return {
      x: Number.isFinite(Number(custom.x)) ? Number(custom.x) : (Number(base.x) || 0),
      y: Number.isFinite(Number(custom.y)) ? Number(custom.y) : (Number(base.y) || 0),
      z: Number.isFinite(Number(custom.z)) ? Number(custom.z) : (Number(base.z) || 0),
      yaw: Number.isFinite(Number(custom.yaw)) ? Number(custom.yaw) : (Number(base.yaw) || 0)
    };
  }

  #resolveSpawnPoint(mapDef, config = this.#getSpawnConfig(mapDef)) {
    const physicsOffset = this.tuning?.grounding?.groundOffset ?? 0.018;
    const preferredY = Number.isFinite(Number(config.y)) ? Number(config.y) : null;
    return this.collision.findSpawn(Number(config.x) || 0, Number(config.z) || 0, physicsOffset, preferredY);
  }

  #applyTuning() {
    if (!this.tuning) return;
    const profile = this.tuning.graphics?.profiles?.[this.currentGraphics];
    if (profile) {
      this.graphics.setDisplayProfile(profile);
      const light = profile.lighting || {};
      if (Number.isFinite(light.hemisphere)) this.hemi.intensity = light.hemisphere;
      if (Number.isFinite(light.ambient)) this.ambient.intensity = light.ambient;
      if (Number.isFinite(light.sun)) this.sun.intensity = light.sun;
      if (Number.isFinite(light.fill)) this.fill.intensity = light.fill;
    }
    this.characterManager?.setVisualTuning(this.tuning);
    this.controller?.setTuning(this.tuning);
    this.animation?.setTuning(this.tuning);
  }

  exitToMenu() {
    ++this.loadGeneration;
    this.gameActive = false;
    this.input.setEnabled(false);
    this.ui.hideHUD();
    this.ui.hideLoading();
    this.ui.closeTuning?.();
    this.ui.showScreen('menu');
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.gameActive && this.controller && this.characterManager.group) {
      this.controller.update(dt);
      const cameraDelta = this.input.consumeCameraDelta();
      this.cameraRig.update(dt, this.characterManager.group.position, cameraDelta);
      this.#updateSun();
      this.ui.syncLiveSpawn?.(this.captureSpawn());
      this.#updateDebug(dt);
    }
    this.graphics.render(this.scene, this.camera);
  }

  #updateSun() {
    const p = this.characterManager.group.position;
    this.sun.position.set(p.x + 24, p.y + 40, p.z + 18);
    this.sun.target.position.set(p.x, p.y + 0.7, p.z);
    this.sun.target.updateMatrixWorld();
    if (this.fill) {
      this.fill.position.set(p.x - 22, p.y + 18, p.z - 26);
      this.fill.target.position.set(p.x, p.y + 0.8, p.z);
      this.fill.target.updateMatrixWorld();
    }
  }

  #updateDebug(dt) {
    this.fpsTimer += dt;
    this.frameCount++;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.fpsTimer = 0;
      this.frameCount = 0;
    }
    if (!this.debugEnabled) return;
    const c = this.controller;
    const profile = this.tuning?.graphics?.profiles?.[this.currentGraphics];
    this.ui.updateDebug(
`FPS: ${this.fps}
Peta: ${this.currentMap?.name} (${this.currentMap?.shortName})
Karakter: ${this.currentCharacter?.name}
Kualitas: ${this.currentGraphics.toUpperCase()}
Ketajaman Peta: ${Math.round((profile?.map?.sharpness || 0) * 100)}%
Ketajaman Karakter: ${Math.round((profile?.character?.sharpness || 0) * 100)}%
State: ${c.state}
Speed: ${c.speed.toFixed(2)} m/s
Jalan / Lari: ${c.settings.walkSpeed.toFixed(1)} / ${c.settings.runSpeed.toFixed(1)} m/s
Ukuran Karakter: ${(this.tuning?.character?.scale ?? 1).toFixed(2)}x
Koreksi Telapak: ${(this.tuning?.character?.footOffset ?? 0).toFixed(3)} m
Koreksi Tanah: ${(c.grounding?.groundOffset ?? 0).toFixed(3)} m
Titik Muncul: ${this.#getSpawnConfig(this.currentMap).x.toFixed(1)}, ${this.#getSpawnConfig(this.currentMap).y.toFixed(1)}, ${this.#getSpawnConfig(this.currentMap).z.toFixed(1)} @ ${this.#getSpawnConfig(this.currentMap).yaw.toFixed(0)}°
Grounded: ${c.grounded}
Tulang: ${this.characterManager.bones.size}
Klip: ${this.characterManager.animations.length}`
    );
  }

  #disposeWorld() {
    if (this.mapManager.current) this.graphics.untrackObject(this.mapManager.current);
    if (this.characterManager.group) this.graphics.untrackObject(this.characterManager.group);
    this.mapManager.dispose();
    this.characterManager.dispose();
    this.collision.setMap(null, new THREE.Box3());
    this.controller = null;
    this.animation = null;
  }

  #bindSystemEvents() {
    window.addEventListener('resize', () => this.graphics.resize(innerWidth, innerHeight), { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(() => this.graphics.resize(innerWidth, innerHeight), 120), { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.gameActive = false;
      this.input.setEnabled(false);
      this.ui.showError('Konteks WebGL terputus. Tekan Coba Lagi setelah peramban pulih, atau muat ulang halaman.');
    });
    this.graphics.resize(innerWidth, innerHeight);
  }

  #nextFrame() { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
}
