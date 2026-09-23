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

  findSpawn(x = 0, z = 0, groundOffset = 0.018, preferredY = null) {
    if (!this.meshes.length) return new THREE.Vector3(x, (preferredY ?? 2) + groundOffset, z);
    const top = this.bounds.max.y + 24;
    this.raycaster.near = 0;
    this.raycaster.far = Math.max(120, this.bounds.max.y - this.bounds.min.y + 80);

    const chooseSurface = (hits) => {
      if (!hits.length) return null;
      if (!Number.isFinite(preferredY)) return hits[0];
      let best = hits[0];
      let bestDelta = Math.abs(best.point.y - preferredY);
      for (let i = 1; i < hits.length; i++) {
        const delta = Math.abs(hits[i].point.y - preferredY);
        if (delta < bestDelta) { best = hits[i]; bestDelta = delta; }
      }
      return best;
    };

    // Exact X/Z is always first priority. preferredY picks the intended floor
    // when several surfaces overlap vertically (ground, balcony, roof, etc.).
    this.raycaster.set(new THREE.Vector3(x, top, z), this.down);
    const direct = chooseSurface(this.raycaster.intersectObjects(this.meshes, false));
    if (direct) return new THREE.Vector3(x, direct.point.y + groundOffset, z);

    const offsets = [3, -3, 8, -8, 16, -16, 28, -28];
    const candidates = [];
    for (const dx of offsets) {
      for (const dz of offsets) {
        this.raycaster.set(new THREE.Vector3(x + dx, top, z + dz), this.down);
        const hit = chooseSurface(this.raycaster.intersectObjects(this.meshes, false));
        if (hit) {
          const verticalPenalty = Number.isFinite(preferredY) ? Math.abs(hit.point.y - preferredY) * 0.2 : 0;
          candidates.push({ x: x + dx, z: z + dz, y: hit.point.y, score: dx * dx + dz * dz + verticalPenalty });
        }
      }
    }
    if (candidates.length) {
      candidates.sort((a, b) => a.score - b.score);
      const best = candidates[0];
      return new THREE.Vector3(best.x, best.y + groundOffset, best.z);
    }
    return new THREE.Vector3(x, (Number.isFinite(preferredY) ? preferredY : this.bounds.max.y + 2) + groundOffset, z);
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
