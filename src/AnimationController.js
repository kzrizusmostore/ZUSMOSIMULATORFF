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

// V10 deliberately starts from a fresh animation preset. Old V8/V9 animation
// sliders are not imported because values such as idleArmDown=0 recreate the
// source GLB T-pose. Only movement speeds + character size are migrated by UI.
const DEFAULT_ANIMATION = {
  intensity: 1.00,
  walkStride: 1.00,
  runStride: 1.00,
  armSwing: 1.00,
  kneeLift: 1.00,
  bodyBob: 1.00,
  hipSway: 1.00,
  cadence: 1.00,
  blend: 1.15,
  lean: 1.00,
  idleArmDown: 1.04,
  idleElbowBend: 0.34,
  idleArmTwist: 0.07,
  idleShoulderRelax: 0.11,
  idleHandRelax: 0.13,
  idleBreathing: 0.75,
  idleHeadMotion: 0.65
};

const DEFAULT_MOTION = {
  walkSpeed: 4.00,
  runSpeed: 5.15,
  crouchSpeed: 1.80,
  proneSpeed: 0.90
};

const WALK = {
  hip:   [ 0.34, 0.22, 0.02,-0.24,-0.36,-0.20, 0.06, 0.28 ],
  knee:  [ 0.10, 0.20, 0.12, 0.08, 0.16, 0.52, 0.74, 0.38 ],
  ankle: [ 0.05, 0.02,-0.04,-0.12,-0.19, 0.04, 0.13, 0.10 ],
  toe:   [ 0.00, 0.00, 0.02, 0.10, 0.20, 0.09, 0.02, 0.00 ],
  pelvisY:[-0.004,0.010,0.020,0.010,-0.004,0.010,0.020,0.010],
  pelvisX:[ 0.010,0.006,0.000,-0.006,-0.010,-0.006,0.000,0.006 ]
};

