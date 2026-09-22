const DEFAULT_TUNING = {
  movement: {
    walkSpeed: 4.2,
    runSpeed: 6.8,
    crouchSpeed: 1.8,
    proneSpeed: 0.9,
    acceleration: 14.0,
    deceleration: 18.0,
    turnSpeed: 14.0,
    jumpPower: 7.25,
    gravity: 22.5
  },
  animation: {
    intensity: 1.16,
    walkStride: 1.18,
    runStride: 1.00,
    armSwing: 1.12,
    kneeLift: 1.16,
    bodyBob: 0.92,
    hipSway: 1.18,
    cadence: 1.00,
    blend: 1.10,
    lean: 1.00,
    idleArmDown: 1.02,
    idleElbowBend: 0.30,
    idleArmTwist: 0.06,
    idleShoulderRelax: 0.10,
    idleHandRelax: 0.12,
    idleBreathing: 1.00,
    idleHeadMotion: 1.00
  },
  character: {
    scale: 1.00,
    footOffset: -0.015
  },
  grounding: {
    groundOffset: 0.018,
    snapDistance: 0.62,
    landingDistance: 0.20,
    probeDistance: 7.5
  },
  mapSpawns: {},
  graphics: {
    profiles: {
      standard: {
        exposure: 1.00,
        lighting: { hemisphere: 1.08, ambient: 0.20, sun: 1.55, fill: 0.38 },
        map: { brightness: 0.90, contrast: 1.02, saturation: 0.98, sharpness: 0.00, shadows: 0.00, highlights: -0.08, gamma: 1.00, warmth: 0.00 },
        character: { brightness: 0.99, contrast: 1.03, saturation: 1.02, sharpness: 0.00, shadows: 0.03, highlights: -0.02, gamma: 1.00, warmth: 0.02 }
      },
      hd: {
        exposure: 1.16,
        lighting: { hemisphere: 1.30, ambient: 0.30, sun: 1.88, fill: 0.54 },
        map: { brightness: 1.08, contrast: 1.04, saturation: 1.05, sharpness: 0.50, shadows: 0.11, highlights: 0.03, gamma: 1.04, warmth: 0.00 },
        character: { brightness: 1.10, contrast: 1.05, saturation: 1.07, sharpness: 0.50, shadows: 0.12, highlights: 0.03, gamma: 1.04, warmth: 0.03 }
      }
    }
  }
};

const FILTER_CONTROLS = [
  ['Brightness', 'brightness', 0.55, 1.55, 0.01, '×'],
  ['Contrast', 'contrast', 0.55, 1.55, 0.01, '×'],
  ['Saturation', 'saturation', 0.00, 2.00, 0.01, '×'],
  ['Sharpen', 'sharpness', 0.00, 1.00, 0.01, '%'],
  ['Shadows', 'shadows', -0.60, 0.80, 0.01, ''],
  ['Highlights', 'highlights', -0.60, 0.80, 0.01, ''],
  ['Gamma', 'gamma', 0.65, 1.50, 0.01, ''],
  ['Warmth', 'warmth', -1.00, 1.00, 0.01, '']
];

export class UIManager {
  constructor(maps, characters, defaults) {
    this.maps = maps;
    this.characters = characters;
    this.defaults = defaults;
    this.selectedMap = this.#valid(localStorage.getItem('zusmoff_map'), maps) || defaults.map;
    this.selectedCharacter = this.#valid(localStorage.getItem('zusmoff_character'), characters) || defaults.character;
    this.graphics = 'hd';
    localStorage.setItem('zusmoff_graphics', 'hd');
    this.tuning = this.#loadTuning();
    this.#ensureMapSpawn(this.selectedMap);
    this.activeTuneTab = 'movement';
    this.handlers = {};
    this.lastStart = null;
    this.saveStateTimer = null;
    this.spawnSaveTimer = null;
    this.lastSpawnSyncAt = 0;
    this.tuneDrag = null;
    this.screens = {
      menu: document.getElementById('screen-menu'),
      select: document.getElementById('screen-select'),
      settings: document.getElementById('screen-settings')
    };
    this.loading = document.getElementById('loading');
    this.error = document.getElementById('load-error');
    this.hud = document.getElementById('hud');
    this.debug = document.getElementById('debug');
    this.tuningOverlay = document.getElementById('tuning-overlay');
    this.#renderCards();
    this.#renderTuningControls();
    this.#syncQuality();
    this.#bind();
    this.#syncFullscreenButtons();
    this.#bindTuningDrag();
  }

