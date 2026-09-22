import { MAPS, CHARACTERS, DEFAULTS } from './config/registry.js';
import { UIManager } from './UIManager.js';
import { Game } from './Game.js';

window.__ZUSMO_BOOTED = true;

try {
  const ui = new UIManager(MAPS, CHARACTERS, DEFAULTS);
  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas, ui, MAPS, CHARACTERS);
  ui.setHandlers({
    start: (selection) => game.start(selection),
    exit: () => game.exitToMenu(),
    quality: (mode) => game.setQuality(mode)
  });
  ui.bootReady();
  console.info('[ZUSMO FF] Engine ready');
} catch (error) {
  console.error('[ZUSMO FF] Boot error', error);
  const boot = document.getElementById('engine-boot');
  const text = document.getElementById('engine-boot-text');
  boot?.classList.remove('hidden');
  if (text) text.textContent = `Boot failed: ${error?.message || error}`;
}
