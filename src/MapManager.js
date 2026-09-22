import * as THREE from 'three';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.current = null;
    this.bounds = new THREE.Box3();
  }

  install(definition, gltf) {
    this.dispose();
    const root = gltf.scene;
    root.name = `Map:${definition.id}`;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.receiveShadow = true;
      obj.castShadow = false;
      obj.frustumCulled = true;
    });

    root.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);

    this.scene.add(root);
    this.current = root;
    this.bounds.copy(box);
    return root;
  }

  dispose() {
    if (!this.current) return;
    this.scene.remove(this.current);
    const textures = new Set();
    const materials = new Set();
    const geometries = new Set();
    this.current.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry) geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.filter(Boolean).forEach((mat) => {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      });
    });
    geometries.forEach((x) => x.dispose());
    materials.forEach((x) => x.dispose());
    textures.forEach((x) => x.dispose());
    this.current = null;
    this.bounds.makeEmpty();
  }
}