  bootReady() {
    window.__ZUSMO_BOOTED = true;
    document.getElementById('engine-boot').classList.add('hidden');
    document.getElementById('ui-root').classList.remove('hidden');
    this.showScreen('menu');
  }

  setHandlers(handlers) { this.handlers = handlers; }

  getSelection() {
    return {
      mapId: this.selectedMap,
      characterId: this.selectedCharacter,
      graphics: this.graphics,
      tuning: this.#clone(this.tuning)
    };
  }

  getMapSpawn(mapId = this.selectedMap) {
    return this.#clone(this.#ensureMapSpawn(mapId));
  }

  showScreen(name) {
    Object.values(this.screens).forEach((s) => s.classList.remove('active'));
    this.screens[name]?.classList.add('active');
  }

  showLoading(totalBytes) {
    this.lastTotal = totalBytes;
    this.loading.classList.remove('hidden');
    this.error.classList.add('hidden');
    this.updateLoading(0, 'Starting real asset load...', 0, totalBytes);
  }

  updateLoading(percent, status, loadedBytes = 0, totalBytes = this.lastTotal || 0) {
    const p = Math.max(0, Math.min(100, percent));
    document.getElementById('loading-bar').style.width = `${p}%`;
    document.getElementById('loading-percent').textContent = `${Math.round(p)}%`;
    document.getElementById('loading-status').textContent = status;
    document.getElementById('loading-bytes').textContent = `${this.#mb(loadedBytes)} / ${this.#mb(totalBytes)}`;
  }

  hideLoading() { this.loading.classList.add('hidden'); }

  showError(message) {
    this.loading.classList.add('hidden');
    this.error.classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
  }

  showHUD(map, graphics, debugEnabled) {
    Object.values(this.screens).forEach((s) => s.classList.remove('active'));
    this.loading.classList.add('hidden');
    this.error.classList.add('hidden');
    this.hud.classList.remove('hidden');
    document.getElementById('hud-map').textContent = `${map.shortName} • ${map.name.toUpperCase()}`;
    this.debug.classList.toggle('hidden', !debugEnabled);
    this.#syncQuality();
    this.#syncFullscreenButtons();
  }

  updateHUDQuality() {}

  hideHUD() { this.hud.classList.add('hidden'); }
  updateDebug(text) { if (!this.debug.classList.contains('hidden')) this.debug.textContent = text; }

  openTuning() {
    this.#renderTuningControls();
    this.tuningOverlay.classList.remove('hidden');
    this.#applySavedTunePosition();
    this.#setSaveState('LIVE');
  }

  closeTuning() { this.tuningOverlay.classList.add('hidden'); }

