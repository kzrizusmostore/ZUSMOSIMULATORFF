import * as THREE from 'three';

export class CharacterController {
  constructor(characterGroup, input, cameraRig, collision, animation, spawnPoint) {
    this.group = characterGroup;
    this.input = input;
    this.cameraRig = cameraRig;
    this.collision = collision;
    this.animation = animation;
    this.spawnPoint = spawnPoint.clone();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.verticalVelocity = 0;
    this.gravity = -20.5;
    this.grounded = true;
    this.wasGrounded = true;
    this.landTimer = 0;
    this.speed = 0;
    this.state = 'IDLE';
    this.stance = 'standing';
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

    let maxSpeed = 2.45;
    if (this.stance === 'prone') maxSpeed = 0.68;
    else if (this.stance === 'crouch') maxSpeed = 1.35;
    else if (this.input.run) maxSpeed = 5.75;
    maxSpeed *= mag;

    const desiredVelocity = this.desired.clone().multiplyScalar(maxSpeed);
    const accel = desiredVelocity.lengthSq() > this.velocity.lengthSq() ? 11.5 : 15.5;
    this.velocity.lerp(desiredVelocity, 1 - Math.exp(-accel * dt));
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.desired.lengthSq() > 0.001 && mag > 0.08) {
      const yaw = Math.atan2(this.desired.x, this.desired.z);
      this.targetQuaternion.setFromAxisAngle(this.up, yaw);
      this.group.quaternion.slerp(this.targetQuaternion, 1 - Math.exp(-12 * dt));
    }

    const colliderHeight = this.stance === 'prone' ? 0.48 : this.stance === 'crouch' ? 1.08 : 1.68;
    this.delta.set(this.velocity.x * dt, 0, this.velocity.z * dt);
    this.delta.copy(this.collision.resolveHorizontal(this.group.position, this.delta, colliderHeight));
    this.group.position.add(this.delta);

    if (this.input.consumeJump() && this.grounded && this.stance !== 'prone') {
      this.input.crouch = false;
      this.stance = 'standing';
      this.verticalVelocity = 6.8;
      this.grounded = false;
    }

    if (!this.grounded) this.verticalVelocity += this.gravity * dt;
    this.group.position.y += this.verticalVelocity * dt;

    const ground = this.collision.groundHeight(this.group.position.x, this.group.position.y, this.group.position.z, 7.5);
    if (ground !== null) {
      const gap = this.group.position.y - ground;
      if (this.grounded) {
        if (gap < 0.45 && gap > -0.55) {
          this.group.position.y = ground + 0.035;
          this.verticalVelocity = 0;
        } else if (gap >= 0.45) {
          this.grounded = false;
        }
      } else if (this.verticalVelocity <= 0 && gap <= 0.12 && gap > -0.8) {
        this.group.position.y = ground + 0.035;
        this.verticalVelocity = 0;
        this.grounded = true;
        if (!this.wasGrounded) this.landTimer = 0.18;
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
    else if (this.stance === 'prone') this.state = this.speed > 0.08 ? 'PRONE_CRAWL' : 'PRONE_IDLE';
    else if (this.stance === 'crouch') this.state = this.speed > 0.08 ? 'CROUCH_WALK' : 'CROUCH_IDLE';
    else if (this.speed < 0.08 || inputMagnitude < 0.06) this.state = 'IDLE';
    else if (this.input.run && this.speed > 3.15) this.state = 'RUN';
    else this.state = 'WALK';
  }

  respawn() {
    this.group.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
  }
}
