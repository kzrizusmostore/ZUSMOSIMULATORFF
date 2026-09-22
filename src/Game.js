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
    this.scene.background = new THREE.Color(0x7f91a0);
    this.scene.fog = new THREE.Fog(0x93a0aa, 120, 300);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.08, 520);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x7f91a0, 1);
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
    this.currentGraphics = 'standard';
    this.fps = 60;
    this.fpsTimer = 0;
    this.frameCount = 0;
    this.#createLights();
    this.#bindSystemEvents();
    this.graphics.setQuality('standard');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  #createLights() {
    this.hemi = new THREE.HemisphereLight(0xd9ebff, 0x52604c, 1.65);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.28);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff1d8, 2.15);
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
      this.ui.showError('Selected map or character is not available.');
      return;
    }

    this.currentMap = mapDef;
    this.currentCharacter = charDef;
    this.currentGraphics = selection.graphics === 'hd' ? 'hd' : 'standard';
    this.graphics.setQuality(this.currentGraphics);
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
        updateTransfer(`Loading ${mapDef.name}...`);
      });
      if (generation !== this.loadGeneration) return;
      mapLoaded = mapDef.bytes;
      updateTransfer(`Parsing ${mapDef.name}...`);
      await this.#nextFrame();

      const mapRoot = this.mapManager.install(mapDef, mapGltf);
      this.collision.setMap(mapRoot, this.mapManager.bounds);
      this.graphics.trackObject(mapRoot);
      if (mapDef.environment) {
        this.scene.fog.near = mapDef.environment.fogNear || 120;
        this.scene.fog.far = mapDef.environment.fogFar || 300;
      }
      this.ui.updateLoading(total ? (mapLoaded / total) * 92 : 0, 'Clock Tower ready. Loading Naruto...', mapLoaded, total);

      const charGltf = await this.assetLoader.loadGLB(charDef, (p) => {
        charLoaded = Math.min(charDef.bytes || p.total || p.loaded, p.loaded);
        updateTransfer(`Loading ${charDef.name}...`);
      });
      if (generation !== this.loadGeneration) return;
      charLoaded = charDef.bytes;
      this.ui.updateLoading(94, 'Preparing Skeleton...', total, total);
      await this.#nextFrame();

      const characterInfo = this.characterManager.install(charDef, charGltf);
      this.graphics.trackObject(this.characterManager.group);
      console.info('[ZUSMO FF] Naruto loaded');
      console.info(`[ZUSMO FF] Skeleton detected: ${characterInfo.skeletonCount > 0}`);
      console.info(`[ZUSMO FF] Bone count: ${characterInfo.boneCount}`);
      console.info(`[ZUSMO FF] Animation clips: ${characterInfo.animations.map((a) => a.name || '(unnamed)').join(', ') || 'none - procedural bone animation active'}`);

      if (characterInfo.skeletonCount < 1 || characterInfo.boneCount < 1) {
        throw new Error('Naruto loaded but no original skeleton/bones were detected.');
      }

      this.ui.updateLoading(98, 'Preparing Textures...', total, total);
      await this.#nextFrame();
      const spawn = this.collision.findSpawn(mapDef.spawn?.x || 0, mapDef.spawn?.z || 0);
      this.characterManager.spawn(spawn);
      this.animation = new AnimationController(characterInfo, this.characterManager.baseVisualY);
      this.controller = new CharacterController(
        this.characterManager.group,
        this.input,
        this.cameraRig,
        this.collision,
        this.animation,
        spawn
      );
      this.cameraRig.reset(spawn);
      this.ui.updateLoading(100, 'Entering World...', total, total);
      await this.#nextFrame();
      if (generation !== this.loadGeneration) return;

      this.gameActive = true;
      this.input.setEnabled(true);
      this.clock.getDelta();
      this.ui.showHUD(mapDef, this.currentGraphics, this.debugEnabled);
    } catch (error) {
      console.error('[ZUSMO FF] Load error', error);
      if (generation !== this.loadGeneration) return;
      this.gameActive = false;
      this.input.setEnabled(false);
      this.ui.showError(`${error?.message || error}\n\nAsset paths are relative to index.html. Deploy through HTTP/HTTPS (GitHub Pages, Netlify, local server), not file://.`);
    }
  }

  setQuality(mode) {
    this.currentGraphics = mode === 'hd' ? 'hd' : 'standard';
    this.graphics.setQuality(this.currentGraphics);
    if (this.gameActive) {
      document.getElementById('hud-quality').textContent = this.currentGraphics === 'hd' ? 'HD • SHARP 50%' : 'STANDARD';
    }
  }

  exitToMenu() {
    ++this.loadGeneration;
    this.gameActive = false;
    this.input.setEnabled(false);
    this.ui.hideHUD();
    this.ui.hideLoading();
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
      this.#updateDebug(dt);
    }
    this.graphics.render(this.scene, this.camera);
  }

  #updateSun() {
    const p = this.characterManager.group.position;
    this.sun.position.set(p.x + 24, p.y + 40, p.z + 18);
    this.sun.target.position.set(p.x, p.y + 0.7, p.z);
    this.sun.target.updateMatrixWorld();
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
    this.ui.updateDebug(
`FPS: ${this.fps}
Map: ${this.currentMap?.name} (${this.currentMap?.shortName})
Character: ${this.currentCharacter?.name}
Quality: ${this.currentGraphics.toUpperCase()}
Sharpen: ${this.currentGraphics === 'hd' ? '50%' : 'OFF'}
State: ${c.state}
Speed: ${c.speed.toFixed(2)} m/s
Grounded: ${c.grounded}
Bones: ${this.characterManager.bones.size}
Clips: ${this.characterManager.animations.length}`
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
      this.ui.showError('WebGL context was lost. Press Retry after the browser recovers, or reload the page.');
    });
    this.graphics.resize(innerWidth, innerHeight);
  }

  #nextFrame() { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
}
