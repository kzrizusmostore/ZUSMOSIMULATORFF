import * as THREE from 'three';

const BONE_KEYS = {
  hips: 'bone_Hips_01',
  spine: 'bone_Spine_011',
  chest: 'bone_Spine1_012',
  neck: 'bone_Neck_030',
  head: 'bone_Head_031',
  lClav: 'bone_LeftClav_015',
  rClav: 'bone_RightClav_043',
  lUpperLeg: 'bone_LeftLegUpper_03',
  lLeg: 'bone_LeftLeg_04',
  lAnkle: 'bone_LeftAnkle_05',
  lToe: 'bone_LeftToe_06',
  rUpperLeg: 'bone_RightLegUpper_07',
  rLeg: 'bone_RightLeg_08',
  rAnkle: 'bone_RightAnkle_09',
  rToe: 'bone_RightToe_010',
  lArm: 'bone_LeftArm_016',
  lForeArm: 'bone_LeftForeArm_017',
  lHand: 'bone_LeftHand_018',
  rArm: 'bone_RightArm_044',
  rForeArm: 'bone_RightForeArm_045',
  rHand: 'bone_RightHand_046'
};

// V11 compact Free-Fire-like locomotion preset. The amplitudes are deliberately
// restrained: V10 pushed the hands/feet too far forward/back on this Naruto rig.
// These values are the reset/default values used by UIManager as well.
const DEFAULT_ANIMATION = {
  intensity: 1.00,
  walkStride: 0.86,
  runStride: 0.90,
  armSwing: 0.78,
  kneeLift: 0.92,
  bodyBob: 0.56,
  hipSway: 0.58,
  cadence: 0.98,
  blend: 1.18,
  lean: 0.72,
  idleArmDown: 0.52,
  idleElbowBend: 0.18,
  idleArmTwist: 0.025,
  idleShoulderRelax: 0.04,
  idleHandRelax: 0.08,
  idleBreathing: 0.58,
  idleHeadMotion: 0.42
};

const DEFAULT_MOTION = {
  walkSpeed: 4.00,
  runSpeed: 5.15,
  crouchSpeed: 1.80,
  proneSpeed: 0.90
};

// One full left-leg cycle. The right leg samples +0.5 cycle. Values are local
// offsets around the model's original bind pose, not absolute joint angles.
const WALK = {
  hip:    [ 0.105,0.075,0.010,-0.065,-0.115,-0.070,0.010,0.085 ],
  knee:   [ 0.035,0.075,0.055,0.045,0.085,0.205,0.300,0.160 ],
  ankle:  [ 0.018,0.008,-0.014,-0.038,-0.055,0.010,0.038,0.030 ],
  toe:    [ 0.00, 0.00, 0.008,0.030,0.062,0.030,0.006,0.00 ],
  pelvisY:[-0.001,0.003,0.006,0.003,-0.001,0.003,0.006,0.003],
  pelvisX:[ 0.003,0.002,0.000,-0.002,-0.003,-0.002,0.000,0.002]
};

const RUN = {
  hip:    [ 0.185,0.125,-0.010,-0.145,-0.215,-0.105,0.040,0.175 ],
  knee:   [ 0.075,0.120,0.065,0.055,0.125,0.330,0.500,0.265 ],
  ankle:  [ 0.025,0.010,-0.025,-0.060,-0.082,0.008,0.055,0.043 ],
  toe:    [ 0.00, 0.008,0.022,0.055,0.095,0.035,0.008,0.00 ],
  pelvisY:[-0.003,0.005,0.009,0.003,-0.003,0.005,0.009,0.003],
  pelvisX:[ 0.004,0.002,0.000,-0.002,-0.004,-0.002,0.000,0.002]
};

