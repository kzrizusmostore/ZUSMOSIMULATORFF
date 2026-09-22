export const MAPS = [
  {
    id: 'clock-tower',
    name: 'Clock Tower',
    shortName: 'CT',
    asset: './assets/maps/free_fire_clocktower_3d_model_by_ffxn.glb',
    bytes: 21806576,
    available: true,
    spawn: { x: 0, z: 0, dropHeight: 60 },
    environment: { fogNear: 110, fogFar: 290 }
  }
];

export const CHARACTERS = [
  {
    id: 'naruto',
    name: 'Naruto',
    asset: './assets/characters/naruto_free_fire.glb',
    bytes: 860760,
    available: true,
    targetHeight: 1.72
  }
];

export const DEFAULTS = {
  map: 'clock-tower',
  character: 'naruto',
  graphics: 'standard'
};
