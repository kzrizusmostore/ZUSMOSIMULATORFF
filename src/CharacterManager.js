import * as THREE from 'three';

export class CharacterManager {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.posePivot = null;
    this.visual = null;
    this.bones = new Map();
    this.skeletons = [];
    this.animations = [];
    this.baseVisualY = 0;
    this.visualScale = 1;
    this.footOffset = 0;
  }

  install(definition, gltf) {
    this.dispose();
    const heading = new THREE.Group();
    heading.name = `Character:${definition.id}`;
    const posePivot = new THREE.Group();
    heading.add(posePivot);
    const visual = gltf.scene;
    posePivot.add(visual);

    const skeletons = [];
    const boneSet = new Set();
    visual.traverse((obj) => {
      if (obj.isSkinnedMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.skeleton && !skeletons.includes(obj.skeleton)) skeletons.push(obj.skeleton);
        obj.skeleton?.bones?.forEach((b) => boneSet.add(b));
      } else if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj.isBone) boneSet.add(obj);
    });

    visual.updateMatrixWorld(true);
    const points = [];
    const temp = new THREE.Vector3();
    boneSet.forEach((b) => points.push(b.getWorldPosition(temp.clone())));
    if (points.length) {
      let minY = Infinity, maxY = -Infinity;
      for (const p of points) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      const rigHeight = Math.max(0.2, maxY - minY);
      const scale = THREE.MathUtils.clamp((definition.targetHeight || 1.72) / rigHeight, 0.25, 6);
      visual.scale.multiplyScalar(scale);
      visual.updateMatrixWorld(true);

      // Ground the rendered mesh itself, not only the lowest bone.
      // This removes the common visible gap between ankle/toe bones and shoe soles.
      const meshBounds = new THREE.Box3().setFromObject(visual);
      if (!meshBounds.isEmpty() && Number.isFinite(meshBounds.min.y)) {
        visual.position.y -= meshBounds.min.y;
      }
    }

    visual.updateMatrixWorld(true);
    this.scene.add(heading);
    this.group = heading;
    this.posePivot = posePivot;
    this.visual = visual;
    this.skeletons = skeletons;
    this.animations = gltf.animations || [];
    this.baseVisualY = visual.position.y;
    this.bones.clear();
    boneSet.forEach((bone) => this.bones.set(bone.name, bone));

    return {
      root: heading,
      posePivot,
      visual,
      bones: this.bones,
      boneCount: boneSet.size,
      skeletonCount: skeletons.length,
      animations: this.animations
    };
  }

  spawn(position) {
    this.group?.position.copy(position);
    if (this.group) this.group.rotation.set(0, 0, 0);
  }

  setVisualTuning(tuning = null) {
    if (!this.posePivot) return;
    const character = tuning?.character || tuning || {};
    const scale = THREE.MathUtils.clamp(Number(character.scale) || 1, 0.5, 1.6);
    const footOffset = THREE.MathUtils.clamp(Number(character.footOffset) || 0, -0.5, 0.5);
    this.visualScale = scale;
    this.footOffset = footOffset;
    this.posePivot.scale.setScalar(scale);
    this.posePivot.position.y = footOffset;
    this.posePivot.updateMatrixWorld(true);
  }

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    const textures = new Set(), materials = new Set(), geometries = new Set();
    this.group.traverse((obj) => {
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
    this.group = this.posePivot = this.visual = null;
    this.bones.clear();
    this.skeletons = [];
    this.animations = [];
    this.visualScale = 1;
    this.footOffset = 0;
  }
}
