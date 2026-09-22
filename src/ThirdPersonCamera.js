import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, collisionSystem) {
    this.camera = camera;
    this.collision = collisionSystem;
    this.yaw = 0;
    this.pitch = -0.08;
    this.distance = 4.1;
    this.height = 1.25;
    this.lookHeight = 1.05;
    this.sensitivity = 0.0052;
    this.target = new THREE.Vector3();
    this.smoothedTarget = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.initialized = false;
  }

  reset(characterPosition) {
    this.yaw = 0;
    this.pitch = -0.08;
    this.smoothedTarget.copy(characterPosition).add(new THREE.Vector3(0, this.lookHeight, 0));
    this.initialized = true;
    this.update(0.016, characterPosition, { x: 0, y: 0 }, true);
  }

  update(dt, characterPosition, cameraDelta, snap = false) {
    this.yaw -= cameraDelta.x * this.sensitivity;
    this.pitch -= cameraDelta.y * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.60, 0.48);

    this.target.copy(characterPosition);
    this.target.y += this.lookHeight;
    if (!this.initialized || snap) this.smoothedTarget.copy(this.target);
    else this.smoothedTarget.lerp(this.target, 1 - Math.exp(-10 * dt));

    const cp = Math.cos(this.pitch);
    this.desired.set(
      Math.sin(this.yaw) * this.distance * cp,
      this.height + Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * this.distance * cp
    ).add(this.smoothedTarget);

    const blocked = this.collision.cameraDistance(this.smoothedTarget, this.desired);
    if (blocked !== null) {
      this.temp.copy(this.desired).sub(this.smoothedTarget).normalize().multiplyScalar(blocked).add(this.smoothedTarget);
      this.desired.copy(this.temp);
    }

    if (snap) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-12 * dt));
    this.camera.lookAt(this.smoothedTarget);
    this.initialized = true;
  }

  getPlanarBasis(forwardOut, rightOut) {
    this.camera.getWorldDirection(forwardOut);
    forwardOut.y = 0;
    if (forwardOut.lengthSq() < 0.0001) forwardOut.set(0, 0, -1);
    forwardOut.normalize();
    rightOut.crossVectors(forwardOut, this.camera.up).normalize();
  }
}
