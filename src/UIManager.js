export class UIManager {
  constructor(maps, characters, defaults) {
    this.maps = maps;
    this.characters = characters;
    this.defaults = defaults;
    this.selectedMap = this.#valid(localStorage.getItem('zusmoff_map'), maps) || defaults.map;
    this.selectedCharacter = this.#valid(localStorage.getItem('zusmoff_character'), characters) || defaults.character;
    this.graphics = ['standard', 'hd'].includes(localStorage.getItem('zusmoff_graphics')) ? localStorage.getItem('zusmoff_graphics') : defaults.graphics;
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
    this.#renderCards();
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
    return { mapId: this.selectedMap, characterId: this.selectedCharacter, graphics: this.graphics };
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
    document.getElementById('hud-quality').textContent = graphics === 'hd' ? 'HD • SHARP 50%' : 'STANDARD';
    this.debug.classList.toggle('hidden', !debugEnabled);
    this.#syncFullscreenButtons();
  }

  hideHUD() { this.hud.classList.add('hidden'); }

  updateDebug(text) { if (!this.debug.classList.contains('hidden')) this.debug.textContent = text; }

  #bind() {
    document.getElementById('btn-play').addEventListener('click', () => this.showScreen('select'));
    document.getElementById('btn-settings').addEventListener('click', () => this.showScreen('settings'));
    document.querySelectorAll('[data-back="menu"]').forEach((b) => b.addEventListener('click', () => this.showScreen('menu')));
    document.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => this.setQuality(b.dataset.quality)));
    document.querySelectorAll('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => this.toggleFullscreen()));
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
    this.handlers.quality?.(this.graphics);
  }

  #syncQuality() {
    document.querySelectorAll('[data-quality]').forEach((b) => b.classList.toggle('active', b.dataset.quality === this.graphics));
    const text = this.graphics === 'hd'
      ? 'HD: brighter balanced render + anisotropic filtering + sharpening strength 50%.'
      : 'Standard: brighter performance preset, sharpening OFF.';
    document.getElementById('quality-note').textContent = text;
    document.getElementById('settings-quality-note').textContent = text;
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
}
