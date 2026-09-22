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
    lean: 1.00
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
    this.graphics = ['standard', 'hd'].includes(localStorage.getItem('zusmoff_graphics')) ? localStorage.getItem('zusmoff_graphics') : defaults.graphics;
    this.tuning = this.#loadTuning();
    this.activeTuneTab = 'movement';
    this.handlers = {};
    this.lastStart = null;
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
    this.updateHUDQuality(graphics);
    this.debug.classList.toggle('hidden', !debugEnabled);
    this.#syncQuality();
    this.#syncFullscreenButtons();
  }

  updateHUDQuality(graphics = this.graphics) {
    const el = document.getElementById('hud-quality');
    if (!el) return;
    const p = this.tuning.graphics.profiles[graphics];
    const sharp = Math.round((p?.map?.sharpness || 0) * 100);
    el.textContent = graphics === 'hd' ? `HD • SHARP ${sharp}%` : 'STANDARD';
  }

  hideHUD() { this.hud.classList.add('hidden'); }
  updateDebug(text) { if (!this.debug.classList.contains('hidden')) this.debug.textContent = text; }

  openTuning() {
    this.#renderTuningControls();
    this.tuningOverlay.classList.remove('hidden');
    const scroller = this.tuningOverlay.querySelector('.tuning-scroll');
    if (scroller) scroller.scrollTop = 0;
  }

  closeTuning() { this.tuningOverlay.classList.add('hidden'); }

  #bind() {
    document.getElementById('btn-play').addEventListener('click', () => this.showScreen('select'));
    document.getElementById('btn-settings').addEventListener('click', () => this.showScreen('settings'));
    document.querySelectorAll('[data-back="menu"]').forEach((b) => b.addEventListener('click', () => this.showScreen('menu')));
    document.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => this.setQuality(b.dataset.quality)));
    document.querySelectorAll('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => this.toggleFullscreen()));
    document.querySelectorAll('[data-open-tuning]').forEach((b) => b.addEventListener('click', () => this.openTuning()));
    document.querySelectorAll('[data-close-tuning]').forEach((b) => b.addEventListener('click', () => this.closeTuning()));
    document.getElementById('btn-reset-tuning').addEventListener('click', () => this.#resetTuning());
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

  setQuality(mode) {
    this.graphics = mode === 'hd' ? 'hd' : 'standard';
    localStorage.setItem('zusmoff_graphics', this.graphics);
    this.#syncQuality();
    this.#renderTuningControls();
    this.handlers.quality?.(this.graphics, this.#clone(this.tuning));
    this.updateHUDQuality(this.graphics);
  }

  #syncQuality() {
    document.querySelectorAll('[data-quality]').forEach((b) => b.classList.toggle('active', b.dataset.quality === this.graphics));
    const text = this.graphics === 'hd'
      ? 'HD aktif: resolusi/filter lebih tinggi + sharpening default 50%. Semua nilai masih bisa dituning.'
      : 'STANDARD aktif: rendering lebih ringan, sharpening default OFF, dengan brightness yang lebih kalem.';
    document.getElementById('quality-note').textContent = text;
    document.getElementById('settings-quality-note').textContent = text;
    const label = document.getElementById('tuning-profile-label');
    if (label) label.textContent = this.graphics.toUpperCase();
  }

  #getTuneGroups() {
    const profile = `graphics.profiles.${this.graphics}`;
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
        id: 'world', label: 'LIGHT', title: 'WORLD LIGHTING', subtitle: `Lighting untuk mode ${this.graphics.toUpperCase()}.`,
        controls: [
          ['Exposure', `${profile}.exposure`, 0.65, 1.65, 0.01, ''],
          ['Hemisphere', `${profile}.lighting.hemisphere`, 0.0, 3.0, 0.01, ''],
          ['Ambient', `${profile}.lighting.ambient`, 0.0, 1.5, 0.01, ''],
          ['Sun', `${profile}.lighting.sun`, 0.0, 4.0, 0.01, ''],
          ['Fill Light', `${profile}.lighting.fill`, 0.0, 2.5, 0.01, '']
        ]
      },
      {
        id: 'map', label: 'MAP', title: 'MAP FILTER', subtitle: `Filter Clock Tower untuk ${this.graphics.toUpperCase()}.`,
        controls: FILTER_CONTROLS.map((c) => [c[0], `${profile}.map.${c[1]}`, ...c.slice(2)])
      },
      {
        id: 'charfilter', label: 'NARUTO', title: 'CHARACTER FILTER', subtitle: `Filter Naruto untuk ${this.graphics.toUpperCase()}.`,
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
      root.appendChild(group);
    }

    const label = document.getElementById('tuning-profile-label');
    if (label) label.textContent = this.graphics.toUpperCase();
    this.#syncQuality();
  }

  #makeGroup(title, subtitle, controls) {
    const group = document.createElement('section');
    group.className = 'tune-group';
    group.innerHTML = `<div class="tune-group-head"><b>${title}</b><small>${subtitle}</small></div>`;
    const list = document.createElement('div');
    list.className = 'slider-list';

    for (const [label, path, min, max, step, suffix] of controls) {
      const value = Number(this.#getByPath(this.tuning, path));
      const row = document.createElement('label');
      row.className = 'slider-row';
      const displayValue = suffix === '%' ? `${Math.round(value * 100)}%` : `${this.#format(value, step)}${suffix || ''}`;
      row.innerHTML = `<span class="slider-label">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting-path="${path}"><output>${displayValue}</output>`;
      const input = row.querySelector('input');
      const output = row.querySelector('output');
      input.addEventListener('input', () => {
        const next = Number(input.value);
        this.#setByPath(this.tuning, path, next);
        output.textContent = suffix === '%' ? `${Math.round(next * 100)}%` : `${this.#format(next, step)}${suffix || ''}`;
        this.#saveTuning();
        this.handlers.tuning?.(this.#clone(this.tuning));
        this.updateHUDQuality(this.graphics);
      });
      list.appendChild(row);
    }
    group.appendChild(list);
    return group;
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
      const saved = JSON.parse(localStorage.getItem('zusmoff_tuning_v4') || 'null');
      return this.#deepMerge(this.#clone(DEFAULT_TUNING), saved || {});
    } catch (_) {
      return this.#clone(DEFAULT_TUNING);
    }
  }

  #saveTuning() {
    localStorage.setItem('zusmoff_tuning_v4', JSON.stringify(this.tuning));
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
      el.addEventListener('click', () => { this.selectedMap = m.id; localStorage.setItem('zusmoff_map', m.id); this.#renderCards(); });
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
