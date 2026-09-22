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

// V14 movement preset rebuilt from the user's Free Fire reference recording.
// The Naruto GLB has a rig but no animation clips, so these are restrained
// procedural poses shaped around the observed Free Fire silhouettes/timing.
const DEFAULT_ANIMATION = {
  intensity: 0.96,
  walkStride: 0.80,
  runStride: 0.86,
  armSwing: 0.64,
  kneeLift: 0.94,
  bodyBob: 0.46,
  hipSway: 0.46,
  cadence: 1.00,
  blend: 1.28,
  lean: 0.70,
  idleArmDown: 0.36,
  idleElbowBend: 0.10,
  idleArmTwist: 0.015,
  idleShoulderRelax: 0.03,
  idleHandRelax: 0.06,
  idleBreathing: 0.46,
  idleHeadMotion: 0.30
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
  // Contact -> load -> passing -> push -> swing. Compact, almost jog-like,
  // matching the reference where the feet stay close to the body.
  hip:    [ 0.090,0.060,0.004,-0.052,-0.095,-0.055,0.008,0.070 ],
  knee:   [ 0.040,0.070,0.050,0.050,0.090,0.190,0.265,0.145 ],
  ankle:  [ 0.014,0.004,-0.012,-0.032,-0.046,0.008,0.030,0.024 ],
  toe:    [ 0.00, 0.00, 0.006,0.022,0.048,0.024,0.004,0.00 ],
  pelvisY:[-0.001,0.002,0.004,0.002,-0.001,0.002,0.004,0.002],
  pelvisX:[ 0.002,0.001,0.000,-0.001,-0.002,-0.001,0.000,0.001]
};

