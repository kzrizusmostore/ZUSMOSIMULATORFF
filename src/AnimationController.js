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

export class AnimationController {
  constructor(characterInfo, baseVisualY = 0) {
    this.info = characterInfo;
    this.visual = characterInfo.visual;
    this.posePivot = characterInfo.posePivot;
    this.baseVisualY = baseVisualY;
    this.time = 0;
    this.phase = 0;
    this.state = 'IDLE';
    this.prevState = 'IDLE';
    this.speed = 0;
    this.rest = new Map();
    this.current = new Map();
    this.target = new Map();
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
      this.rest.set(key, { bone, quaternion: bone.quaternion.clone() });
      this.current.set(key, new THREE.Vector3());
      this.target.set(key, new THREE.Vector3());
    }
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

    const blend = state === 'RUN' ? 13 : state === 'WALK' ? 12 : state.startsWith('PRONE') ? 9 : state.startsWith('CROUCH') ? 10 : 11;
    for (const [key, rest] of this.rest) {
      const c = this.current.get(key);
      const t = this.target.get(key);
      c.x = THREE.MathUtils.damp(c.x, t.x, blend, dt);
      c.y = THREE.MathUtils.damp(c.y, t.y, blend, dt);
      c.z = THREE.MathUtils.damp(c.z, t.z, blend, dt);
      this.tmpEuler.set(c.x, c.y, c.z);
      this.tmpQ.setFromEuler(this.tmpEuler);
      rest.bone.quaternion.copy(rest.quaternion).multiply(this.tmpQ);
    }

    this.visualYOffset = THREE.MathUtils.damp(this.visualYOffset, yOffset, 10, dt);
    this.visualBob = THREE.MathUtils.damp(this.visualBob, bob, 16, dt);
    this.visualTilt = THREE.MathUtils.damp(this.visualTilt, tiltX, 9, dt);
    this.visualRoll = THREE.MathUtils.damp(this.visualRoll, rollZ, 10, dt);

