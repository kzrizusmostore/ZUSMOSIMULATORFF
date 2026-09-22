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

const DEFAULT_ANIMATION = {
  intensity: 1.16,
  walkStride: 1.18,
  runStride: 1.00,
  armSwing: 1.12,
  kneeLift: 1.16,
  bodyBob: 0.92,
  hipSway: 1.18,
  cadence: 1.00,
  blend: 1.10,
  lean: 1.00
};

export class AnimationController {
  constructor(characterInfo, baseVisualY = 0, tuning = null) {
    this.info = characterInfo;
    this.visual = characterInfo.visual;
    this.posePivot = characterInfo.posePivot;
    this.baseVisualY = baseVisualY;
    this.time = 0;
    this.phase = 0;
    this.state = 'IDLE';
    this.prevState = 'IDLE';
    this.speed = 0;
    this.settings = { ...DEFAULT_ANIMATION };
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
    const next = tuning?.animation || tuning || {};
    this.settings = { ...DEFAULT_ANIMATION, ...next };
  }

  setState(state, speed = 0) {
    if (this.state !== state) {
      this.prevState = this.state;
      if (state === 'LAND') this.landPulse = 1;
      if ((state === 'WALK' || state === 'RUN') && !(this.prevState === 'WALK' || this.prevState === 'RUN')) {
        this.phase = 0;
      }
    }
    this.state = state;
    this.speed = speed;
  }

