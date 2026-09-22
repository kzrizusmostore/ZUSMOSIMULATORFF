import * as THREE from 'three';

const DEFAULT_MOVEMENT = {
  walkSpeed: 4.2,
  runSpeed: 6.8,
  crouchSpeed: 1.8,
  proneSpeed: 0.9,
  acceleration: 14.0,
  deceleration: 18.0,
  turnSpeed: 14.0,
  jumpPower: 7.25,
  gravity: 22.5
};

const DEFAULT_GROUNDING = {
  groundOffset: 0.018,
  snapDistance: 0.62,
  landingDistance: 0.20,
  probeDistance: 7.5
};

export class CharacterController {
  constructor(characterGroup, input, cameraRig, collision, animation, spawnPoint, tuning = null, spawnYaw = 0) {
    this.group = characterGroup;
    this.input = input;
    this.cameraRig = cameraRig;
    this.collision = collision;
    this.animation = animation;
    this.spawnPoint = spawnPoint.clone();
    this.spawnYaw = spawnYaw;
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.desiredVelocity = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.wasGrounded = true;
    this.landTimer = 0;
    this.speed = 0;
    this.state = 'IDLE';
    this.stance = 'standing';
    this.settings = { ...DEFAULT_MOVEMENT };
    this.grounding = { ...DEFAULT_GROUNDING };
    this.characterScale = 1;
    this.setTuning(tuning);
  }

  setTuning(tuning) {
    const next = tuning?.movement || tuning || {};
    this.settings = { ...DEFAULT_MOVEMENT, ...next };
    this.grounding = { ...DEFAULT_GROUNDING, ...(tuning?.grounding || {}) };
    const rawScale = tuning?.character?.scale;
    this.characterScale = THREE.MathUtils.clamp(Number.isFinite(rawScale) ? rawScale : 1, 0.5, 1.6);
  }

  setSpawn(position, yaw = this.spawnYaw, teleport = false) {
    this.spawnPoint.copy(position);
    this.spawnYaw = Number.isFinite(yaw) ? yaw : 0;
    if (teleport) this.respawn();
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.wasGrounded = this.grounded;
    this.landTimer = Math.max(0, this.landTimer - dt);

    if (this.input.prone) this.stance = 'prone';
    else if (this.input.crouch) this.stance = 'crouch';
    else this.stance = 'standing';

    this.cameraRig.getPlanarBasis(this.forward, this.right);
    const mag = Math.min(1, Math.hypot(this.input.moveX, this.input.moveY));
    this.desired.set(0, 0, 0)
      .addScaledVector(this.forward, this.input.moveY)
      .addScaledVector(this.right, this.input.moveX);
    if (this.desired.lengthSq() > 0.0001) this.desired.normalize();

    let maxSpeed = this.settings.walkSpeed;
    if (this.stance === 'prone') maxSpeed = this.settings.proneSpeed;
    else if (this.stance === 'crouch') maxSpeed = this.settings.crouchSpeed;
    else if (this.input.run) maxSpeed = this.settings.runSpeed;
    maxSpeed *= mag;

    this.desiredVelocity.copy(this.desired).multiplyScalar(maxSpeed);
    const accelerating = this.desiredVelocity.lengthSq() > this.velocity.lengthSq();
    const responsiveness = accelerating ? this.settings.acceleration : this.settings.deceleration;
    this.velocity.lerp(this.desiredVelocity, 1 - Math.exp(-responsiveness * dt));
    // When the stick is released, kill tiny residual velocity so IDLE starts
    // decisively instead of hovering between WALK and IDLE.
    if (mag < 0.035 && this.velocity.lengthSq() < 0.18) this.velocity.set(0, 0, 0);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.desired.lengthSq() > 0.001 && mag > 0.08) {
      const yaw = Math.atan2(this.desired.x, this.desired.z);
      this.targetQuaternion.setFromAxisAngle(this.up, yaw);
      this.group.quaternion.slerp(this.targetQuaternion, 1 - Math.exp(-this.settings.turnSpeed * dt));
    }

    const colliderHeight = (this.stance === 'prone' ? 0.48 : this.stance === 'crouch' ? 1.08 : 1.68) * this.characterScale;
    this.delta.set(this.velocity.x * dt, 0, this.velocity.z * dt);
    this.delta.copy(this.collision.resolveHorizontal(this.group.position, this.delta, colliderHeight));
    this.group.position.add(this.delta);

    if (this.input.consumeJump() && this.grounded && this.stance !== 'prone') {
      this.input.crouch = false;
      this.stance = 'standing';
      this.verticalVelocity = this.settings.jumpPower;
      this.grounded = false;
    }

    if (!this.grounded) this.verticalVelocity -= this.settings.gravity * dt;
    this.group.position.y += this.verticalVelocity * dt;

    const probeDistance = THREE.MathUtils.clamp(this.grounding.probeDistance, 2.5, 16);
    const ground = this.collision.groundHeight(this.group.position.x, this.group.position.y, this.group.position.z, probeDistance);
    if (ground !== null) {
      const targetGroundY = ground + this.grounding.groundOffset;
      const gap = this.group.position.y - targetGroundY;
      const snapDistance = THREE.MathUtils.clamp(this.grounding.snapDistance, 0.05, 1.8);
      const landingDistance = THREE.MathUtils.clamp(this.grounding.landingDistance, 0.03, 0.8);
      if (this.grounded) {
        if (gap < snapDistance && gap > -Math.max(0.75, snapDistance * 1.35)) {
          this.group.position.y = targetGroundY;
          this.verticalVelocity = 0;
        } else if (gap >= snapDistance) {
          this.grounded = false;
        }
      } else if (this.verticalVelocity <= 0 && gap <= landingDistance && gap > -Math.max(0.9, snapDistance * 1.5)) {
        this.group.position.y = targetGroundY;
        this.verticalVelocity = 0;
        this.grounded = true;
        if (!this.wasGrounded) this.landTimer = 0.20;
      }
    } else {
      this.grounded = false;
    }

    if (this.group.position.y < this.collision.bounds.min.y - 18) this.respawn();

    this.#selectAnimationState(mag);
    this.animation.setState(this.state, this.speed);
    this.animation.update(dt);
  }

  #selectAnimationState(inputMagnitude) {
    if (!this.grounded) this.state = this.verticalVelocity > 0.35 ? 'JUMP' : 'FALL';
    else if (this.landTimer > 0) this.state = 'LAND';
    else if (this.stance === 'prone') this.state = this.speed > 0.10 ? 'PRONE_CRAWL' : 'PRONE_IDLE';
    else if (this.stance === 'crouch') this.state = this.speed > 0.10 ? 'CROUCH_WALK' : 'CROUCH_IDLE';
    else if (this.speed < 0.16 || inputMagnitude < 0.045) this.state = 'IDLE';
    else if (this.input.run && this.speed > Math.max(this.settings.walkSpeed * 1.12, 4.5)) this.state = 'RUN';
    else this.state = 'WALK';
  }

  respawn() {
    this.group.position.copy(this.spawnPoint);
    this.group.quaternion.setFromAxisAngle(this.up, this.spawnYaw);
    this.velocity.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.landTimer = 0;
  }
}