    if (this.visual) this.visual.position.y = this.baseVisualY + this.visualYOffset + this.visualBob;
    if (this.posePivot) {
      this.posePivot.rotation.x = this.visualTilt;
      this.posePivot.rotation.z = this.visualRoll;
    }
  }

  #v(key) { return this.target.get(key); }
  #set(key, x = 0, y = 0, z = 0) { this.#v(key)?.set(x, y, z); }

  #idle() {
    const breathe = Math.sin(this.time * 2.0);
    const breathe2 = Math.sin(this.time * 1.0 + 0.8);
    const micro = Math.sin(this.time * 0.62);
    this.#set('hips', 0, micro * 0.012, breathe2 * 0.008);
    this.#set('spine', breathe * 0.008, micro * 0.012, breathe * 0.022);
    this.#set('chest', -breathe * 0.008, -micro * 0.016, -breathe * 0.016);
    this.#set('neck', 0, micro * 0.012, -micro * 0.006);
    this.#set('head', breathe2 * 0.006, -micro * 0.020, micro * 0.010);
    this.#set('lClav', 0, 0, 0.012 + breathe * 0.010);
    this.#set('rClav', 0, 0, -0.012 - breathe * 0.010);
    this.#set('lArm', 0.018, -0.010, 0.055 + breathe * 0.014);
    this.#set('rArm', -0.018, 0.010, -0.055 - breathe * 0.014);
    this.#set('lForeArm', 0, 0.014, -0.085);
    this.#set('rForeArm', 0, -0.014, -0.085);
    this.#set('lHand', 0.01, 0, -0.018);
    this.#set('rHand', -0.01, 0, -0.018);
    this.#set('lUpperLeg', 0, 0, 0.012);
    this.#set('rUpperLeg', 0, 0, -0.012);
  }

  #locomotion(run, dt) {
    const speedNorm = run ? THREE.MathUtils.clamp(this.speed / 8.6, 0.55, 1.15) : THREE.MathUtils.clamp(this.speed / 3.35, 0.45, 1.15);
    const cadence = run ? 10.2 + speedNorm * 3.2 : 6.0 + speedNorm * 2.6;
    this.phase += dt * cadence;

    const p = this.phase;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const s2 = Math.sin(p * 2);
    const c2 = Math.cos(p * 2);
    const legAmp = run ? 0.96 : 0.60;
    const armAmp = run ? 0.80 : 0.48;
    const kneeAmp = run ? 0.92 : 0.56;
    const hipYaw = s2 * (run ? 0.075 : 0.045);
    const torsoTwist = s * (run ? 0.085 : 0.050);

    this.#set('hips', 0, hipYaw, c2 * (run ? 0.025 : 0.014));
    this.#set('spine', c2 * (run ? 0.020 : 0.012), -torsoTwist * 0.55, run ? -0.155 : -0.055);
    this.#set('chest', -c2 * (run ? 0.014 : 0.008), torsoTwist, run ? -0.055 : -0.018);
    this.#set('neck', 0, -torsoTwist * 0.34, c2 * 0.008);
    this.#set('head', -c2 * 0.008, -torsoTwist * 0.22, -c2 * 0.006);

    this.#set('lUpperLeg', c * (run ? 0.030 : 0.018), -hipYaw * 0.20, s * legAmp);
    this.#set('rUpperLeg', -c * (run ? 0.030 : 0.018), -hipYaw * 0.20, -s * legAmp);
    this.#set('lLeg', 0, 0, -Math.max(0, -s) * kneeAmp - Math.max(0, c) * (run ? 0.12 : 0.06));
    this.#set('rLeg', 0, 0, -Math.max(0, s) * kneeAmp - Math.max(0, -c) * (run ? 0.12 : 0.06));
    this.#set('lAnkle', 0, 0, c * (run ? 0.22 : 0.13) + Math.max(0, s) * 0.08);
    this.#set('rAnkle', 0, 0, -c * (run ? 0.22 : 0.13) + Math.max(0, -s) * 0.08);
    this.#set('lToe', 0, 0, -Math.max(0, -c) * (run ? 0.20 : 0.12));
    this.#set('rToe', 0, 0, -Math.max(0, c) * (run ? 0.20 : 0.12));

    this.#set('lClav', 0, -torsoTwist * 0.20, -s * (run ? 0.055 : 0.030));
    this.#set('rClav', 0, -torsoTwist * 0.20, s * (run ? 0.055 : 0.030));
    this.#set('lArm', -c * (run ? 0.035 : 0.020), torsoTwist * 0.22, -s * armAmp - (run ? 0.08 : 0.03));
    this.#set('rArm', c * (run ? 0.035 : 0.020), torsoTwist * 0.22, s * armAmp + (run ? 0.08 : 0.03));
    this.#set('lForeArm', 0, 0.025, -0.16 - Math.max(0, s) * (run ? 0.50 : 0.26));
    this.#set('rForeArm', 0, -0.025, -0.16 - Math.max(0, -s) * (run ? 0.50 : 0.26));
    this.#set('lHand', c * 0.02, 0, -s * 0.05);
    this.#set('rHand', -c * 0.02, 0, s * 0.05);

    return {
      bob: (0.5 - 0.5 * c2) * (run ? 0.055 : 0.030),
      rollZ: -s * (run ? 0.018 : 0.010),
      tiltX: run ? 0.035 : 0
    };
  }

  #jump(falling) {
    const breathe = Math.sin(this.time * 7.0);
    if (!falling) {
      this.#set('hips', 0, 0, -0.035);
      this.#set('spine', 0, 0, -0.13);
      this.#set('chest', 0, 0, -0.08);
      this.#set('lUpperLeg', 0, 0, 0.42);
      this.#set('rUpperLeg', 0, 0, -0.28);
      this.#set('lLeg', 0, 0, -0.62);
      this.#set('rLeg', 0, 0, -0.48);
      this.#set('lArm', 0, 0, -0.72);
      this.#set('rArm', 0, 0, 0.72);
      this.#set('lForeArm', 0, 0, -0.24);
      this.#set('rForeArm', 0, 0, -0.24);
    } else {
      this.#set('hips', 0, 0, 0.02);
      this.#set('spine', 0, 0, 0.06);
      this.#set('chest', 0, 0, 0.04);
      this.#set('lUpperLeg', 0, 0, -0.18 + breathe * 0.05);
      this.#set('rUpperLeg', 0, 0, 0.24 - breathe * 0.05);
      this.#set('lLeg', 0, 0, -0.38);
      this.#set('rLeg', 0, 0, -0.44);
      this.#set('lArm', 0, 0, -0.30);
      this.#set('rArm', 0, 0, 0.30);
      this.#set('lForeArm', 0, 0, -0.18);
      this.#set('rForeArm', 0, 0, -0.18);
    }
  }

  #land() {
    const p = this.landPulse;
    const squash = p * p;
    this.#set('lUpperLeg', 0, 0, 0.34 * squash);
    this.#set('rUpperLeg', 0, 0, 0.34 * squash);
    this.#set('lLeg', 0, 0, -0.74 * squash);
    this.#set('rLeg', 0, 0, -0.74 * squash);
    this.#set('spine', 0, 0, 0.16 * squash);
    this.#set('chest', 0, 0, 0.09 * squash);
    this.#set('lArm', 0, 0, 0.18 * squash);
    this.#set('rArm', 0, 0, -0.18 * squash);
    return { yOffset: -0.08 * squash, tiltX: 0.025 * squash };
  }

  #crouch(moving, dt) {
    if (moving) this.phase += dt * (5.2 + THREE.MathUtils.clamp(this.speed / 2.0, 0, 1) * 2.2);
    const s = moving ? Math.sin(this.phase) : Math.sin(this.time * 1.3) * 0.06;
    const c = moving ? Math.cos(this.phase) : 0;
    const s2 = moving ? Math.sin(this.phase * 2) : 0;

    this.#set('hips', 0, s2 * 0.025, 0.035);
    this.#set('lUpperLeg', 0, 0, 0.58 + s * 0.24);
    this.#set('rUpperLeg', 0, 0, 0.58 - s * 0.24);
    this.#set('lLeg', 0, 0, -1.02 + Math.max(0, -s) * 0.18);
    this.#set('rLeg', 0, 0, -1.02 + Math.max(0, s) * 0.18);
    this.#set('lAnkle', 0, 0, c * 0.10);
    this.#set('rAnkle', 0, 0, -c * 0.10);
    this.#set('spine', 0, -s * 0.025, -0.23);
    this.#set('chest', 0, s * 0.040, -0.06);
    this.#set('head', 0, -s * 0.018, 0.02);
    this.#set('lArm', 0, 0, -s * 0.26 - 0.08);
    this.#set('rArm', 0, 0, s * 0.26 + 0.08);
    this.#set('lForeArm', 0, 0, -0.20 - Math.max(0, s) * 0.18);
    this.#set('rForeArm', 0, 0, -0.20 - Math.max(0, -s) * 0.18);

    return moving ? { bob: (0.5 - 0.5 * Math.cos(this.phase * 2)) * 0.022, rollZ: -s * 0.008 } : { bob: 0, rollZ: 0 };
  }

  #prone(moving, dt) {
    if (moving) this.phase += dt * (4.8 + THREE.MathUtils.clamp(this.speed / 1.05, 0, 1) * 1.8);
    const s = moving ? Math.sin(this.phase) : Math.sin(this.time * 1.45) * 0.08;
    const c = moving ? Math.cos(this.phase) : 0;

    this.#set('spine', 0, -s * 0.03, -0.10);
    this.#set('chest', 0, s * 0.045, 0.18);
    this.#set('neck', 0, -s * 0.025, -0.12);
    this.#set('head', -0.05, -s * 0.03, -0.24);
    this.#set('lClav', 0, 0, -0.12 + s * 0.08);
    this.#set('rClav', 0, 0, 0.12 - s * 0.08);
    this.#set('lArm', 0, 0, -0.72 + s * 0.28);
    this.#set('rArm', 0, 0, 0.72 - s * 0.28);
    this.#set('lForeArm', 0, 0, -0.70 + Math.max(0, c) * 0.12);
    this.#set('rForeArm', 0, 0, -0.70 + Math.max(0, -c) * 0.12);
    this.#set('lUpperLeg', 0, 0, s * 0.24);
    this.#set('rUpperLeg', 0, 0, -s * 0.24);
    this.#set('lLeg', 0, 0, -0.16 - Math.max(0, -s) * 0.26);
    this.#set('rLeg', 0, 0, -0.16 - Math.max(0, s) * 0.26);
    this.#set('lAnkle', 0, 0, -s * 0.08);
    this.#set('rAnkle', 0, 0, s * 0.08);

    return moving ? { bob: Math.abs(s) * 0.018, rollZ: -s * 0.010 } : { bob: 0, rollZ: 0 };
  }
}
