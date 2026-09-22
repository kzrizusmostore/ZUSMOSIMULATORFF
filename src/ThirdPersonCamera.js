import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, collisionSystem) {
    this.camera = camera;
    this.collision = collisionSystem;

    // yaw = the actual rendered camera heading.
    // controlYaw = the heading used by the movement controller. Keeping these
    // separate prevents a permanent turning loop when the camera auto-locks
    // behind a character that is moving sideways.
    this.yaw = 0;
    this.controlYaw = 0;
    this.pitch = -0.075;

    this.baseDistance = 3.55;
    this.baseHeight = 0.64;
    this.sensitivity = 0.0048;

    // V12: camera should feel locked to the back as soon as free-look is not
    // being touched. This is intentionally much faster than V11.
    this.followSpeed = 30.0;
    this.recenterEpsilon = THREE.MathUtils.degToRad(0.35);

    this.target = new THREE.Vector3();
    this.smoothedTarget = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.initialized = false;
    this.wasManual = false;
  }

  reset(characterPosition, characterYaw = 0, context = null) {
    const heading = Number.isFinite(characterYaw) ? characterYaw : 0;
    this.yaw = heading;
    this.controlYaw = heading;
    this.pitch = -0.075;
    this.wasManual = false;

    const lookHeight = this.#lookHeight(context);
    this.smoothedTarget.copy(characterPosition).add(new THREE.Vector3(0, lookHeight, 0));
    this.initialized = true;
    this.update(
      0.016,
      characterPosition,
      { x: 0, y: 0 },
      { ...(context || {}), yaw: heading, cameraActive: false, moving: false },
      true
    );
  }

  update(dt, characterPosition, cameraDelta, context = null, snap = false) {
    const dragX = Number(cameraDelta?.x) || 0;
    const dragY = Number(cameraDelta?.y) || 0;
    const cameraActive = !!context?.cameraActive;
    const hasDrag = Math.abs(dragX) + Math.abs(dragY) > 0.001;
    const manual = cameraActive || hasDrag;

    const characterYaw = Number.isFinite(context?.yaw) ? context.yaw : this.yaw;
    const moving = !!context?.moving;
    const moveX = Number(context?.moveX) || 0;

    if (manual) {
      // Free-look exists ONLY while the camera touch is active. While manually
      // looking around, movement remains camera-relative to the current view.
      this.yaw -= dragX * this.sensitivity;
      this.pitch -= dragY * this.sensitivity;
      this.controlYaw = this.yaw;
    } else {
      // V12 core fix: no idle delay and no speed/grounded condition. Whenever
      // the user is not touching the camera, the view immediately returns to
      // and continuously follows the character's back.
      // Hard lock: when free-look is not being touched, camera heading IS the
      // character heading. Character rotation itself is already smoothed by the
      // controller, so another yaw easing layer only creates the unwanted side
      // view seen in the user's recording.
      this.yaw = characterYaw;

      // When idle, the movement basis follows the locked-behind camera. While
      // moving laterally we keep the basis stable so a held left/right stick
      // does not create an endless camera/character steering spiral. Mostly
      // forward input is safe to keep synchronized continuously.
      if (!moving || Math.abs(moveX) < 0.22) {
        this.controlYaw = this.yaw;
      }
    }
    this.wasManual = manual;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.52, 0.38);

    const lookHeight = this.#lookHeight(context);
    this.target.copy(characterPosition);
    this.target.y += lookHeight;
    if (!this.initialized || snap) this.smoothedTarget.copy(this.target);
    else this.smoothedTarget.lerp(this.target, 1 - Math.exp(-15 * dt));

    const stance = context?.stance || 'standing';
    const speed = Number(context?.speed) || 0;
    const runAmount = THREE.MathUtils.clamp((speed - 3.8) / 1.7, 0, 1);
    let distance = this.baseDistance + runAmount * 0.16;
    let height = this.baseHeight;
    if (stance === 'crouch') { distance -= 0.18; height -= 0.16; }
    if (stance === 'prone') { distance -= 0.34; height -= 0.33; }

    // yaw always represents character/camera forward. Camera is placed on the
    // exact opposite side of that vector, i.e. behind the character.
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    this.right.set(this.forward.z, 0, -this.forward.x).normalize();
    const shoulder = stance === 'prone' ? 0.08 : 0.16;

    this.desired.copy(this.smoothedTarget)
      .addScaledVector(this.forward, -distance * Math.cos(this.pitch))
      .addScaledVector(this.right, shoulder);
    this.desired.y += height + Math.sin(this.pitch) * distance;

    const blocked = this.collision.cameraDistance(this.smoothedTarget, this.desired);
    if (blocked !== null) {
      this.temp.copy(this.desired)
        .sub(this.smoothedTarget)
        .normalize()
        .multiplyScalar(blocked)
        .add(this.smoothedTarget);
      this.desired.copy(this.temp);
    }

    // In auto-follow the camera is placed directly on the behind-character
    // rig. Because characterYaw is already smoothly rotated by the controller,
    // this stays smooth without letting the camera drift to the side. During
    // manual free-look we keep a little positional smoothing for comfort.
    if (snap || !manual) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-22 * dt));
    this.camera.lookAt(this.smoothedTarget);
    this.initialized = true;
  }

  #angleDelta(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  #lookHeight(context) {
    const scale = THREE.MathUtils.clamp(Number(context?.scale) || 0.71, 0.5, 1.6);
    const stance = context?.stance || 'standing';
    const standing = 1.12 * scale;
    if (stance === 'crouch') return standing * 0.72;
    if (stance === 'prone') return Math.max(0.30, standing * 0.36);
    return standing;
  }

  getPlanarBasis(forwardOut, rightOut) {
    // Do NOT derive movement from the rendered camera every frame while the
    // camera is auto-rotating behind the character; that produces circular
    // steering. controlYaw is synchronized when appropriate in update().
    forwardOut.set(Math.sin(this.controlYaw), 0, Math.cos(this.controlYaw)).normalize();
    rightOut.set(forwardOut.z, 0, -forwardOut.x).normalize();
  }
}