export class AnimationController {
  constructor(characterInfo, baseVisualY = 0, tuning = null) {
    this.info = characterInfo;
    this.visual = characterInfo.visual;
    this.posePivot = characterInfo.posePivot;
    this.baseVisualY = baseVisualY;
    this.time = 0;
    this.stateTime = 0;
    this.phase = 0;
    this.state = 'IDLE';
    this.prevState = 'IDLE';
    this.speed = 0;
    this.settings = { ...DEFAULT_ANIMATION };
    this.motion = { ...DEFAULT_MOTION };
    this.rest = new Map();
    this.current = new Map();
    this.target = new Map();
    this.currentPos = new Map();
    this.targetPos = new Map();
    this.tmpQ = new THREE.Quaternion();
    this.tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this.visualYOffset = 0;
    this.visualBob = 0;
    this.visualTilt = 0;
    this.visualRoll = 0;
    this.landPulse = 0;

    for (const [key, name] of Object.entries(BONE_KEYS)) {
      const bone = characterInfo.bones.get(name);
      if (!bone) continue;
      this.rest.set(key, {
        bone,
        quaternion: bone.quaternion.clone(),
        position: bone.position.clone()
      });
      this.current.set(key, new THREE.Vector3());
      this.target.set(key, new THREE.Vector3());
      this.currentPos.set(key, new THREE.Vector3());
      this.targetPos.set(key, new THREE.Vector3());
    }
    this.setTuning(tuning);
  }

  setTuning(tuning) {
    const anim = tuning?.animation || tuning || {};
    const movement = tuning?.movement || {};
    this.settings = { ...DEFAULT_ANIMATION, ...anim };
    this.motion = { ...DEFAULT_MOTION, ...movement };
  }

