import * as THREE from 'three';

export class CollisionSystem {
  constructor() {
    this.map = null;
    this.meshes = [];
    this.bounds = new THREE.Box3();
    this.raycaster = new THREE.Raycaster();
    this.down = new THREE.Vector3(0, -1, 0);
  }

  setMap(root, bounds) {
    this.map = root;
    this.meshes = [];
    root?.traverse((obj) => { if (obj.isMesh && obj.visible) this.meshes.push(obj); });
    this.bounds.copy(bounds);
  }

  findSpawn(x = 0, z = 0) {
    if (!this.meshes.length) return new THREE.Vector3(x, 2, z);
    const top = this.bounds.max.y + 20;
    const offsets = [0, 18, -18, 36, -36];
    const candidates = [];
    this.raycaster.near = 0;
    this.raycaster.far = Math.max(100, this.bounds.max.y - this.bounds.min.y + 60);
    for (const dx of offsets) {
      for (const dz of offsets) {
        this.raycaster.set(new THREE.Vector3(x + dx, top, z + dz), this.down);
        const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
        if (hit) candidates.push({ x: x + dx, z: z + dz, y: hit.point.y });
      }
    }
    if (candidates.length) {
      candidates.sort((a, b) => a.y - b.y || (Math.abs(a.x - x) + Math.abs(a.z - z)) - (Math.abs(b.x - x) + Math.abs(b.z - z)));
      const best = candidates[0];
      return new THREE.Vector3(best.x, best.y + 0.035, best.z);
    }
    return new THREE.Vector3(0, this.bounds.max.y + 2, 0);
  }

  groundHeight(x, currentY, z, maxDistance = 6) {
    if (!this.meshes.length) return null;
    const origin = new THREE.Vector3(x, currentY + 2.2, z);
    this.raycaster.set(origin, this.down);
    this.raycaster.near = 0;
    this.raycaster.far = maxDistance + 2.2;
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    return hit ? hit.point.y : null;
  }

  resolveHorizontal(position, delta, colliderHeight = 1.7) {
    const distance = delta.length();
    if (distance < 0.0001 || !this.meshes.length) return delta;
    const dir = delta.clone().normalize();
    const origin = position.clone();
    origin.y += Math.max(0.28, colliderHeight * 0.48);
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0.08;
    this.raycaster.far = distance + 0.38;
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    if (hit && hit.distance <= distance + 0.34) return new THREE.Vector3();
    return delta;
  }

  cameraDistance(origin, desiredPosition) {
    if (!this.meshes.length) return null;
    const dir = desiredPosition.clone().sub(origin);
    const distance = dir.length();
    if (distance < 0.05) return null;
    dir.normalize();
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0.12;
    this.raycaster.far = distance;
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    return hit ? Math.max(0.45, hit.distance - 0.22) : null;
  }
}
