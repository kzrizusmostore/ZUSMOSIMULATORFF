import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, collisionSystem) {
    this.camera = camera;
    this.collision = collisionSystem;
    this.yaw = 0;
    this.defaultPitch = -0.07;
    this.pitch = this.defaultPitch;
    this.baseDistance = 3.35;
    this.baseHeight = 0.58;
    this.sensitivity = 0.0048;
    this.target = new THREE.Vector3();
    this.smoothedTarget = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.initialized = false;
  }

  reset(characterPosition, characterYaw = 0, context = null) {
    const heading = Number.isFinite(characterYaw) ? characterYaw : 0;
    this.yaw = heading;
    this.pitch = this.defaultPitch;
    const lookHeight = this.#lookHeight(context);
    this.smoothedTarget.copy(characterPosition).add(new THREE.Vector3(0, lookHeight, 0));
    this.initialized = true;
    this.update(0.016, characterPosition, { x: 0, y: 0 }, { ...(context || {}), yaw: heading, cameraActive: false }, true);
  }

  update(dt, characterPosition, cameraDelta, context = null, snap = false) {
    const dragX = Number(cameraDelta?.x) || 0;
    const dragY = Number(cameraDelta?.y) || 0;
    const cameraActive = !!context?.cameraActive;
    const manual = cameraActive || Math.abs(dragX) + Math.abs(dragY) > 0.001;
    const characterYaw = Number.isFinite(context?.yaw) ? context.yaw : this.yaw;

    if (manual) {
      this.yaw -= dragX * this.sensitivity;
      this.pitch -= dragY * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.48, 0.30);
    } else {
      // User requirement: when no camera finger is down, BOTH heading and
      // elevation return to the default behind-the-back view every frame.
      this.yaw = characterYaw;
      this.pitch = this.defaultPitch;
    }

    const lookHeight = this.#lookHeight(context);
    this.target.copy(characterPosition);
    this.target.y += lookHeight;
    if (!this.initialized || snap) this.smoothedTarget.copy(this.target);
    else this.smoothedTarget.lerp(this.target, 1 - Math.exp(-18 * dt));

    const stance = context?.stance || 'standing';
    const speed = Number(context?.speed) || 0;
    const runAmount = THREE.MathUtils.clamp((speed - 3.8) / 1.5, 0, 1);
    let distance = this.baseDistance + runAmount * 0.12;
    let height = this.baseHeight;
    if (stance === 'crouch') { distance -= 0.14; height -= 0.18; }
    if (stance === 'prone') { distance -= 0.22; height -= 0.36; }

    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    this.right.set(this.forward.z, 0, -this.forward.x).normalize();

    // No shoulder offset in auto camera: exact center behind the spine.
    this.desired.copy(this.smoothedTarget)
      .addScaledVector(this.forward, -distance * Math.cos(this.pitch));
    this.desired.y += height + Math.sin(this.pitch) * distance;

    const blocked = this.collision.cameraDistance(this.smoothedTarget, this.desired);
    if (blocked !== null) {
      this.temp.copy(this.desired).sub(this.smoothedTarget).normalize().multiplyScalar(blocked).add(this.smoothedTarget);
      this.desired.copy(this.temp);
    }

    if (snap || !manual) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-24 * dt));
    this.camera.lookAt(this.smoothedTarget);
    this.initialized = true;
  }

  #lookHeight(context) {
    const scale = THREE.MathUtils.clamp(Number(context?.scale) || 0.71, 0.5, 1.6);
    const stance = context?.stance || 'standing';
    const standing = 1.10 * scale;
    if (stance === 'crouch') return standing * 0.63;
    if (stance === 'prone') return Math.max(0.22, standing * 0.25);
    return standing;
  }

  getPlanarBasis(forwardOut, rightOut) {
    forwardOut.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    rightOut.set(forwardOut.z, 0, -forwardOut.x).normalize();
  }
}