  setState(state, speed = 0) {
    if (this.state !== state) {
      this.prevState = this.state;
      this.stateTime = 0;
      if (state === 'LAND') this.landPulse = 1;
      if ((state === 'WALK' || state === 'RUN') && !(this.prevState === 'WALK' || this.prevState === 'RUN')) this.phase = 0.02;
    }
    this.state = state;
    this.speed = speed;
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    this.landPulse = Math.max(0, this.landPulse - dt * 6.2);
    for (const v of this.target.values()) v.set(0, 0, 0);
    for (const v of this.targetPos.values()) v.set(0, 0, 0);

    let yOffset = 0;
    let bob = 0;
    let tiltX = 0;
    let rollZ = 0;
    const state = this.state;

    if (state === 'IDLE') this.#idle();
    else if (state === 'WALK') ({ bob, rollZ, tiltX } = this.#locomotion(false, dt));
    else if (state === 'RUN') ({ bob, rollZ, tiltX } = this.#locomotion(true, dt));
    else if (state === 'JUMP') ({ yOffset, tiltX } = this.#jump(false));
    else if (state === 'FALL') ({ yOffset, tiltX } = this.#jump(true));
    else if (state === 'LAND') ({ yOffset, tiltX } = this.#land());
    else if (state === 'CROUCH_IDLE') { yOffset = -0.105; ({ tiltX } = this.#crouch(false, dt)); }
    else if (state === 'CROUCH_WALK') { yOffset = -0.105; ({ bob, rollZ, tiltX } = this.#crouch(true, dt)); }
    else if (state === 'PRONE_IDLE') { yOffset = -0.046; tiltX = 1.48; this.#prone(false, dt); }
    else if (state === 'PRONE_CRAWL') { yOffset = -0.046; tiltX = 1.48; ({ bob, rollZ } = this.#prone(true, dt)); }

    const b = THREE.MathUtils.clamp(this.settings.blend, 0.5, 2.0);
    const baseBlend = state === 'RUN' ? 17 : state === 'WALK' ? 16 : state.startsWith('PRONE') ? 13 : state.startsWith('CROUCH') ? 15 : state === 'LAND' ? 19 : 16;
    const blend = baseBlend * b;

    for (const [key, rest] of this.rest) {
      const c = this.current.get(key);
      const t = this.target.get(key);
      c.x = THREE.MathUtils.damp(c.x, t.x, blend, dt);
      c.y = THREE.MathUtils.damp(c.y, t.y, blend, dt);
      c.z = THREE.MathUtils.damp(c.z, t.z, blend, dt);
      this.tmpEuler.set(c.x, c.y, c.z);
      this.tmpQ.setFromEuler(this.tmpEuler);
      rest.bone.quaternion.copy(rest.quaternion).multiply(this.tmpQ);

      const cp = this.currentPos.get(key);
      const tp = this.targetPos.get(key);
      cp.x = THREE.MathUtils.damp(cp.x, tp.x, blend * 0.9, dt);
      cp.y = THREE.MathUtils.damp(cp.y, tp.y, blend * 0.9, dt);
      cp.z = THREE.MathUtils.damp(cp.z, tp.z, blend * 0.9, dt);
      rest.bone.position.copy(rest.position).add(cp);
    }

    this.visualYOffset = THREE.MathUtils.damp(this.visualYOffset, yOffset, 14, dt);
    this.visualBob = THREE.MathUtils.damp(this.visualBob, bob, 18 * b, dt);
    this.visualTilt = THREE.MathUtils.damp(this.visualTilt, tiltX, 14 * b, dt);
    this.visualRoll = THREE.MathUtils.damp(this.visualRoll, rollZ, 14 * b, dt);

    if (this.visual) this.visual.position.y = this.baseVisualY + this.visualYOffset + this.visualBob;
    if (this.posePivot) {
      this.posePivot.rotation.x = this.visualTilt;
      this.posePivot.rotation.z = this.visualRoll;
    }
  }

  #v(key) { return this.target.get(key); }
  #p(key) { return this.targetPos.get(key); }
  #set(key, x = 0, y = 0, z = 0) { this.#v(key)?.set(x, y, z); }
  #setPos(key, x = 0, y = 0, z = 0) { this.#p(key)?.set(x, y, z); }

  #ease01(x) {
    x = THREE.MathUtils.clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  }

  #cycle(samples, u) {
    const n = samples.length;
    u = ((u % 1) + 1) % 1;
    const x = u * n;
    const i = Math.floor(x);
    const t = x - i;
    const p0 = samples[(i - 1 + n) % n];
    const p1 = samples[i % n];
    const p2 = samples[(i + 1) % n];
    const p3 = samples[(i + 2) % n];
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  #idleArms(strength = 1, swing = 0) {
    const S = this.settings;
    const I = S.intensity;
    // The Naruto rig's upper-arm local Y axis is the shoulder-down axis
    // (left +Y, right -Y). Older versions used local Z, which pushed the
    // hands backward/forward and left the arms floating like a broken T-pose.
    const down = THREE.MathUtils.clamp(S.idleArmDown, 0.28, 0.82) * strength;
    const elbow = THREE.MathUtils.clamp(S.idleElbowBend, 0.08, 0.38) * Math.max(0.76, strength);
    const twist = S.idleArmTwist;
    const shoulder = S.idleShoulderRelax * strength;
    const hand = S.idleHandRelax;
    const breatheSwing = swing * 0.35;
    this.#set('lClav', 0, shoulder * 0.025 * I, 0.006 * I);
    this.#set('rClav', 0, -shoulder * 0.025 * I, -0.006 * I);
    this.#set('lArm', 0.006 * I, (down + breatheSwing) * I, -twist * I);
    this.#set('rArm', -0.006 * I, (-down - breatheSwing) * I, twist * I);
    // Opposite local-Y signs make the mirrored forearms bend down/inward.
    this.#set('lForeArm', 0.004 * I, elbow * 0.36 * I, -elbow * 0.18 * I);
    this.#set('rForeArm', -0.004 * I, -elbow * 0.36 * I, elbow * 0.18 * I);
    this.#set('lHand', 0.003 * I, hand * 0.10 * I, -hand * 0.20 * I);
    this.#set('rHand', -0.003 * I, -hand * 0.10 * I, hand * 0.20 * I);
  }

  #idle() {
    const S = this.settings;
    const I = S.intensity;
    const breathe = Math.sin(this.time * 1.55);
    const slow = Math.sin(this.time * 0.72 + 0.9);
    const micro = Math.sin(this.time * 0.42);

    this.#setPos('hips', micro * 0.0016 * I, breathe * 0.0018 * I * S.idleBreathing, 0);
    this.#set('hips', 0, micro * 0.006 * I, slow * 0.004 * I);
    this.#set('spine', breathe * 0.007 * I * S.idleBreathing, micro * 0.006 * I, 0.012 * I);
    this.#set('chest', -breathe * 0.005 * I * S.idleBreathing, -micro * 0.008 * I, -0.006 * I);
    this.#set('neck', slow * 0.002 * I * S.idleHeadMotion, micro * 0.006 * I * S.idleHeadMotion, 0);
    this.#set('head', slow * 0.003 * I * S.idleHeadMotion, -micro * 0.009 * I * S.idleHeadMotion, micro * 0.004 * I * S.idleHeadMotion);
    this.#idleArms(1, breathe * 0.005 * S.idleBreathing);
    this.#set('lUpperLeg', 0, 0, 0.008 * I);
    this.#set('rUpperLeg', 0, 0, -0.008 * I);
  }

  #locomotion(runRequested, dt) {
    const S = this.settings;
    const I = S.intensity;
    const walkBase = Math.max(0.5, this.motion.walkSpeed);
    const runBase = Math.max(walkBase + 0.1, this.motion.runSpeed);
    const runBlend = runRequested ? this.#ease01((this.speed - walkBase * 0.94) / Math.max(0.28, runBase - walkBase * 0.94)) : 0;
    const base = THREE.MathUtils.lerp(walkBase, runBase, runBlend);
    const speedNorm = THREE.MathUtils.clamp(this.speed / base, 0.32, 1.10);
    const cycleHz = THREE.MathUtils.lerp(1.48, 1.90, runBlend) * THREE.MathUtils.lerp(0.84, 1.03, speedNorm) * S.cadence;
    this.phase = (this.phase + dt * cycleHz) % 1;

    const uL = this.phase;
    const uR = (this.phase + 0.5) % 1;
    const stride = THREE.MathUtils.lerp(S.walkStride, S.runStride, runBlend) * I;
    const kneeTune = S.kneeLift * I;
    const armTune = S.armSwing * I;
    const mix = (a, b, u) => this.#cycle(a, u) * (1 - runBlend) + this.#cycle(b, u) * runBlend;
    const hipL = mix(WALK.hip, RUN.hip, uL);
    const hipR = mix(WALK.hip, RUN.hip, uR);
    const kneeL = mix(WALK.knee, RUN.knee, uL);
    const kneeR = mix(WALK.knee, RUN.knee, uR);
    const ankleL = mix(WALK.ankle, RUN.ankle, uL);
    const ankleR = mix(WALK.ankle, RUN.ankle, uR);
    const toeL = mix(WALK.toe, RUN.toe, uL);
    const toeR = mix(WALK.toe, RUN.toe, uR);
    const pelvisY = mix(WALK.pelvisY, RUN.pelvisY, uL) * S.bodyBob * I;
    const pelvisX = mix(WALK.pelvisX, RUN.pelvisX, uL) * S.hipSway * I;

    const phase = this.phase * Math.PI * 2;
    const step = Math.sin(phase);
    const doubleStep = Math.sin(phase * 2);
    const hipYaw = -step * THREE.MathUtils.lerp(0.018, 0.030, runBlend) * S.hipSway * I;
    const hipRoll = Math.cos(phase) * THREE.MathUtils.lerp(0.010, 0.016, runBlend) * S.hipSway * I;
    const torsoYaw = -hipYaw * 1.25;
    const lean = THREE.MathUtils.lerp(-0.018, -0.080, runBlend) * S.lean * I;

    this.#setPos('hips', pelvisX, pelvisY, 0);
    this.#set('hips', doubleStep * 0.003 * I, hipYaw, hipRoll);
    this.#set('spine', doubleStep * 0.006 * I, torsoYaw * 0.42, lean * 0.56);
    this.#set('chest', -doubleStep * 0.004 * I, torsoYaw, lean * 0.44);
    this.#set('neck', 0, -torsoYaw * 0.22, -lean * 0.08);
    this.#set('head', -doubleStep * 0.002 * I, -torsoYaw * 0.12, -hipRoll * 0.22);

    this.#set('lUpperLeg', 0, -hipYaw * 0.08, hipL * stride);
    this.#set('rUpperLeg', 0, -hipYaw * 0.08, hipR * stride);
    this.#set('lLeg', 0, 0, -kneeL * kneeTune);
    this.#set('rLeg', 0, 0, -kneeR * kneeTune);
    this.#set('lAnkle', 0, 0, ankleL * stride);
    this.#set('rAnkle', 0, 0, ankleR * stride);
    this.#set('lToe', 0, 0, -toeL * I);
    this.#set('rToe', 0, 0, -toeR * I);

    // Free-Fire-like compact arm action for this rig. Keep the shoulder-down
    // angle on local Y and put the forward/back swing on local Z. This prevents
    // the giant up/down flapping visible in V10-V12.
    const armWave = Math.sin(phase);
    const armAmp = THREE.MathUtils.lerp(0.050, 0.090, runBlend) * armTune * I;
    const down = THREE.MathUtils.lerp(0.52, 0.46, runBlend) * I;
    const elbow = THREE.MathUtils.lerp(0.16, 0.27, runBlend) * I;
    const elbowPulse = (0.5 + 0.5 * Math.sin(phase + Math.PI * 0.5)) * THREE.MathUtils.lerp(0.012, 0.035, runBlend) * I;

    this.#set('lClav', 0, 0.006 * I, -torsoYaw * 0.10);
    this.#set('rClav', 0, -0.006 * I, -torsoYaw * 0.10);
    this.#set('lArm', 0.004 * I, down, (-S.idleArmTwist + armWave * armAmp));
    this.#set('rArm', -0.004 * I, -down, (S.idleArmTwist - armWave * armAmp));
    this.#set('lForeArm', 0, (elbow + elbowPulse) * 0.30, -(elbow + elbowPulse) * 0.16);
    this.#set('rForeArm', 0, -(elbow + (0.04 * runBlend * I - elbowPulse)) * 0.30, (elbow + (0.04 * runBlend * I - elbowPulse)) * 0.16);
    this.#set('lHand', 0, S.idleHandRelax * 0.05 * I, -S.idleHandRelax * 0.12 * I);
    this.#set('rHand', 0, -S.idleHandRelax * 0.05 * I, S.idleHandRelax * 0.12 * I);

    return {
      bob: pelvisY * 0.50,
      rollZ: -hipRoll * 0.30,
      tiltX: THREE.MathUtils.lerp(0, 0.022, runBlend) * S.lean * I
    };
  }

  #jump(falling) {
    const S = this.settings;
    const I = S.intensity;
    const down = 0.46 * I;
    if (!falling) {
      const t = this.#ease01(Math.min(1, this.stateTime / 0.16));
      // Short mobile-shooter hop: small knee tuck, torso stays controlled and
      // arms remain close to the body rather than throwing forward/back.
      this.#setPos('hips', 0, THREE.MathUtils.lerp(-0.004, 0.007, t) * I, 0);
      this.#set('spine', 0, 0, THREE.MathUtils.lerp(-0.040, -0.012, t) * I);
      this.#set('chest', 0, 0, THREE.MathUtils.lerp(-0.018, -0.006, t) * I);
      this.#set('lUpperLeg', 0, 0, THREE.MathUtils.lerp(0.17, 0.12, t) * I);
      this.#set('rUpperLeg', 0, 0, THREE.MathUtils.lerp(0.14, 0.10, t) * I);
      this.#set('lLeg', 0, 0, THREE.MathUtils.lerp(-0.34, -0.26, t) * I);
      this.#set('rLeg', 0, 0, THREE.MathUtils.lerp(-0.31, -0.24, t) * I);
      this.#set('lAnkle', 0, 0, 0.032 * I);
      this.#set('rAnkle', 0, 0, 0.026 * I);
      this.#set('lArm', 0, down, -0.055 * I);
      this.#set('rArm', 0, -down, 0.055 * I);
      this.#set('lForeArm', 0, 0.060 * I, -0.035 * I);
      this.#set('rForeArm', 0, -0.060 * I, 0.035 * I);
      return { yOffset: 0, tiltX: -0.007 * I };
    }

    const t = this.#ease01(Math.min(1, this.stateTime / 0.20));
    this.#set('hips', 0, 0, 0.008 * I);
    this.#set('spine', 0, 0, THREE.MathUtils.lerp(-0.006, 0.022, t) * I);
    this.#set('chest', 0, 0, THREE.MathUtils.lerp(-0.003, 0.010, t) * I);
    this.#set('lUpperLeg', 0, 0, THREE.MathUtils.lerp(0.10, 0.15, t) * I);
    this.#set('rUpperLeg', 0, 0, THREE.MathUtils.lerp(0.08, 0.14, t) * I);
    this.#set('lLeg', 0, 0, THREE.MathUtils.lerp(-0.24, -0.31, t) * I);
    this.#set('rLeg', 0, 0, THREE.MathUtils.lerp(-0.22, -0.29, t) * I);
    this.#set('lArm', 0, down, -0.035 * I);
    this.#set('rArm', 0, -down, 0.035 * I);
    this.#set('lForeArm', 0, 0.052 * I, -0.030 * I);
    this.#set('rForeArm', 0, -0.052 * I, 0.030 * I);
    return { yOffset: 0, tiltX: 0.004 * t * I };
  }

  #land() {
    const S = this.settings;
    const I = S.intensity;
    const p = THREE.MathUtils.clamp(this.landPulse, 0, 1);
    const squash = p * p;
    this.#setPos('hips', 0, -0.020 * squash * I, 0);
    this.#set('hips', 0, 0, 0.014 * squash * I);
    this.#set('lUpperLeg', 0, 0, 0.28 * squash * I);
    this.#set('rUpperLeg', 0, 0, 0.28 * squash * I);
    this.#set('lLeg', 0, 0, -0.58 * squash * I);
    this.#set('rLeg', 0, 0, -0.58 * squash * I);
    this.#set('spine', 0, 0, 0.10 * squash * I);
    this.#set('chest', 0, 0, 0.05 * squash * I);
    const down = 0.50 * I;
    this.#set('lArm', 0, down, (-0.025 - 0.018 * squash) * I);
    this.#set('rArm', 0, -down, (0.025 + 0.018 * squash) * I);
    this.#set('lForeArm', 0, (0.070 + 0.018 * squash) * I, -0.040 * I);
    this.#set('rForeArm', 0, (-0.070 - 0.018 * squash) * I, 0.040 * I);
    return { yOffset: -0.030 * squash * I, tiltX: 0.012 * squash * I };
  }

  #crouch(moving, dt) {
    const S = this.settings;
    const I = S.intensity;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.3, this.motion.crouchSpeed), 0, 1.10);
    if (moving) this.phase = (this.phase + dt * (1.25 + speedNorm * 0.30) * S.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const step = moving ? Math.sin(p) : 0;
    const step2 = moving ? Math.sin(p * 2) : 0;

    this.#setPos('hips', moving ? Math.cos(p) * 0.003 * S.hipSway : 0, 0, 0);
    this.#set('hips', 0, step2 * 0.008 * I, 0.030 * I);
    this.#set('lUpperLeg', 0, 0, (0.46 + step * 0.075) * I);
    this.#set('rUpperLeg', 0, 0, (0.46 - step * 0.075) * I);
    this.#set('lLeg', 0, 0, (-0.80 - Math.max(0, -step) * 0.08) * I);
    this.#set('rLeg', 0, 0, (-0.80 - Math.max(0, step) * 0.08) * I);
    this.#set('lAnkle', 0, 0, moving ? Math.cos(p) * 0.035 * I : 0.018 * I);
    this.#set('rAnkle', 0, 0, moving ? -Math.cos(p) * 0.035 * I : 0.018 * I);
    this.#set('spine', 0, -step * 0.010 * I, -0.145 * I);
    this.#set('chest', 0, step * 0.014 * I, -0.040 * I);
    this.#set('head', 0, -step * 0.006 * I, 0.012 * I);

    const down = 0.48 * I;
    const armSwing = moving ? step * 0.050 * S.armSwing * I : 0;
    this.#set('lArm', 0, down, -0.025 * I + armSwing);
    this.#set('rArm', 0, -down, 0.025 * I - armSwing);
    this.#set('lForeArm', 0, 0.075 * I, -0.040 * I);
    this.#set('rForeArm', 0, -0.075 * I, 0.040 * I);

    return {
      bob: moving ? (0.5 - 0.5 * Math.cos(p * 2)) * 0.0045 * S.bodyBob * I : 0,
      rollZ: moving ? -step * 0.003 * S.hipSway * I : 0,
      tiltX: 0.008 * I
    };
  }

  #prone(moving, dt) {
    const S = this.settings;
    const I = S.intensity;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.2, this.motion.proneSpeed), 0, 1.10);
    if (moving) this.phase = (this.phase + dt * (0.92 + speedNorm * 0.24) * S.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const s = moving ? Math.sin(p) : Math.sin(this.time * 1.12) * 0.014;
    const c = moving ? Math.cos(p) : 0;

    // Low, compact prone silhouette: elbows support the upper body and limbs
    // crawl with small cross-body motions instead of large swings.
    this.#set('spine', 0, -s * 0.010 * I, -0.055 * I);
    this.#set('chest', 0, s * 0.015 * I, 0.10 * I);
    this.#set('neck', 0, -s * 0.008 * I, -0.075 * I);
    this.#set('head', -0.03 * I, -s * 0.010 * I, -0.13 * I);
    this.#set('lClav', 0, 0.010 * I, -0.010 * I);
    this.#set('rClav', 0, -0.010 * I, 0.010 * I);
    // Elbows stay under/near the shoulders; crawl alternates a short reach.
    this.#set('lArm', 0, (0.82 + s * 0.06) * I, (-0.16 + s * 0.035) * I);
    this.#set('rArm', 0, (-0.82 - s * 0.06) * I, (0.16 - s * 0.035) * I);
    this.#set('lForeArm', 0, (0.24 + Math.max(0, c) * 0.04) * I, -0.12 * I);
    this.#set('rForeArm', 0, (-0.24 - Math.max(0, -c) * 0.04) * I, 0.12 * I);
    this.#set('lUpperLeg', 0, 0, (moving ? s * 0.075 : 0.008) * I);
    this.#set('rUpperLeg', 0, 0, (moving ? -s * 0.075 : -0.008) * I);
    this.#set('lLeg', 0, 0, (-0.12 - Math.max(0, -s) * 0.08) * I);
    this.#set('rLeg', 0, 0, (-0.12 - Math.max(0, s) * 0.08) * I);
    this.#set('lAnkle', 0, 0, -s * 0.025 * I);
    this.#set('rAnkle', 0, 0, s * 0.025 * I);

    return moving ? {
      bob: Math.abs(s) * 0.004 * S.bodyBob * I,
      rollZ: -s * 0.003 * S.hipSway * I
    } : { bob: 0, rollZ: 0 };
  }
}