  update(dt) {
    this.time += dt;
    this.landPulse = Math.max(0, this.landPulse - dt * 5.2);
    for (const v of this.target.values()) v.set(0, 0, 0);
    for (const v of this.targetPos.values()) v.set(0, 0, 0);

    let yOffset = 0;
    let bob = 0;
    let tiltX = 0;
    let rollZ = 0;
    const state = this.state;

    if (state === 'IDLE') this.#idle();
    else if (state === 'WALK') ({ bob, rollZ } = this.#locomotion(false, dt));
    else if (state === 'RUN') ({ bob, rollZ, tiltX } = this.#locomotion(true, dt));
    else if (state === 'JUMP') this.#jump(false);
    else if (state === 'FALL') this.#jump(true);
    else if (state === 'LAND') ({ yOffset, tiltX } = this.#land());
    else if (state === 'CROUCH_IDLE') { yOffset = -0.13; this.#crouch(false, dt); }
    else if (state === 'CROUCH_WALK') { yOffset = -0.13; ({ bob, rollZ } = this.#crouch(true, dt)); }
    else if (state === 'PRONE_IDLE') { yOffset = -0.03; tiltX = 1.34; this.#prone(false, dt); }
    else if (state === 'PRONE_CRAWL') { yOffset = -0.03; tiltX = 1.34; ({ bob, rollZ } = this.#prone(true, dt)); }

    const b = this.settings.blend;
    const blend = (state === 'RUN' ? 13 : state === 'WALK' ? 12 : state.startsWith('PRONE') ? 9 : state.startsWith('CROUCH') ? 10 : 11) * b;
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

    this.visualYOffset = THREE.MathUtils.damp(this.visualYOffset, yOffset, 10, dt);
    this.visualBob = THREE.MathUtils.damp(this.visualBob, bob, 16 * b, dt);
    this.visualTilt = THREE.MathUtils.damp(this.visualTilt, tiltX, 9 * b, dt);
    this.visualRoll = THREE.MathUtils.damp(this.visualRoll, rollZ, 10 * b, dt);

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

  #idle() {
    const I = this.settings.intensity;
    const breathe = Math.sin(this.time * 1.85);
    const breathe2 = Math.sin(this.time * 0.93 + 0.8);
    const micro = Math.sin(this.time * 0.57);
    this.#setPos('hips', micro * 0.004 * I, breathe * 0.003 * I, 0);
    this.#set('hips', 0, micro * 0.014 * I, breathe2 * 0.009 * I);
    this.#set('spine', breathe * 0.011 * I, micro * 0.014 * I, breathe * 0.026 * I);
    this.#set('chest', -breathe * 0.009 * I, -micro * 0.018 * I, -breathe * 0.020 * I);
    this.#set('neck', breathe2 * 0.003 * I, micro * 0.014 * I, -micro * 0.007 * I);
    this.#set('head', breathe2 * 0.007 * I, -micro * 0.022 * I, micro * 0.011 * I);
    this.#set('lClav', 0, 0, (0.014 + breathe * 0.012) * I);
    this.#set('rClav', 0, 0, (-0.014 - breathe * 0.012) * I);
    this.#set('lArm', 0.020 * I, -0.012 * I, (0.065 + breathe * 0.016) * I);
    this.#set('rArm', -0.020 * I, 0.012 * I, (-0.065 - breathe * 0.016) * I);
    this.#set('lForeArm', 0, 0.016 * I, -0.095 * I);
    this.#set('rForeArm', 0, -0.016 * I, -0.095 * I);
    this.#set('lHand', 0.012 * I, 0, -0.020 * I);
    this.#set('rHand', -0.012 * I, 0, -0.020 * I);
    this.#set('lUpperLeg', 0, 0, 0.014 * I);
    this.#set('rUpperLeg', 0, 0, -0.014 * I);
  }

  #locomotion(run, dt) {
    const S = this.settings;
    const I = S.intensity;
    const strideTune = run ? S.runStride : S.walkStride;
    const baseSpeed = run ? 6.8 : 4.2;
    const speedNorm = THREE.MathUtils.clamp(this.speed / baseSpeed, 0.30, 1.25);
    const cadence = (run ? 9.2 + speedNorm * 2.2 : 5.6 + speedNorm * 2.0) * S.cadence;
    this.phase += dt * cadence;

    const p = this.phase;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const s2 = Math.sin(p * 2);
    const c2 = Math.cos(p * 2);
    const s3 = Math.sin(p * 3);
    const swingL = s + s2 * 0.13;
    const swingR = -s + s2 * 0.13;
    const legAmp = (run ? 0.78 : 0.58) * strideTune * I;
    const armAmp = (run ? 0.64 : 0.46) * S.armSwing * I;
    const kneeAmp = (run ? 0.78 : 0.52) * S.kneeLift * I;
    const hipYaw = s2 * (run ? 0.070 : 0.050) * S.hipSway * I;
    const hipRoll = c * (run ? 0.028 : 0.020) * S.hipSway * I;
    const torsoTwist = s * (run ? 0.080 : 0.058) * S.hipSway * I;
    const bobScale = S.bodyBob * I;
    const leftSwing = Math.max(0, -s);
    const rightSwing = Math.max(0, s);
    const leftPlant = Math.max(0, s);
    const rightPlant = Math.max(0, -s);

    this.#setPos('hips', c * (run ? 0.010 : 0.008) * S.hipSway, (0.5 - 0.5 * c2) * (run ? 0.020 : 0.014) * bobScale, 0);
    this.#set('hips', 0, hipYaw, hipRoll);
    this.#set('spine', c2 * (run ? 0.018 : 0.014) * I, -torsoTwist * 0.58, (run ? -0.120 : -0.040) * S.lean * I);
    this.#set('chest', -c2 * (run ? 0.013 : 0.009) * I, torsoTwist, (run ? -0.046 : -0.014) * S.lean * I);
    this.#set('neck', -c2 * 0.004 * I, -torsoTwist * 0.30, c * 0.008 * I);
    this.#set('head', -c2 * 0.009 * I, -torsoTwist * 0.18, -hipRoll * 0.35);

    this.#set('lUpperLeg', c * 0.020 * I, -hipYaw * 0.18, swingL * legAmp);
    this.#set('rUpperLeg', -c * 0.020 * I, -hipYaw * 0.18, swingR * legAmp);
    this.#set('lLeg', 0, 0, -(leftSwing * kneeAmp + leftPlant * (run ? 0.10 : 0.055) * I));
    this.#set('rLeg', 0, 0, -(rightSwing * kneeAmp + rightPlant * (run ? 0.10 : 0.055) * I));
    this.#set('lAnkle', 0, 0, (c * (run ? 0.20 : 0.14) + leftPlant * 0.07) * strideTune * I);
    this.#set('rAnkle', 0, 0, (-c * (run ? 0.20 : 0.14) + rightPlant * 0.07) * strideTune * I);
    this.#set('lToe', 0, 0, -(Math.max(0, -c) * (run ? 0.18 : 0.11)) * I);
    this.#set('rToe', 0, 0, -(Math.max(0, c) * (run ? 0.18 : 0.11)) * I);

    this.#set('lClav', c2 * 0.005 * I, -torsoTwist * 0.20, -s * (run ? 0.050 : 0.032) * I);
    this.#set('rClav', -c2 * 0.005 * I, -torsoTwist * 0.20, s * (run ? 0.050 : 0.032) * I);
    this.#set('lArm', -c * (run ? 0.026 : 0.018) * I, torsoTwist * 0.20, (-s * armAmp - (run ? 0.060 : 0.020) * I));
    this.#set('rArm', c * (run ? 0.026 : 0.018) * I, torsoTwist * 0.20, (s * armAmp + (run ? 0.060 : 0.020) * I));
    this.#set('lForeArm', s3 * 0.018 * I, 0.020 * I, (-0.14 - Math.max(0, s) * (run ? 0.40 : 0.24) * S.armSwing) * I);
    this.#set('rForeArm', -s3 * 0.018 * I, -0.020 * I, (-0.14 - Math.max(0, -s) * (run ? 0.40 : 0.24) * S.armSwing) * I);
    this.#set('lHand', c * 0.018 * I, 0, -s * 0.045 * I);
    this.#set('rHand', -c * 0.018 * I, 0, s * 0.045 * I);

    return {
      bob: (0.5 - 0.5 * c2) * (run ? 0.043 : 0.026) * bobScale,
      rollZ: -c * (run ? 0.016 : 0.010) * S.hipSway * I,
      tiltX: run ? 0.030 * S.lean * I : 0
    };
  }

  #jump(falling) {
    const I = this.settings.intensity;
    const breathe = Math.sin(this.time * 7.0);
    if (!falling) {
      this.#setPos('hips', 0, 0.018 * I, 0);
      this.#set('hips', 0, 0, -0.035 * I);
      this.#set('spine', 0, 0, -0.13 * I);
      this.#set('chest', 0, 0, -0.08 * I);
      this.#set('lUpperLeg', 0, 0, 0.42 * I);
      this.#set('rUpperLeg', 0, 0, -0.28 * I);
      this.#set('lLeg', 0, 0, -0.62 * I);
      this.#set('rLeg', 0, 0, -0.48 * I);
      this.#set('lArm', 0, 0, -0.72 * I);
      this.#set('rArm', 0, 0, 0.72 * I);
      this.#set('lForeArm', 0, 0, -0.24 * I);
      this.#set('rForeArm', 0, 0, -0.24 * I);
    } else {
      this.#set('hips', 0, 0, 0.02 * I);
      this.#set('spine', 0, 0, 0.06 * I);
      this.#set('chest', 0, 0, 0.04 * I);
      this.#set('lUpperLeg', 0, 0, (-0.18 + breathe * 0.05) * I);
      this.#set('rUpperLeg', 0, 0, (0.24 - breathe * 0.05) * I);
      this.#set('lLeg', 0, 0, -0.38 * I);
      this.#set('rLeg', 0, 0, -0.44 * I);
      this.#set('lArm', 0, 0, -0.30 * I);
      this.#set('rArm', 0, 0, 0.30 * I);
      this.#set('lForeArm', 0, 0, -0.18 * I);
      this.#set('rForeArm', 0, 0, -0.18 * I);
    }
  }

  #land() {
    const I = this.settings.intensity;
    const p = this.landPulse;
    const squash = p * p;
    this.#setPos('hips', 0, -0.025 * squash * I, 0);
    this.#set('lUpperLeg', 0, 0, 0.34 * squash * I);
    this.#set('rUpperLeg', 0, 0, 0.34 * squash * I);
    this.#set('lLeg', 0, 0, -0.74 * squash * I);
    this.#set('rLeg', 0, 0, -0.74 * squash * I);
    this.#set('spine', 0, 0, 0.16 * squash * I);
    this.#set('chest', 0, 0, 0.09 * squash * I);
    this.#set('lArm', 0, 0, 0.18 * squash * I);
    this.#set('rArm', 0, 0, -0.18 * squash * I);
    return { yOffset: -0.08 * squash * I, tiltX: 0.025 * squash * I };
  }

  #crouch(moving, dt) {
    const I = this.settings.intensity;
    if (moving) this.phase += dt * (5.0 + THREE.MathUtils.clamp(this.speed / 1.8, 0, 1) * 2.0) * this.settings.cadence;
    const s = moving ? Math.sin(this.phase) : Math.sin(this.time * 1.3) * 0.06;
    const c = moving ? Math.cos(this.phase) : 0;
    const s2 = moving ? Math.sin(this.phase * 2) : 0;

    this.#setPos('hips', c * 0.006 * this.settings.hipSway, 0, 0);
    this.#set('hips', 0, s2 * 0.025 * I, 0.035 * I);
    this.#set('lUpperLeg', 0, 0, (0.58 + s * 0.24) * I);
    this.#set('rUpperLeg', 0, 0, (0.58 - s * 0.24) * I);
    this.#set('lLeg', 0, 0, (-1.02 + Math.max(0, -s) * 0.18) * I);
    this.#set('rLeg', 0, 0, (-1.02 + Math.max(0, s) * 0.18) * I);
    this.#set('lAnkle', 0, 0, c * 0.10 * I);
    this.#set('rAnkle', 0, 0, -c * 0.10 * I);
    this.#set('spine', 0, -s * 0.025 * I, -0.23 * I);
    this.#set('chest', 0, s * 0.040 * I, -0.06 * I);
    this.#set('head', 0, -s * 0.018 * I, 0.02 * I);
    this.#set('lArm', 0, 0, (-s * 0.26 - 0.08) * this.settings.armSwing * I);
    this.#set('rArm', 0, 0, (s * 0.26 + 0.08) * this.settings.armSwing * I);
    this.#set('lForeArm', 0, 0, (-0.20 - Math.max(0, s) * 0.18) * I);
    this.#set('rForeArm', 0, 0, (-0.20 - Math.max(0, -s) * 0.18) * I);

    return moving ? { bob: (0.5 - 0.5 * Math.cos(this.phase * 2)) * 0.020 * this.settings.bodyBob * I, rollZ: -s * 0.008 * this.settings.hipSway * I } : { bob: 0, rollZ: 0 };
  }

  #prone(moving, dt) {
    const I = this.settings.intensity;
    if (moving) this.phase += dt * (4.6 + THREE.MathUtils.clamp(this.speed / 0.9, 0, 1) * 1.7) * this.settings.cadence;
    const s = moving ? Math.sin(this.phase) : Math.sin(this.time * 1.45) * 0.08;
    const c = moving ? Math.cos(this.phase) : 0;

    this.#set('spine', 0, -s * 0.03 * I, -0.10 * I);
    this.#set('chest', 0, s * 0.045 * I, 0.18 * I);
    this.#set('neck', 0, -s * 0.025 * I, -0.12 * I);
    this.#set('head', -0.05 * I, -s * 0.03 * I, -0.24 * I);
    this.#set('lClav', 0, 0, (-0.12 + s * 0.08) * I);
    this.#set('rClav', 0, 0, (0.12 - s * 0.08) * I);
    this.#set('lArm', 0, 0, (-0.72 + s * 0.28) * this.settings.armSwing * I);
    this.#set('rArm', 0, 0, (0.72 - s * 0.28) * this.settings.armSwing * I);
    this.#set('lForeArm', 0, 0, (-0.70 + Math.max(0, c) * 0.12) * I);
    this.#set('rForeArm', 0, 0, (-0.70 + Math.max(0, -c) * 0.12) * I);
    this.#set('lUpperLeg', 0, 0, s * 0.24 * I);
    this.#set('rUpperLeg', 0, 0, -s * 0.24 * I);
    this.#set('lLeg', 0, 0, (-0.16 - Math.max(0, -s) * 0.26) * I);
    this.#set('rLeg', 0, 0, (-0.16 - Math.max(0, s) * 0.26) * I);
    this.#set('lAnkle', 0, 0, -s * 0.08 * I);
    this.#set('rAnkle', 0, 0, s * 0.08 * I);

    return moving ? { bob: Math.abs(s) * 0.016 * this.settings.bodyBob * I, rollZ: -s * 0.010 * this.settings.hipSway * I } : { bob: 0, rollZ: 0 };
  }
}