const RUN = {
  hip:    [ 0.155,0.105,-0.006,-0.112,-0.172,-0.086,0.030,0.145 ],
  knee:   [ 0.080,0.118,0.070,0.060,0.130,0.305,0.440,0.235 ],
  ankle:  [ 0.020,0.008,-0.020,-0.050,-0.068,0.008,0.045,0.035 ],
  toe:    [ 0.00, 0.006,0.018,0.045,0.078,0.030,0.006,0.00 ],
  pelvisY:[-0.002,0.004,0.007,0.003,-0.002,0.004,0.007,0.003],
  pelvisX:[ 0.003,0.002,0.000,-0.002,-0.003,-0.002,0.000,0.002]
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
    this.punchTime = -1;
    this.punchSide = 1;
    this.punchDuration = 0.34;

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

  triggerPunch() {
    // Alternate right/left like the unarmed Free Fire fist rhythm. Punching is
    // an upper-body overlay so locomotion can continue underneath it.
    if (this.punchTime >= 0 && this.punchTime < 0.13) return false;
    this.punchSide *= -1;
    this.punchTime = 0;
    return true;
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
    if (this.punchTime >= 0) {
      this.punchTime += dt;
      if (this.punchTime > this.punchDuration) this.punchTime = -1;
    }
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
    else if (state === 'PRONE_CRAWL') { yOffset = -0.050; tiltX = 1.48; ({ bob, rollZ } = this.#prone(true, dt)); }

    if (this.punchTime >= 0 && !state.startsWith('PRONE')) this.#punchOverlay();

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
  #add(key, x = 0, y = 0, z = 0) { const v = this.#v(key); if (v) { v.x += x; v.y += y; v.z += z; } }
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
    // Rig calibration from the actual Naruto skeleton:
    // upper-arm local Y lowers the arm (left +Y / right -Y), while forearm
    // local -Z bends BOTH elbows forward. Keeping that sign identical on both
    // forearms is essential; mirroring it was the main source of the strange
    // backwards hand pose in older builds.
    const down = THREE.MathUtils.clamp(S.idleArmDown, 0.24, 0.56) * strength;
    const elbow = THREE.MathUtils.clamp(S.idleElbowBend, 0.06, 0.24) * Math.max(0.78, strength);
    const shoulder = S.idleShoulderRelax * strength;
    const breatheSwing = swing * 0.20;
    this.#set('lClav', 0, shoulder * 0.018 * I, 0);
    this.#set('rClav', 0, -shoulder * 0.018 * I, 0);
    this.#set('lArm', 0, (down + breatheSwing) * I, -0.010 * I);
    this.#set('rArm', 0, (-down - breatheSwing) * I, -0.010 * I);
    this.#set('lForeArm', 0, elbow * 0.12 * I, -elbow * 0.72 * I);
    this.#set('rForeArm', 0, -elbow * 0.12 * I, -elbow * 0.72 * I);
    this.#set('lHand', 0, 0, -S.idleHandRelax * 0.08 * I);
    this.#set('rHand', 0, 0, -S.idleHandRelax * 0.08 * I);
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

    // Reference-video arm silhouette: elbows stay noticeably bent while
    // running, hands remain near the torso, and the shoulder swing is small.
    // Both forearms use negative local Z to bend forward on this exact rig.
    const armWave = Math.sin(phase);
    const armAmp = THREE.MathUtils.lerp(0.032, 0.052, runBlend) * armTune * I;
    const down = THREE.MathUtils.lerp(0.38, 0.33, runBlend) * I;
    const elbowBend = THREE.MathUtils.lerp(0.34, 0.72, runBlend) * I;
    const elbowPulseL = Math.max(0, -armWave) * THREE.MathUtils.lerp(0.04, 0.12, runBlend) * I;
    const elbowPulseR = Math.max(0, armWave) * THREE.MathUtils.lerp(0.04, 0.12, runBlend) * I;

    this.#set('lClav', 0, 0.004 * I, -torsoYaw * 0.08);
    this.#set('rClav', 0, -0.004 * I, -torsoYaw * 0.08);
    this.#set('lArm', 0, down, armWave * armAmp - 0.010 * I);
    this.#set('rArm', 0, -down, -armWave * armAmp - 0.010 * I);
    this.#set('lForeArm', 0, 0.020 * I, -(elbowBend + elbowPulseL));
    this.#set('rForeArm', 0, -0.020 * I, -(elbowBend + elbowPulseR));
    this.#set('lHand', 0, 0, -0.012 * I);
    this.#set('rHand', 0, 0, -0.012 * I);

    return {
      bob: pelvisY * 0.50,
      rollZ: -hipRoll * 0.30,
      tiltX: THREE.MathUtils.lerp(0, 0.022, runBlend) * S.lean * I
    };
  }

  #jump(falling) {
    const S = this.settings;
    const I = S.intensity;
    const leadLeft = Math.sin(this.phase * Math.PI * 2) >= 0;
    const leadHip = falling ? 0.23 : 0.30;
    const trailHip = falling ? 0.10 : 0.14;
    const leadKnee = falling ? -0.46 : -0.58;
    const trailKnee = falling ? -0.23 : -0.28;
    const lLead = leadLeft ? 1 : 0;
    const rLead = 1 - lLead;

    // Free Fire reference: a short hop with one knee visibly leading, torso
    // controlled, and both forearms carried in front instead of flung sideways.
    this.#setPos('hips', 0, falling ? 0.002 * I : 0.006 * I, 0);
    this.#set('hips', 0, 0, (falling ? 0.008 : -0.010) * I);
    this.#set('spine', 0, 0, (falling ? 0.015 : -0.030) * I);
    this.#set('chest', 0, 0, (falling ? 0.006 : -0.014) * I);
    this.#set('lUpperLeg', 0, 0, (trailHip + (leadHip - trailHip) * lLead) * I);
    this.#set('rUpperLeg', 0, 0, (trailHip + (leadHip - trailHip) * rLead) * I);
    this.#set('lLeg', 0, 0, (trailKnee + (leadKnee - trailKnee) * lLead) * I);
    this.#set('rLeg', 0, 0, (trailKnee + (leadKnee - trailKnee) * rLead) * I);
    this.#set('lAnkle', 0, 0, 0.025 * I);
    this.#set('rAnkle', 0, 0, 0.025 * I);
    this.#set('lArm', 0, 0.32 * I, -0.055 * I);
    this.#set('rArm', 0, -0.32 * I, -0.055 * I);
    this.#set('lForeArm', 0, 0.015 * I, -0.62 * I);
    this.#set('rForeArm', 0, -0.015 * I, -0.62 * I);
    return { yOffset: 0, tiltX: falling ? 0.004 * I : -0.010 * I };
  }

  #land() {
    const S = this.settings;
    const I = S.intensity;
    const p = THREE.MathUtils.clamp(this.landPulse, 0, 1);
    const squash = p * p;
    this.#setPos('hips', 0, -0.016 * squash * I, 0);
    this.#set('hips', 0, 0, 0.018 * squash * I);
    this.#set('lUpperLeg', 0, 0, 0.25 * squash * I);
    this.#set('rUpperLeg', 0, 0, 0.25 * squash * I);
    this.#set('lLeg', 0, 0, -0.50 * squash * I);
    this.#set('rLeg', 0, 0, -0.50 * squash * I);
    this.#set('spine', 0, 0, 0.075 * squash * I);
    this.#set('chest', 0, 0, 0.030 * squash * I);
    this.#set('lArm', 0, 0.35 * I, -0.025 * I);
    this.#set('rArm', 0, -0.35 * I, -0.025 * I);
    this.#set('lForeArm', 0, 0.015 * I, -(0.24 + 0.14 * squash) * I);
    this.#set('rForeArm', 0, -0.015 * I, -(0.24 + 0.14 * squash) * I);
    return { yOffset: -0.024 * squash * I, tiltX: 0.010 * squash * I };
  }

  #crouch(moving, dt) {
    const S = this.settings;
    const I = S.intensity;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.3, this.motion.crouchSpeed), 0, 1.10);
    if (moving) this.phase = (this.phase + dt * (1.18 + speedNorm * 0.26) * S.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const step = moving ? Math.sin(p) : 0;
    const step2 = moving ? Math.sin(p * 2) : 0;

    // Deep Free Fire crouch: hips low, torso leaning forward, feet taking short
    // alternating steps. Hands stay close to thighs instead of swinging wide.
    this.#setPos('hips', moving ? Math.cos(p) * 0.0022 * S.hipSway : 0, 0, 0);
    this.#set('hips', 0, step2 * 0.006 * I, 0.038 * I);
    this.#set('lUpperLeg', 0, 0, (0.55 + step * 0.055) * I);
    this.#set('rUpperLeg', 0, 0, (0.55 - step * 0.055) * I);
    this.#set('lLeg', 0, 0, (-0.94 - Math.max(0, -step) * 0.055) * I);
    this.#set('rLeg', 0, 0, (-0.94 - Math.max(0, step) * 0.055) * I);
    this.#set('lAnkle', 0, 0, moving ? Math.cos(p) * 0.026 * I : 0.020 * I);
    this.#set('rAnkle', 0, 0, moving ? -Math.cos(p) * 0.026 * I : 0.020 * I);
    this.#set('spine', 0, -step * 0.008 * I, -0.18 * I);
    this.#set('chest', 0, step * 0.010 * I, -0.060 * I);
    this.#set('neck', 0, 0, 0.025 * I);

    const armSwing = moving ? step * 0.022 * S.armSwing * I : 0;
    this.#set('lArm', 0, 0.40 * I, -0.030 * I + armSwing);
    this.#set('rArm', 0, -0.40 * I, -0.030 * I - armSwing);
    this.#set('lForeArm', 0, 0.020 * I, -0.42 * I);
    this.#set('rForeArm', 0, -0.020 * I, -0.42 * I);

    return {
      bob: moving ? (0.5 - 0.5 * Math.cos(p * 2)) * 0.0032 * S.bodyBob * I : 0,
      rollZ: moving ? -step * 0.0025 * S.hipSway * I : 0,
      tiltX: 0.010 * I
    };
  }

  #prone(moving, dt) {
    const S = this.settings;
    const I = S.intensity;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.2, this.motion.proneSpeed), 0, 1.10);
    if (moving) this.phase = (this.phase + dt * (0.84 + speedNorm * 0.20) * S.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const s = moving ? Math.sin(p) : Math.sin(this.time * 1.05) * 0.010;

    // Reference pose: body nearly flat, chest only slightly lifted, elbows in
    // front of the shoulders, legs mostly straight. Crawl amplitude is subtle.
    this.#set('spine', 0, -s * 0.008 * I, -0.040 * I);
    this.#set('chest', 0, s * 0.010 * I, 0.070 * I);
    this.#set('neck', 0, -s * 0.005 * I, -0.060 * I);
    this.#set('head', -0.020 * I, -s * 0.006 * I, -0.095 * I);
    this.#set('lClav', 0, 0.006 * I, 0);
    this.#set('rClav', 0, -0.006 * I, 0);
    this.#set('lArm', 0, (0.34 + s * 0.025) * I, (-0.20 + s * 0.025) * I);
    this.#set('rArm', 0, (-0.34 - s * 0.025) * I, (-0.20 - s * 0.025) * I);
    this.#set('lForeArm', 0, 0.015 * I, (-0.78 + (moving ? -s * 0.08 : 0)) * I);
    this.#set('rForeArm', 0, -0.015 * I, (-0.78 + (moving ? s * 0.08 : 0)) * I);
    this.#set('lUpperLeg', 0, 0, (moving ? s * 0.052 : 0.005) * I);
    this.#set('rUpperLeg', 0, 0, (moving ? -s * 0.052 : -0.005) * I);
    this.#set('lLeg', 0, 0, (-0.09 - Math.max(0, -s) * 0.055) * I);
    this.#set('rLeg', 0, 0, (-0.09 - Math.max(0, s) * 0.055) * I);
    this.#set('lAnkle', 0, 0, -s * 0.018 * I);
    this.#set('rAnkle', 0, 0, s * 0.018 * I);

    return moving ? {
      bob: Math.abs(s) * 0.0028 * S.bodyBob * I,
      rollZ: -s * 0.0020 * S.hipSway * I
    } : { bob: 0, rollZ: 0 };
  }

  #punchOverlay() {
    const I = this.settings.intensity;
    const u = THREE.MathUtils.clamp(this.punchTime / this.punchDuration, 0, 1);
    // 0..0.22 wind-up, 0.22..0.52 strike, rest recover.
    const wind = u < 0.22 ? this.#ease01(u / 0.22) : 1;
    const strike = u < 0.22 ? 0 : u < 0.52 ? this.#ease01((u - 0.22) / 0.30) : 1;
    const recover = u < 0.52 ? 0 : this.#ease01((u - 0.52) / 0.48);
    const hit = strike * (1 - recover);
    const windOnly = wind * (1 - strike);
    const side = this.punchSide; // -1 right, +1 left after toggle
    const rightPunch = side < 0;

    const punchArm = rightPunch ? 'rArm' : 'lArm';
    const punchFore = rightPunch ? 'rForeArm' : 'lForeArm';
    const guardArm = rightPunch ? 'lArm' : 'rArm';
    const guardFore = rightPunch ? 'lForeArm' : 'rForeArm';
    const punchDown = rightPunch ? -1 : 1;
    const guardDown = rightPunch ? 1 : -1;
    const yaw = (rightPunch ? -1 : 1) * (0.05 * windOnly + 0.12 * hit) * I;

    this.#add('hips', 0, yaw * 0.25, 0);
    this.#add('spine', 0, yaw * 0.45, -0.015 * hit * I);
    this.#add('chest', 0, yaw, -0.025 * hit * I);
    this.#add(punchArm, 0, punchDown * (-0.06 * windOnly + 0.02 * hit) * I, (-0.16 * windOnly - 0.62 * hit) * I);
    // Wind-up bends the elbow; strike straightens it toward the target.
    this.#add(punchFore, 0, punchDown * 0.015 * I, (-0.62 * windOnly + 0.38 * hit) * I);
    this.#add(guardArm, 0, guardDown * 0.02 * I, -0.08 * (wind + hit) * I);
    this.#add(guardFore, 0, guardDown * 0.010 * I, -0.52 * (wind + hit) * I);
  }

}
