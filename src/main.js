import { MAPS, CHARACTERS, DEFAULTS } from './config/registry.js';
import { UIManager } from './UIManager.js';

window.__ZUSMO_BOOTED = true;

try {
  const ui = new UIManager(MAPS, CHARACTERS, DEFAULTS);
  const canvas = document.getElementById('game-canvas');
  let game = null;
  let gamePromise = null;

  const ensureGame = async () => {
    if (game) return game;
    if (!gamePromise) {
      gamePromise = import('./Game.js')
        .then(({ Game }) => {
          game = new Game(canvas, ui, MAPS, CHARACTERS);
          const selection = ui.getSelection();
          game.setQuality(selection.graphics, selection.tuning);
          return game;
        })
        .catch((error) => {
          gamePromise = null;
          throw error;
        });
    }
    return gamePromise;
  };

  ui.setHandlers({
    start: async (selection) => {
      try {
        if (!game) {
          ui.showLoading(0);
          ui.updateLoading(2, 'Menyiapkan mesin 3D...', 0, 0);
        }
        const instance = await ensureGame();
        return await instance.start(selection);
      } catch (error) {
        console.error('[ZUSMO FF] Gagal menyiapkan mesin 3D', error);
        ui.showError(`Gagal menyiapkan mesin 3D: ${error?.message || error}`);
        return false;
      }
    },
    exit: () => game?.exitToMenu(),
    quality: (mode, tuning) => game?.setQuality(mode, tuning),
    tuning: (tuning) => game?.setTuning(tuning),
    character: (characterId, tuning) => game?.changeCharacter(characterId, tuning) ?? false,
    captureSpawn: () => game?.captureSpawn() ?? null,
    teleportSpawn: (mapId, spawnConfig) => game?.teleportToSpawn(mapId, spawnConfig) ?? false
  });

  // Menu/pengaturan siap tanpa mengunduh Three.js, renderer, peta, atau karakter.
  // Semua modul 3D baru dimuat setelah pemain menekan MULAI.
  ui.bootReady();
  console.info('[ZUSMO FF] Menu siap • mesin 3D menunggu pemilihan pemain');
} catch (error) {
  console.error('[ZUSMO FF] Kesalahan awal', error);
  const boot = document.getElementById('engine-boot');
  const text = document.getElementById('engine-boot-text');
  boot?.classList.remove('hidden');
  if (text) text.textContent = `Gagal memulai: ${error?.message || error}`;
}
