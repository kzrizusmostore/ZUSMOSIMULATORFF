export const MAPS = [
  {
    id: 'clock-tower',
    name: 'Clock Tower',
    shortName: 'CT',
    asset: './assets/maps/free_fire_clocktower_3d_model_by_ffxn.glb',
    bytes: 21806576,
    available: true,
    bundled: true,
    spawn: { x: 5.27, y: 24.56, z: -8.21, yaw: 36, dropHeight: 60 },
    spawnRange: { xMin: -220, xMax: 220, yMin: -5, yMax: 140, zMin: -220, zMax: 220 },
    environment: { fogNear: 180, fogFar: 520 }
  },
  {
    id: 'dapur-mbg-kopdes',
    name: 'Dapur MBG-KOPDES',
    shortName: 'MBG',
    asset: './assets/maps/dapur_mbg_kopdes.glb',
    bytes: 6623792,
    available: true,
    bundled: true,
    spawn: { x: 1.95, y: 0.15, z: -10.38, yaw: 0, dropHeight: 18 },
    spawnRange: { xMin: -12, xMax: 16, yMin: -2, yMax: 20, zMin: -35, zMax: 14 },
    environment: { fogNear: 80, fogFar: 220 }
  },
  {
    id: 'old-rampage',
    name: 'Old Rampage',
    shortName: 'OR',
    asset: './assets/maps/free_fire_old_rampage_lobby_3d_model.glb',
    bytes: 0,
    available: false,
    bundled: false,
    spawn: { x: 0, y: 0, z: 0, yaw: 0, dropHeight: 45 },
    spawnRange: { xMin: -180, xMax: 180, yMin: -10, yMax: 120, zMin: -180, zMax: 180 },
    environment: { fogNear: 140, fogFar: 460 }
  }
];

export const CHARACTERS = [
  {
    id: 'naruto',
    name: 'Naruto',
    code: 'N',
    asset: './assets/characters/naruto_free_fire.glb',
    bytes: 860760,
    available: true,
    bundled: true,
    targetHeight: 1.72,
    rigged: true
  },
  {
    id: 'rouk',
    name: 'Rouk',
    code: 'R',
    asset: './assets/characters/free_fire_rouk_ff_3d_model.glb',
    bytes: 1124240,
    available: true,
    bundled: true,
    targetHeight: 1.72,
    rigged: false
  },
  {
    id: 'rias-sexy',
    name: 'Rias Sexy',
    code: 'RS',
    asset: './assets/characters/rias_sexy.glb',
    bytes: 23098636,
    available: true,
    bundled: true,
    targetHeight: 1.72,
    rigged: false
  },
  {
    id: 'amazing-spiderman',
    name: 'The Amazing Spiderman',
    code: 'SP',
    asset: './assets/characters/the_amazing_spiderman.glb',
    bytes: 810764,
    available: true,
    bundled: true,
    targetHeight: 1.72,
    rigged: false
  }
];

export const DEFAULTS = {
  map: 'clock-tower',
  character: 'naruto',
  graphics: 'hd'
};