const RUN = {
  hip:   [ 0.54, 0.30,-0.10,-0.52,-0.62,-0.22, 0.22, 0.52 ],
  knee:  [ 0.20, 0.28, 0.12, 0.10, 0.28, 0.84, 1.16, 0.68 ],
  ankle: [ 0.06, 0.02,-0.08,-0.20,-0.26, 0.02, 0.18, 0.12 ],
  toe:   [ 0.00, 0.02, 0.08, 0.20, 0.28, 0.10, 0.02, 0.00 ],
  pelvisY:[-0.012,0.014,0.032,0.010,-0.012,0.014,0.032,0.010],
  pelvisX:[ 0.012,0.007,0.000,-0.007,-0.012,-0.007,0.000,0.007 ]
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
      if ((state === 'WALK' || state === 'RUN') && !(this.prevState === 'WALK' || this.prevState === 'RUN')) {
        // Start near a planted-foot pose instead of an arbitrary sine zero.
        this.phase = 0.02;
      }
    }
    this.state = state;
    this.speed = speed;
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    this.landPulse = Math.max(0, this.landPulse - dt * 5.6);
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
    else if (state === 'CROUCH_IDLE') { yOffset = -0.13; this.#crouch(false, dt); }
    else if (state === 'CROUCH_WALK') { yOffset = -0.13; ({ bob, rollZ, tiltX } = this.#crouch(true, dt)); }
    else if (state === 'PRONE_IDLE') { yOffset = -0.055; tiltX = 1.42; this.#prone(false, dt); }
    else if (state === 'PRONE_CRAWL') { yOffset = -0.055; tiltX = 1.42; ({ bob, rollZ } = this.#prone(true, dt)); }

    const b = THREE.MathUtils.clamp(this.settings.blend, 0.45, 2.0);
    const baseBlend = state === 'RUN' ? 18 : state === 'WALK' ? 16 : state.startsWith('PRONE') ? 12 : state.startsWith('CROUCH') ? 14 : state === 'LAND' ? 18 : 15;
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
      cp.x = THREE.MathUtils.damp(cp.x, tp.x, blend * 0.85, dt);
      cp.y = THREE.MathUtils.damp(cp.y, tp.y, blend * 0.85, dt);
      cp.z = THREE.MathUtils.damp(cp.z, tp.z, blend * 0.85, dt);
      rest.bone.position.copy(rest.position).add(cp);
    }

    this.visualYOffset = THREE.MathUtils.damp(this.visualYOffset, yOffset, 13, dt);
    this.visualBob = THREE.MathUtils.damp(this.visualBob, bob, 20 * b, dt);
    this.visualTilt = THREE.MathUtils.damp(this.visualTilt, tiltX, 12 * b, dt);
    this.visualRoll = THREE.MathUtils.damp(this.visualRoll, rollZ, 12 * b, dt);

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
    const down = Math.max(0.62, S.idleArmDown) * strength;
    const elbow = Math.max(0.22, S.idleElbowBend) * Math.max(0.72, strength);
    const twist = S.idleArmTwist;
    const shoulder = S.idleShoulderRelax * strength;
    const hand = S.idleHandRelax;
    this.#set('lClav', 0, 0, (0.018 + shoulder * 0.14) * I);
    this.#set('rClav', 0, 0, (-0.018 - shoulder * 0.14) * I);
    this.#set('lArm', 0.018 * I, -twist * I, (down + swing) * I);
    this.#set('rArm', -0.018 * I, twist * I, (-down - swing) * I);
    this.#set('lForeArm', 0.012 * I, 0.014 * I, -elbow * I);
    this.#set('rForeArm', -0.012 * I, -0.014 * I, -elbow * I);
    this.#set('lHand', 0.010 * I, hand * 0.24 * I, -hand * I);
    this.#set('rHand', -0.010 * I, -hand * 0.24 * I, -hand * I);
  }

  #idle() {
    const S = this.settings;
    const I = S.intensity;
    const breathe = Math.sin(this.time * 1.65);
    const breathe2 = Math.sin(this.time * 0.83 + 0.9);
    const micro = Math.sin(this.time * 0.47);

    this.#setPos('hips', micro * 0.0025 * I, breathe * 0.0024 * I * S.idleBreathing, 0);
    this.#set('hips', 0, micro * 0.010 * I, breathe2 * 0.006 * I);
    this.#set('spine', breathe * 0.010 * I * S.idleBreathing, micro * 0.009 * I, 0.020 * I);
    this.#set('chest', -breathe * 0.008 * I * S.idleBreathing, -micro * 0.012 * I, -0.010 * I);
    this.#set('neck', breathe2 * 0.003 * I * S.idleHeadMotion, micro * 0.009 * I * S.idleHeadMotion, 0);
    this.#set('head', breathe2 * 0.005 * I * S.idleHeadMotion, -micro * 0.014 * I * S.idleHeadMotion, micro * 0.006 * I * S.idleHeadMotion);
    this.#idleArms(1, breathe * 0.010 * S.idleBreathing);
    this.#set('lUpperLeg', 0, 0, 0.012 * I);
    this.#set('rUpperLeg', 0, 0, -0.012 * I);
  }

  #locomotion(runRequested, dt) {
    const S = this.settings;
    const I = S.intensity;
    const walkBase = Math.max(0.5, this.motion.walkSpeed);
    const runBase = Math.max(walkBase + 0.1, this.motion.runSpeed);
    const runBlend = runRequested ? this.#ease01((this.speed - walkBase * 0.88) / Math.max(0.35, runBase - walkBase * 0.88)) : 0;
    const table = runBlend > 0.5 ? RUN : WALK;
    const base = THREE.MathUtils.lerp(walkBase, runBase, runBlend);
    const speedNorm = THREE.MathUtils.clamp(this.speed / base, 0.35, 1.16);
    const cycleHz = THREE.MathUtils.lerp(1.62, 2.08, runBlend) * THREE.MathUtils.lerp(0.80, 1.05, speedNorm) * S.cadence;
    this.phase = (this.phase + dt * cycleHz) % 1;

    const uL = this.phase;
    const uR = (this.phase + 0.5) % 1;
    const stride = THREE.MathUtils.lerp(S.walkStride, S.runStride, runBlend) * I;
    const kneeTune = S.kneeLift * I;
    const armTune = S.armSwing * I;
    const hipL = this.#cycle(WALK.hip, uL) * (1 - runBlend) + this.#cycle(RUN.hip, uL) * runBlend;
    const hipR = this.#cycle(WALK.hip, uR) * (1 - runBlend) + this.#cycle(RUN.hip, uR) * runBlend;
    const kneeL = this.#cycle(WALK.knee, uL) * (1 - runBlend) + this.#cycle(RUN.knee, uL) * runBlend;
    const kneeR = this.#cycle(WALK.knee, uR) * (1 - runBlend) + this.#cycle(RUN.knee, uR) * runBlend;
    const ankleL = this.#cycle(WALK.ankle, uL) * (1 - runBlend) + this.#cycle(RUN.ankle, uL) * runBlend;
    const ankleR = this.#cycle(WALK.ankle, uR) * (1 - runBlend) + this.#cycle(RUN.ankle, uR) * runBlend;
    const toeL = this.#cycle(WALK.toe, uL) * (1 - runBlend) + this.#cycle(RUN.toe, uL) * runBlend;
    const toeR = this.#cycle(WALK.toe, uR) * (1 - runBlend) + this.#cycle(RUN.toe, uR) * runBlend;
    const pelvisY = (this.#cycle(WALK.pelvisY, uL) * (1 - runBlend) + this.#cycle(RUN.pelvisY, uL) * runBlend) * S.bodyBob * I;
    const pelvisX = (this.#cycle(WALK.pelvisX, uL) * (1 - runBlend) + this.#cycle(RUN.pelvisX, uL) * runBlend) * S.hipSway * I;

    const phase = this.phase * Math.PI * 2;
    const legCounter = Math.sin(phase);
    const doubleStep = Math.sin(phase * 2);
    const hipYaw = -legCounter * THREE.MathUtils.lerp(0.032, 0.052, runBlend) * S.hipSway * I;
    const hipRoll = Math.cos(phase) * THREE.MathUtils.lerp(0.016, 0.025, runBlend) * S.hipSway * I;
    const torsoYaw = -hipYaw * 1.45;
    const lean = THREE.MathUtils.lerp(-0.035, -0.155, runBlend) * S.lean * I;

    this.#setPos('hips', pelvisX, pelvisY, 0);
    this.#set('hips', doubleStep * 0.006 * I, hipYaw, hipRoll);
    this.#set('spine', doubleStep * 0.012 * I, torsoYaw * 0.45, lean * 0.58);
    this.#set('chest', -doubleStep * 0.009 * I, torsoYaw, lean * 0.42);
    this.#set('neck', 0, -torsoYaw * 0.25, -lean * 0.10);
    this.#set('head', -doubleStep * 0.004 * I, -torsoYaw * 0.14, -hipRoll * 0.30);

    this.#set('lUpperLeg', 0, -hipYaw * 0.12, hipL * stride);
    this.#set('rUpperLeg', 0, -hipYaw * 0.12, hipR * stride);
    this.#set('lLeg', 0, 0, -kneeL * kneeTune);
    this.#set('rLeg', 0, 0, -kneeR * kneeTune);
    this.#set('lAnkle', 0, 0, ankleL * stride);
    this.#set('rAnkle', 0, 0, ankleR * stride);
    this.#set('lToe', 0, 0, -toeL * I);
    this.#set('rToe', 0, 0, -toeR * I);

    // Arms are phase-opposed to the legs and keep the elbows bent, matching the
    // compact third-person sprint silhouette seen in Free Fire gameplay.
    const armPhaseL = this.#cycle([0.30,0.16,-0.06,-0.28,-0.34,-0.18,0.06,0.26], uR);
    const armPhaseR = this.#cycle([0.30,0.16,-0.06,-0.28,-0.34,-0.18,0.06,0.26], uL);
    const armBase = THREE.MathUtils.lerp(0.76, 0.68, runBlend) * Math.max(0.82, S.idleArmDown);
    const armAmp = THREE.MathUtils.lerp(0.46, 0.70, runBlend) * armTune;
    const elbowBase = THREE.MathUtils.lerp(0.28, 0.58, runBlend) * I;
    const elbowPulseL = Math.max(0, this.#cycle([0.1,0.3,0.55,0.72,0.48,0.24,0.12,0.08], uR));
    const elbowPulseR = Math.max(0, this.#cycle([0.1,0.3,0.55,0.72,0.48,0.24,0.12,0.08], uL));

    this.#set('lClav', 0, -torsoYaw * 0.18, (0.020 - legCounter * THREE.MathUtils.lerp(0.020,0.038,runBlend)) * I);
    this.#set('rClav', 0, -torsoYaw * 0.18, (-0.020 + legCounter * THREE.MathUtils.lerp(0.020,0.038,runBlend)) * I);
    this.#set('lArm', 0, -S.idleArmTwist * 0.65, (armBase + armPhaseL * armAmp) * I);
    this.#set('rArm', 0, S.idleArmTwist * 0.65, (-armBase - armPhaseR * armAmp) * I);
    this.#set('lForeArm', 0, 0.018 * I, -(elbowBase + elbowPulseL * THREE.MathUtils.lerp(0.18,0.34,runBlend)) * I);
    this.#set('rForeArm', 0, -0.018 * I, -(elbowBase + elbowPulseR * THREE.MathUtils.lerp(0.18,0.34,runBlend)) * I);
    this.#set('lHand', 0, S.idleHandRelax * 0.12 * I, -S.idleHandRelax * 0.75 * I);
    this.#set('rHand', 0, -S.idleHandRelax * 0.12 * I, -S.idleHandRelax * 0.75 * I);

    return {
      bob: pelvisY * 0.62,
      rollZ: -hipRoll * 0.45,
      tiltX: THREE.MathUtils.lerp(0, 0.055, runBlend) * S.lean * I
    };
  }

  #jump(falling) {
    const I = this.settings.intensity;
    if (!falling) {
      const t = this.#ease01(Math.min(1, this.stateTime / 0.22));
      this.#setPos('hips', 0, THREE.MathUtils.lerp(-0.010, 0.024, t) * I, 0);
      this.#set('spine', 0, 0, THREE.MathUtils.lerp(-0.18, -0.08, t) * I);
      this.#set('chest', 0, 0, THREE.MathUtils.lerp(-0.08, -0.03, t) * I);
      this.#set('lUpperLeg', 0, 0, THREE.MathUtils.lerp(0.44, 0.26, t) * I);
      this.#set('rUpperLeg', 0, 0, THREE.MathUtils.lerp(0.34, 0.18, t) * I);
      this.#set('lLeg', 0, 0, THREE.MathUtils.lerp(-0.82, -0.54, t) * I);
      this.#set('rLeg', 0, 0, THREE.MathUtils.lerp(-0.70, -0.46, t) * I);
      this.#set('lAnkle', 0, 0, 0.10 * I);
      this.#set('rAnkle', 0, 0, 0.08 * I);
      this.#set('lArm', 0, -0.04 * I, THREE.MathUtils.lerp(0.34, 0.12, t) * I);
      this.#set('rArm', 0, 0.04 * I, THREE.MathUtils.lerp(-0.34, -0.12, t) * I);
      this.#set('lForeArm', 0, 0, -0.48 * I);
      this.#set('rForeArm', 0, 0, -0.48 * I);
      return { yOffset: 0, tiltX: -0.025 * I };
    }

    const t = this.#ease01(Math.min(1, this.stateTime / 0.26));
    this.#set('hips', 0, 0, 0.025 * I);
    this.#set('spine', 0, 0, THREE.MathUtils.lerp(-0.02, 0.08, t) * I);
    this.#set('chest', 0, 0, THREE.MathUtils.lerp(-0.01, 0.04, t) * I);
    this.#set('lUpperLeg', 0, 0, THREE.MathUtils.lerp(0.18, 0.32, t) * I);
    this.#set('rUpperLeg', 0, 0, THREE.MathUtils.lerp(0.12, 0.28, t) * I);
    this.#set('lLeg', 0, 0, THREE.MathUtils.lerp(-0.42, -0.62, t) * I);
    this.#set('rLeg', 0, 0, THREE.MathUtils.lerp(-0.40, -0.58, t) * I);
    this.#set('lArm', 0, -0.03 * I, 0.20 * I);
    this.#set('rArm', 0, 0.03 * I, -0.20 * I);
    this.#set('lForeArm', 0, 0, -0.38 * I);
    this.#set('rForeArm', 0, 0, -0.38 * I);
    return { yOffset: 0, tiltX: 0.015 * t * I };
  }

  #land() {
    const I = this.settings.intensity;
    const p = THREE.MathUtils.clamp(this.landPulse, 0, 1);
    const squash = p * p;
    this.#setPos('hips', 0, -0.034 * squash * I, 0);
    this.#set('hips', 0, 0, 0.025 * squash * I);
    this.#set('lUpperLeg', 0, 0, 0.42 * squash * I);
    this.#set('rUpperLeg', 0, 0, 0.42 * squash * I);
    this.#set('lLeg', 0, 0, -0.90 * squash * I);
    this.#set('rLeg', 0, 0, -0.90 * squash * I);
    this.#set('spine', 0, 0, 0.20 * squash * I);
    this.#set('chest', 0, 0, 0.11 * squash * I);
    const down = Math.max(0.68, this.settings.idleArmDown * 0.80);
    this.#set('lArm', 0, -this.settings.idleArmTwist * I, (down + 0.12 * squash) * I);
    this.#set('rArm', 0, this.settings.idleArmTwist * I, (-down - 0.12 * squash) * I);
    this.#set('lForeArm', 0, 0, -(0.34 + 0.10 * squash) * I);
    this.#set('rForeArm', 0, 0, -(0.34 + 0.10 * squash) * I);
    return { yOffset: -0.085 * squash * I, tiltX: 0.040 * squash * I };
  }

  #crouch(moving, dt) {
    const S = this.settings;
    const I = S.intensity;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.3, this.motion.crouchSpeed), 0, 1.15);
    if (moving) this.phase = (this.phase + dt * (1.35 + speedNorm * 0.40) * S.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const s = moving ? Math.sin(p) : Math.sin(this.time * 1.2) * 0.035;
    const s2 = moving ? Math.sin(p * 2) : 0;
    const step = moving ? this.#cycle([0.18,0.10,-0.05,-0.16,-0.18,-0.08,0.06,0.16], this.phase) : 0;

    this.#setPos('hips', Math.cos(p) * (moving ? 0.006 : 0) * S.hipSway, 0, 0);
    this.#set('hips', 0, s2 * 0.018 * I, 0.050 * I);
    this.#set('lUpperLeg', 0, 0, (0.64 + step * 0.34) * I);
    this.#set('rUpperLeg', 0, 0, (0.64 - step * 0.34) * I);
    this.#set('lLeg', 0, 0, (-1.08 - Math.max(0, -step) * 0.18) * I);
    this.#set('rLeg', 0, 0, (-1.08 - Math.max(0, step) * 0.18) * I);
    this.#set('lAnkle', 0, 0, moving ? Math.cos(p) * 0.08 * I : 0.03 * I);
    this.#set('rAnkle', 0, 0, moving ? -Math.cos(p) * 0.08 * I : 0.03 * I);
    this.#set('spine', 0, -s * 0.020 * I, -0.27 * I);
    this.#set('chest', 0, s * 0.032 * I, -0.08 * I);
    this.#set('head', 0, -s * 0.014 * I, 0.025 * I);

    if (moving) {
      this.#set('lArm', 0, -S.idleArmTwist * 0.5, (0.66 - s * 0.25 * S.armSwing) * I);
      this.#set('rArm', 0, S.idleArmTwist * 0.5, (-0.66 + s * 0.25 * S.armSwing) * I);
      this.#set('lForeArm', 0, 0, -(0.38 + Math.max(0, s) * 0.16) * I);
      this.#set('rForeArm', 0, 0, -(0.38 + Math.max(0, -s) * 0.16) * I);
    } else {
      this.#idleArms(0.72, 0);
    }

    return moving ? {
      bob: (0.5 - 0.5 * Math.cos(p * 2)) * 0.010 * S.bodyBob * I,
      rollZ: -s * 0.006 * S.hipSway * I,
      tiltX: 0.015 * I
    } : { bob: 0, rollZ: 0, tiltX: 0.015 * I };
  }

  #prone(moving, dt) {
    const S = this.settings;
    const I = S.intensity;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.2, this.motion.proneSpeed), 0, 1.15);
    if (moving) this.phase = (this.phase + dt * (1.05 + speedNorm * 0.36) * S.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const s = moving ? Math.sin(p) : Math.sin(this.time * 1.25) * 0.025;
    const c = moving ? Math.cos(p) : 0;

    this.#set('spine', 0, -s * 0.022 * I, -0.12 * I);
    this.#set('chest', 0, s * 0.035 * I, 0.20 * I);
    this.#set('neck', 0, -s * 0.018 * I, -0.15 * I);
    this.#set('head', -0.06 * I, -s * 0.022 * I, -0.27 * I);
    this.#set('lClav', 0, 0, (-0.10 + s * 0.06) * I);
    this.#set('rClav', 0, 0, (0.10 - s * 0.06) * I);
    this.#set('lArm', 0, -0.05 * I, (-0.74 + s * 0.30) * S.armSwing * I);
    this.#set('rArm', 0, 0.05 * I, (0.74 - s * 0.30) * S.armSwing * I);
    this.#set('lForeArm', 0, 0, (-0.82 + Math.max(0, c) * 0.16) * I);
    this.#set('rForeArm', 0, 0, (-0.82 + Math.max(0, -c) * 0.16) * I);
    this.#set('lUpperLeg', 0, 0, (moving ? s * 0.20 : 0.02) * I);
    this.#set('rUpperLeg', 0, 0, (moving ? -s * 0.20 : -0.02) * I);
    this.#set('lLeg', 0, 0, (-0.20 - Math.max(0, -s) * 0.30) * I);
    this.#set('rLeg', 0, 0, (-0.20 - Math.max(0, s) * 0.30) * I);
    this.#set('lAnkle', 0, 0, -s * 0.07 * I);
    this.#set('rAnkle', 0, 0, s * 0.07 * I);

    return moving ? {
      bob: Math.abs(s) * 0.010 * S.bodyBob * I,
      rollZ: -s * 0.008 * S.hipSway * I
    } : { bob: 0, rollZ: 0 };
  }
}