  #bind() {
    document.getElementById('btn-play').addEventListener('click', () => this.showScreen('select'));
    document.getElementById('btn-settings').addEventListener('click', () => this.showScreen('settings'));
    document.querySelectorAll('[data-back="menu"]').forEach((b) => b.addEventListener('click', () => this.showScreen('menu')));
    document.querySelectorAll('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => this.toggleFullscreen()));
    document.querySelectorAll('[data-open-tuning]').forEach((b) => b.addEventListener('click', () => this.openTuning()));
    document.querySelectorAll('[data-close-tuning]').forEach((b) => b.addEventListener('click', () => this.closeTuning()));
    document.getElementById('btn-reset-tuning').addEventListener('click', () => this.#resetTuning());
    document.getElementById('btn-copy-tuning')?.addEventListener('click', () => this.#copyTuningSettings());
    document.getElementById('btn-save-tuning')?.addEventListener('click', () => {
      this.#saveTuning();
      this.#setSaveState('TERSIMPAN • POSISI TETAP', 1500);
    });
    document.getElementById('btn-start').addEventListener('click', () => {
      this.#enterFullscreen();
      this.lastStart = this.getSelection();
      this.handlers.start?.(this.lastStart);
    });
    document.getElementById('btn-retry').addEventListener('click', () => this.handlers.start?.(this.lastStart || this.getSelection()));
    document.getElementById('btn-error-menu').addEventListener('click', () => { this.error.classList.add('hidden'); this.showScreen('menu'); });
    document.getElementById('btn-exit').addEventListener('click', () => this.handlers.exit?.());
    document.addEventListener('fullscreenchange', () => this.#syncFullscreenButtons());
    document.addEventListener('webkitfullscreenchange', () => this.#syncFullscreenButtons());
    window.addEventListener('resize', () => this.#clampTunePosition());
  }

  #bindTuningDrag() {
    const panel = this.tuningOverlay?.querySelector('.tuning-panel');
    const handle = this.tuningOverlay?.querySelector('.tuning-head');
    if (!panel || !handle) return;
    handle.classList.add('tune-drag-handle');

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button, input, select, textarea')) return;
      const rect = panel.getBoundingClientRect();
      this.tuneDrag = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      handle.setPointerCapture?.(event.pointerId);
      panel.classList.add('is-dragging');
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!this.tuneDrag || this.tuneDrag.pointerId !== event.pointerId) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const maxX = Math.max(4, window.innerWidth - w - 4);
      const maxY = Math.max(4, window.innerHeight - h - 4);
      const x = Math.min(maxX, Math.max(4, event.clientX - this.tuneDrag.dx));
      const y = Math.min(maxY, Math.max(4, event.clientY - this.tuneDrag.dy));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    const finish = (event) => {
      if (!this.tuneDrag || this.tuneDrag.pointerId !== event.pointerId) return;
      const rect = panel.getBoundingClientRect();
      localStorage.setItem('zusmoff_tune_position_v7', JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
      this.tuneDrag = null;
      panel.classList.remove('is-dragging');
      try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  #applySavedTunePosition() {
    const panel = this.tuningOverlay?.querySelector('.tuning-panel');
    if (!panel) return;
    try {
      const pos = JSON.parse(localStorage.getItem('zusmoff_tune_position_v7') || 'null');
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        panel.style.left = `${pos.x}px`;
        panel.style.top = `${pos.y}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } catch (_) {}
    requestAnimationFrame(() => this.#clampTunePosition());
  }

  #clampTunePosition() {
    const panel = this.tuningOverlay?.querySelector('.tuning-panel');
    if (!panel || this.tuningOverlay.classList.contains('hidden')) return;
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(4, window.innerWidth - rect.width - 4);
    const maxY = Math.max(4, window.innerHeight - rect.height - 4);
    const x = Math.min(maxX, Math.max(4, rect.left));
    const y = Math.min(maxY, Math.max(4, rect.top));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  async toggleFullscreen() {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        await this.#enterFullscreen();
      }
    } catch (error) {
      console.warn('[ZUSMO FF] Fullscreen request was blocked by the browser', error);
    }
    this.#syncFullscreenButtons();
  }

  async #enterFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    const root = document.documentElement;
    try {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else return false;
      try { await screen.orientation?.lock?.('landscape'); } catch (_) {}
      return true;
    } catch (error) {
      console.warn('[ZUSMO FF] Fullscreen unavailable', error);
      return false;
    }
  }

  #syncFullscreenButtons() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.querySelectorAll('.fullscreen-btn').forEach((button) => {
      button.textContent = active ? 'EXIT FULLSCREEN' : (button.closest('#screen-menu') ? 'FULLSCREEN' : 'ENTER FULLSCREEN');
    });
    document.querySelectorAll('.hud-fullscreen').forEach((button) => { button.textContent = active ? 'WINDOW' : 'FULL'; });
  }

  setQuality(_mode = 'hd') {
    this.graphics = 'hd';
    localStorage.setItem('zusmoff_graphics', 'hd');
    this.handlers.quality?.('hd', this.#clone(this.tuning));
  }

  #syncQuality() {
    this.graphics = 'hd';
    localStorage.setItem('zusmoff_graphics', 'hd');
  }

  #getTuneGroups() {
    const profile = 'graphics.profiles.hd';
    const mapDef = this.maps.find((m) => m.id === this.selectedMap) || this.maps[0];
    const charDef = this.characters.find((c) => c.id === this.selectedCharacter) || this.characters[0];
    const spawn = this.#ensureMapSpawn(mapDef?.id);
    const spawnPath = `mapSpawns.${mapDef?.id}`;
    const range = mapDef?.spawnRange || { xMin: -250, xMax: 250, yMin: -10, yMax: 160, zMin: -250, zMax: 250 };
    return [
      {
        id: 'movement', label: 'MOVE', title: 'MOVEMENT', subtitle: 'Atur kecepatan dan rasa controller.',
        controls: [
          ['Walk Speed', 'movement.walkSpeed', 2.5, 6.0, 0.05, ' m/s'],
          ['Run Speed', 'movement.runSpeed', 4.5, 9.0, 0.05, ' m/s'],
          ['Crouch Speed', 'movement.crouchSpeed', 0.6, 3.0, 0.05, ' m/s'],
          ['Prone Speed', 'movement.proneSpeed', 0.3, 1.6, 0.05, ' m/s'],
          ['Acceleration', 'movement.acceleration', 5, 25, 0.5, ''],
          ['Deceleration', 'movement.deceleration', 5, 28, 0.5, ''],
          ['Turn Speed', 'movement.turnSpeed', 5, 24, 0.5, ''],
          ['Jump Power', 'movement.jumpPower', 4.5, 10, 0.05, ''],
          ['Gravity', 'movement.gravity', 12, 34, 0.5, '']
        ]
      },
      {
        id: 'animation', label: 'ANIM', title: 'ANIMATION', subtitle: 'Atur gerak skeleton Naruto secara live.',
        controls: [
          ['Motion Intensity', 'animation.intensity', 0.55, 1.70, 0.01, '×'],
          ['Walk Stride', 'animation.walkStride', 0.55, 1.65, 0.01, '×'],
          ['Run Stride', 'animation.runStride', 0.55, 1.55, 0.01, '×'],
          ['Arm Swing', 'animation.armSwing', 0.50, 1.75, 0.01, '×'],
          ['Knee Lift', 'animation.kneeLift', 0.50, 1.75, 0.01, '×'],
          ['Body Bob', 'animation.bodyBob', 0.00, 1.70, 0.01, '×'],
          ['Hip Sway', 'animation.hipSway', 0.00, 1.70, 0.01, '×'],
          ['Cadence', 'animation.cadence', 0.65, 1.45, 0.01, '×'],
          ['Blend / Smooth', 'animation.blend', 0.55, 1.80, 0.01, '×'],
          ['Run Lean', 'animation.lean', 0.30, 1.60, 0.01, '×']
        ]
      },
      {
        id: 'idle', label: 'IDLE', title: 'IDLE / STOP POSE', subtitle: 'Atur posisi tangan dan badan saat Naruto berhenti. Nilai Arm Down 0 = kembali mendekati T-pose.',
        controls: [
          ['Arm Down', 'animation.idleArmDown', 0.00, 1.45, 0.01, ' rad'],
          ['Elbow Bend', 'animation.idleElbowBend', 0.00, 0.80, 0.01, ' rad'],
          ['Arm Twist', 'animation.idleArmTwist', -0.40, 0.40, 0.01, ' rad'],
          ['Shoulder Relax', 'animation.idleShoulderRelax', 0.00, 0.30, 0.01, '×'],
          ['Hand Relax', 'animation.idleHandRelax', 0.00, 0.45, 0.01, '×'],
          ['Breathing', 'animation.idleBreathing', 0.00, 1.80, 0.01, '×'],
          ['Head Micro Motion', 'animation.idleHeadMotion', 0.00, 1.80, 0.01, '×']
        ]
      },
      {
        id: 'character', label: 'SIZE/GROUND', title: 'CHARACTER SIZE & GROUND', subtitle: 'Sesuaikan ukuran Naruto dan posisi telapak kaki terhadap permukaan map.',
        controls: [
          ['Character Size', 'character.scale', 0.70, 1.35, 0.01, '×'],
          ['Foot Ground Offset', 'character.footOffset', -0.25, 0.25, 0.005, ' m'],
          ['Physics Ground Offset', 'grounding.groundOffset', -0.08, 0.16, 0.002, ' m'],
          ['Ground Snap Distance', 'grounding.snapDistance', 0.10, 1.40, 0.02, ' m'],
          ['Landing Snap Range', 'grounding.landingDistance', 0.05, 0.55, 0.01, ' m'],
          ['Ground Probe Depth', 'grounding.probeDistance', 3.0, 14.0, 0.25, ' m']
        ]
      },
      {
        id: 'spawn', label: 'SPAWN', title: `MAP SPAWN • ${mapDef?.shortName || 'MAP'}`, subtitle: `Spawn disimpan khusus untuk ${mapDef?.name || 'map ini'}. X/Y/Z memilih lokasi; Y dipakai untuk memilih lantai/permukaan map yang paling dekat.`,
        controls: [
          ['Spawn X', `${spawnPath}.x`, range.xMin, range.xMax, 0.25, ' m'],
          ['Spawn Y / Floor', `${spawnPath}.y`, range.yMin, range.yMax, 0.25, ' m'],
          ['Spawn Z', `${spawnPath}.z`, range.zMin, range.zMax, 0.25, ' m'],
          ['Facing', `${spawnPath}.yaw`, -180, 180, 1, '°']
        ],
        mapId: mapDef?.id,
        spawn
      },
      {
        id: 'world', label: 'LIGHT', title: 'WORLD LIGHTING', subtitle: 'Atur pencahayaan dunia secara live.',
        controls: [
          ['Exposure', `${profile}.exposure`, 0.65, 1.65, 0.01, ''],
          ['Hemisphere', `${profile}.lighting.hemisphere`, 0.0, 3.0, 0.01, ''],
          ['Ambient', `${profile}.lighting.ambient`, 0.0, 1.5, 0.01, ''],
          ['Sun', `${profile}.lighting.sun`, 0.0, 4.0, 0.01, ''],
          ['Fill Light', `${profile}.lighting.fill`, 0.0, 2.5, 0.01, '']
        ]
      },
      {
        id: 'map', label: 'MAP', title: 'MAP FILTER', subtitle: `Filter ${mapDef?.name || 'map'} secara live.`,
        controls: FILTER_CONTROLS.map((c) => [c[0], `${profile}.map.${c[1]}`, ...c.slice(2)])
      },
      {
        id: 'charfilter', label: 'CHAR', title: 'CHARACTER FILTER', subtitle: `Filter ${charDef?.name || 'character'} secara live.`,
        controls: FILTER_CONTROLS.map((c) => [c[0], `${profile}.character.${c[1]}`, ...c.slice(2)])
      }
    ];
  }

  #renderTuningControls() {
    const root = document.getElementById('tuning-controls');
    const tabs = document.getElementById('tuning-tabs');
    if (!root || !tabs) return;
    root.innerHTML = '';
    tabs.innerHTML = '';
    const groups = this.#getTuneGroups();
    if (!groups.some((g) => g.id === this.activeTuneTab)) this.activeTuneTab = groups[0].id;

    for (const groupDef of groups) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tuning-tab';
      tab.textContent = groupDef.label;
      tab.classList.toggle('active', groupDef.id === this.activeTuneTab);
      tab.addEventListener('click', () => {
        this.activeTuneTab = groupDef.id;
        this.#renderTuningControls();
        const scroller = this.tuningOverlay.querySelector('.tuning-scroll');
        if (scroller) scroller.scrollTop = 0;
      });
      tabs.appendChild(tab);

      const group = this.#makeGroup(groupDef.title, groupDef.subtitle, groupDef.controls);
      group.dataset.tuneGroup = groupDef.id;
      group.classList.toggle('active', groupDef.id === this.activeTuneTab);
      if (groupDef.id === 'spawn') this.#appendSpawnActions(group, groupDef.mapId);
      root.appendChild(group);
    }

  }

  #makeGroup(title, subtitle, controls) {
    const group = document.createElement('section');
    group.className = 'tune-group';
    group.innerHTML = `<div class="tune-group-head"><div><b>${title}</b><small>${subtitle}</small></div><span>LIVE</span></div>`;
    const list = document.createElement('div');
    list.className = 'slider-list';

    for (const [label, path, min, max, step, suffix] of controls) {
      const initial = Number(this.#getByPath(this.tuning, path));
      const isPercent = suffix === '%';
      const displayScale = isPercent ? 100 : 1;
      const displayMin = Number(min) * displayScale;
      const displayMax = Number(max) * displayScale;
      const displayStep = Number(step) * displayScale;
      const displayInitial = initial * displayScale;
      const displayDigits = displayStep < 0.01 ? 3 : displayStep < 0.1 ? 2 : displayStep < 1 ? 1 : 0;
      const formatDisplay = (value) => Number(value).toFixed(displayDigits);
      const row = document.createElement('div');
      row.className = 'slider-row compact-setting';
      row.innerHTML = `
        <div class="setting-line">
          <span class="slider-label">${label}</span>
          <div class="manual-value">
            <button type="button" class="value-step" data-dir="-1" aria-label="Decrease ${label}">−</button>
            <input class="value-number" data-setting-path="${path}" type="number" inputmode="decimal" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${formatDisplay(displayInitial)}" aria-label="${label} manual value">
            <span class="value-unit">${isPercent ? '%' : (suffix || '').trim()}</span>
            <button type="button" class="value-step" data-dir="1" aria-label="Increase ${label}">+</button>
          </div>
        </div>
        <div class="setting-slider" role="slider" tabindex="0"
          data-setting-path="${path}" data-min="${min}" data-max="${max}" data-step="${step}" data-value="${initial}"
          aria-label="${label}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${initial}">
          <span class="setting-slider-fill"></span><span class="setting-slider-thumb"></span>
        </div>`;

      const slider = row.querySelector('.setting-slider');
      const number = row.querySelector('.value-number');
      const stepButtons = row.querySelectorAll('.value-step');

      const clampInternal = (v) => Math.min(Number(max), Math.max(Number(min), v));
      const clampDisplay = (v) => Math.min(displayMax, Math.max(displayMin, v));
      const snapInternal = (v) => {
        const snapped = Number(min) + Math.round((clampInternal(v) - Number(min)) / Number(step)) * Number(step);
        return clampInternal(Number(snapped.toFixed(8)));
      };
      const applyInternal = (rawInternal, source = 'slider') => {
        if (!Number.isFinite(Number(rawInternal))) return;
        const next = snapInternal(Number(rawInternal));
        this.#setByPath(this.tuning, path, next);
        this.#setSliderValue(slider, next);
        if (source !== 'number-typing') number.value = formatDisplay(next * displayScale);
        this.#saveTuning();
        this.handlers.tuning?.(this.#clone(this.tuning));
        this.updateHUDQuality(this.graphics);
        this.#setSaveState('LIVE • TERSIMPAN', 850);
      };

      this.#setSliderValue(slider, initial);
      this.#bindIntentSlider(slider, applyInternal);
      number.addEventListener('input', () => {
        if (number.value === '' || number.value === '-' || number.value === '.') return;
        const displayValue = clampDisplay(Number(number.value));
        applyInternal(displayValue / displayScale, 'number-typing');
      });
      number.addEventListener('change', () => {
        const displayValue = clampDisplay(Number(number.value));
        number.value = formatDisplay(displayValue);
        applyInternal(displayValue / displayScale, 'number');
      });
      number.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); number.blur(); }
      });
      stepButtons.forEach((button) => button.addEventListener('click', () => {
        const dir = Number(button.dataset.dir) || 0;
        const displayValue = clampDisplay(Number(number.value || displayInitial) + dir * displayStep);
        number.value = formatDisplay(displayValue);
        applyInternal(displayValue / displayScale, 'step');
      }));
      list.appendChild(row);
    }
    group.appendChild(list);
    return group;
  }

  #setSliderValue(slider, value) {
    if (!slider) return;
    const min = Number(slider.dataset.min);
    const max = Number(slider.dataset.max);
    const next = Math.min(max, Math.max(min, Number(value)));
    const pct = max > min ? ((next - min) / (max - min)) * 100 : 0;
    slider.dataset.value = String(next);
    slider.style.setProperty('--slider-pct', `${pct}%`);
    slider.setAttribute('aria-valuenow', String(next));
  }

  #bindIntentSlider(slider, applyValue) {
    let gesture = null;
    const valueFromX = (clientX) => {
      const rect = slider.getBoundingClientRect();
      const min = Number(slider.dataset.min);
      const max = Number(slider.dataset.max);
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      return min + (max - min) * ratio;
    };
    const cleanup = (event) => {
      if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
      try { slider.releasePointerCapture?.(gesture.pointerId); } catch (_) {}
      slider.classList.remove('is-adjusting');
      gesture = null;
    };

    slider.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, mode: event.pointerType === 'mouse' ? 'horizontal' : 'pending' };
      if (gesture.mode === 'horizontal') {
        slider.setPointerCapture?.(event.pointerId);
        slider.classList.add('is-adjusting');
        applyValue(valueFromX(event.clientX), 'slider');
        event.preventDefault();
      }
    });

    slider.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.mode === 'pending') {
        if (Math.abs(dy) >= 7 && Math.abs(dy) > Math.abs(dx) * 1.15) {
          gesture.mode = 'vertical';
          return;
        }
        if (Math.abs(dx) >= 7 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          gesture.mode = 'horizontal';
          slider.setPointerCapture?.(event.pointerId);
          slider.classList.add('is-adjusting');
        } else {
          return;
        }
      }
      if (gesture.mode !== 'horizontal') return;
      event.preventDefault();
      applyValue(valueFromX(event.clientX), 'slider');
    });

    slider.addEventListener('pointerup', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.mode === 'pending') {
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (Math.hypot(dx, dy) < 6) applyValue(valueFromX(event.clientX), 'slider');
      }
      cleanup(event);
    });
    slider.addEventListener('pointercancel', cleanup);
    slider.addEventListener('keydown', (event) => {
      const step = Number(slider.dataset.step) || 0.01;
      const current = Number(slider.dataset.value);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); applyValue(current - step, 'slider'); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); applyValue(current + step, 'slider'); }
      if (event.key === 'Home') { event.preventDefault(); applyValue(Number(slider.dataset.min), 'slider'); }
      if (event.key === 'End') { event.preventDefault(); applyValue(Number(slider.dataset.max), 'slider'); }
    });
  }

  async #copyTuningSettings() {
    const payload = {
      type: 'ZUSMO_FF_TUNE',
      version: 8,
      map: this.selectedMap,
      character: this.selectedCharacter,
      graphics: 'HD_FIXED',
      tuning: this.#clone(this.tuning)
    };
    const text = `ZUSMO FF TUNE V8\n${JSON.stringify(payload, null, 2)}`;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) {}
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      try { copied = document.execCommand('copy'); } catch (_) {}
      textarea.remove();
    }
    this.#setSaveState(copied ? 'TERSALIN • KIRIM KE CHAT' : 'COPY GAGAL', 1800);
  }

  #appendSpawnActions(group, mapId) {
    const actions = document.createElement('div');
    actions.className = 'spawn-tools auto-spawn-tools';
    actions.innerHTML = `
      <div class="spawn-tools-head">
        <b>AUTO SPAWN FOLLOW</b>
        <span id="spawn-live-note">Posisi spawn mengikuti karakter secara otomatis saat bergerak.</span>
      </div>
      <div class="spawn-live-pill"><i></i><span>LIVE • MAP ${mapId || '-'}</span></div>`;
    group.appendChild(actions);
  }

  syncLiveSpawn(snapshot) {
    if (!snapshot?.mapId) return;
    const now = performance.now();
    if (now - this.lastSpawnSyncAt < 90) return;
    this.lastSpawnSyncAt = now;

    const spawn = this.#ensureMapSpawn(snapshot.mapId);
    spawn.x = Number(snapshot.x.toFixed(2));
    spawn.y = Number(snapshot.y.toFixed(2));
    spawn.z = Number(snapshot.z.toFixed(2));
    spawn.yaw = Math.round(snapshot.yaw || 0);

    if (!this.tuningOverlay.classList.contains('hidden') && this.activeTuneTab === 'spawn' && snapshot.mapId === this.selectedMap) {
      const base = `mapSpawns.${snapshot.mapId}`;
      const vals = { [`${base}.x`]: spawn.x, [`${base}.y`]: spawn.y, [`${base}.z`]: spawn.z, [`${base}.yaw`]: spawn.yaw };
      for (const [path, value] of Object.entries(vals)) {
        const slider = this.tuningOverlay.querySelector(`.setting-slider[data-setting-path="${path}"]`);
        if (slider) this.#setSliderValue(slider, value);
        const number = this.tuningOverlay.querySelector(`.value-number[data-setting-path="${path}"]`);
        if (number && document.activeElement !== number) number.value = path.endsWith('.yaw') ? String(Math.round(value)) : Number(value).toFixed(2);
      }
      const note = document.getElementById('spawn-live-note');
      if (note) note.textContent = `X ${spawn.x.toFixed(2)} • Y ${spawn.y.toFixed(2)} • Z ${spawn.z.toFixed(2)} • ${spawn.yaw}°`;
    }

    if (this.spawnSaveTimer) clearTimeout(this.spawnSaveTimer);
    this.spawnSaveTimer = setTimeout(() => this.#saveTuning(), 450);
  }

  #defaultMapSpawn(mapId) {
    const def = this.maps.find((m) => m.id === mapId);
    return {
      x: Number(def?.spawn?.x) || 0,
      z: Number(def?.spawn?.z) || 0,
      y: Number(def?.spawn?.y) || 0,
      yaw: Number(def?.spawn?.yaw) || 0
    };
  }

  #ensureMapSpawn(mapId) {
    if (!mapId) return { x: 0, y: 0, z: 0, yaw: 0 };
    if (!this.tuning.mapSpawns || typeof this.tuning.mapSpawns !== 'object') this.tuning.mapSpawns = {};
    const defaults = this.#defaultMapSpawn(mapId);
    const saved = this.tuning.mapSpawns[mapId] || {};
    this.tuning.mapSpawns[mapId] = { ...defaults, ...saved };
    return this.tuning.mapSpawns[mapId];
  }

  #resetTuning() {
    this.tuning = this.#clone(DEFAULT_TUNING);
    this.#saveTuning();
    this.#renderTuningControls();
    this.handlers.tuning?.(this.#clone(this.tuning));
    this.handlers.quality?.(this.graphics, this.#clone(this.tuning));
    this.updateHUDQuality(this.graphics);
  }

  #loadTuning() {
    try {
      const raw = localStorage.getItem('zusmoff_tuning_v8') || localStorage.getItem('zusmoff_tuning_v7') || localStorage.getItem('zusmoff_tuning_v6') || localStorage.getItem('zusmoff_tuning_v5') || localStorage.getItem('zusmoff_tuning_v4') || 'null';
      const saved = JSON.parse(raw);
      return this.#deepMerge(this.#clone(DEFAULT_TUNING), saved || {});
    } catch (_) {
      return this.#clone(DEFAULT_TUNING);
    }
  }

  #saveTuning() {
    localStorage.setItem('zusmoff_tuning_v8', JSON.stringify(this.tuning));
  }

  #setSaveState(message, resetAfter = 0) {
    const el = document.getElementById('tuning-save-state');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('saved', message.includes('TERSIMPAN'));
    if (this.saveStateTimer) clearTimeout(this.saveStateTimer);
    if (resetAfter > 0) {
      this.saveStateTimer = setTimeout(() => {
        el.textContent = 'LIVE';
        el.classList.remove('saved');
      }, resetAfter);
    }
  }

  #renderCards() {
    const characterList = document.getElementById('character-list');
    characterList.innerHTML = '';
    for (const c of this.characters) {
      const el = document.createElement('button');
      el.className = 'select-card';
      el.innerHTML = `<span class="status">${c.available ? 'AVAILABLE' : 'LOCKED'}</span><span class="code">N</span><b>${c.name}</b><small>Original rig / skeleton</small>`;
      el.disabled = !c.available;
      el.addEventListener('click', () => { this.selectedCharacter = c.id; localStorage.setItem('zusmoff_character', c.id); this.#renderCards(); });
      el.classList.toggle('selected', this.selectedCharacter === c.id);
      characterList.appendChild(el);
    }

    const mapList = document.getElementById('map-list');
    mapList.innerHTML = '';
    for (const m of this.maps) {
      const el = document.createElement('button');
      el.className = 'select-card';
      el.innerHTML = `<span class="status">${m.available ? 'AVAILABLE' : 'LOCKED'}</span><span class="code">${m.shortName}</span><b>${m.name}</b><small>${m.shortName} • Original GLB map</small>`;
      el.disabled = !m.available;
      el.addEventListener('click', () => {
        this.selectedMap = m.id;
        localStorage.setItem('zusmoff_map', m.id);
        this.#ensureMapSpawn(m.id);
        this.#renderCards();
        if (!this.tuningOverlay.classList.contains('hidden')) this.#renderTuningControls();
      });
      el.classList.toggle('selected', this.selectedMap === m.id);
      mapList.appendChild(el);
    }
  }

  #valid(id, list) { return list.some((x) => x.id === id && x.available) ? id : null; }
  #mb(bytes) { return `${(bytes / 1048576).toFixed(bytes > 10485760 ? 1 : 2)} MB`; }
  #clone(value) { return JSON.parse(JSON.stringify(value)); }
  #getByPath(obj, path) { return path.split('.').reduce((v, key) => v?.[key], obj); }
  #setByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts.at(-1)] = value;
  }
  #format(value, step) {
    if (step < 0.01) return value.toFixed(3);
    if (step < 0.1) return value.toFixed(2);
    if (step < 1) return value.toFixed(1);
    return value.toFixed(0);
  }
  #deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    for (const [key, value] of Object.entries(extra)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') this.#deepMerge(base[key], value);
      else if (value !== undefined) base[key] = value;
    }
    return base;
  }
}
