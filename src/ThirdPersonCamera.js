import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, collisionSystem) {
    this.camera = camera;
    this.collision = collisionSystem;
    this.yaw = 0;
    this.pitch = -0.075;
    this.baseDistance = 3.55;
    this.baseHeight = 0.64;
    this.sensitivity = 0.0048;
    this.followDelay = 0.62;
    this.followSpeed = 8.5;
    this.manualTimer = 0;
    this.target = new THREE.Vector3();
    this.smoothedTarget = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.initialized = false;
  }

  reset(characterPosition, characterYaw = 0, context = null) {
    this.yaw = Number.isFinite(characterYaw) ? characterYaw : 0;
    this.pitch = -0.075;
    this.manualTimer = 0;
    const lookHeight = this.#lookHeight(context);
    this.smoothedTarget.copy(characterPosition).add(new THREE.Vector3(0, lookHeight, 0));
    this.initialized = true;
    this.update(0.016, characterPosition, { x: 0, y: 0 }, { ...(context || {}), yaw: this.yaw }, true);
  }

  update(dt, characterPosition, cameraDelta, context = null, snap = false) {
    const dragX = Number(cameraDelta?.x) || 0;
    const dragY = Number(cameraDelta?.y) || 0;
    const manuallyMoved = Math.abs(dragX) + Math.abs(dragY) > 0.01;

    if (manuallyMoved) {
      this.yaw -= dragX * this.sensitivity;
      this.pitch -= dragY * this.sensitivity;
      this.manualTimer = this.followDelay;
    } else {
      this.manualTimer = Math.max(0, this.manualTimer - dt);
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.52, 0.38);

    const characterYaw = Number.isFinite(context?.yaw) ? context.yaw : this.yaw;
    const grounded = context?.grounded !== false;
    const speed = Number(context?.speed) || 0;
    // Free-Fire-like behavior requested by the user: after manual free-look ends,
    // camera returns behind the character while moving. While airborne the
    // camera stays locked instead of being dragged by mid-air turning.
    if (!snap && this.manualTimer <= 0 && grounded && speed > 0.10) {
      const diff = Math.atan2(Math.sin(characterYaw - this.yaw), Math.cos(characterYaw - this.yaw));
      this.yaw += diff * (1 - Math.exp(-this.followSpeed * dt));
    }

    const lookHeight = this.#lookHeight(context);
    this.target.copy(characterPosition);
    this.target.y += lookHeight;
    if (!this.initialized || snap) this.smoothedTarget.copy(this.target);
    else this.smoothedTarget.lerp(this.target, 1 - Math.exp(-11 * dt));

    const stance = context?.stance || 'standing';
    const runAmount = THREE.MathUtils.clamp((speed - 3.8) / 1.7, 0, 1);
    let distance = this.baseDistance + runAmount * 0.18;
    let height = this.baseHeight;
    if (stance === 'crouch') { distance -= 0.18; height -= 0.16; }
    if (stance === 'prone') { distance -= 0.34; height -= 0.33; }

    // yaw is the CHARACTER FORWARD direction. Camera goes behind it, not in
    // front of it. This fixes the old default that could show the character's face.
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    this.right.set(this.forward.z, 0, -this.forward.x).normalize();
    const shoulder = stance === 'prone' ? 0.10 : 0.20;

    this.desired.copy(this.smoothedTarget)
      .addScaledVector(this.forward, -distance * Math.cos(this.pitch))
      .addScaledVector(this.right, shoulder);
    this.desired.y += height + Math.sin(this.pitch) * distance;

    const blocked = this.collision.cameraDistance(this.smoothedTarget, this.desired);
    if (blocked !== null) {
      this.temp.copy(this.desired).sub(this.smoothedTarget).normalize().multiplyScalar(blocked).add(this.smoothedTarget);
      this.desired.copy(this.temp);
    }

    if (snap) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-13 * dt));
    this.camera.lookAt(this.smoothedTarget);
    this.initialized = true;
  }

  #lookHeight(context) {
    const scale = THREE.MathUtils.clamp(Number(context?.scale) || 0.71, 0.5, 1.6);
    const stance = context?.stance || 'standing';
    // Character was normalized to ~1.72 m before the visual scale is applied.
    const standing = 1.12 * scale;
    if (stance === 'crouch') return standing * 0.72;
    if (stance === 'prone') return Math.max(0.30, standing * 0.36);
    return standing;
  }

  getPlanarBasis(forwardOut, rightOut) {
    this.camera.getWorldDirection(forwardOut);
    forwardOut.y = 0;
    if (forwardOut.lengthSq() < 0.0001) forwardOut.set(0, 0, 1);
    forwardOut.normalize();
    rightOut.crossVectors(this.camera.up, forwardOut).normalize();
  }
}
