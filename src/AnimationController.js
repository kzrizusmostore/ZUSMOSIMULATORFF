import * as THREE from 'three';

const BONE_KEYS = {
  hips: 'bone_Hips_01',
  spine: 'bone_Spine_011',
  chest: 'bone_Spine1_012',
  neck: 'bone_Neck_030',
  head: 'bone_Head_031',
  lUpperLeg: 'bone_LeftLegUpper_03',
  lLeg: 'bone_LeftLeg_04',
  lAnkle: 'bone_LeftAnkle_05',
  rUpperLeg: 'bone_RightLegUpper_07',
  rLeg: 'bone_RightLeg_08',
  rAnkle: 'bone_RightAnkle_09',
  lArm: 'bone_LeftArm_016',
  lForeArm: 'bone_LeftForeArm_017',
  rArm: 'bone_RightArm_044',
  rForeArm: 'bone_RightForeArm_045'
};

export class AnimationController {
  constructor(characterInfo, baseVisualY = 0) {
    this.info = characterInfo;
    this.visual = characterInfo.visual;
    this.posePivot = characterInfo.posePivot;
    this.baseVisualY = baseVisualY;
    this.time = 0;
    this.state = 'IDLE';
    this.speed = 0;
    this.rest = new Map();
    this.current = new Map();
    this.target = new Map();
    this.tmpQ = new THREE.Quaternion();
    this.tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this.visualYOffset = 0;
    this.visualTilt = 0;
    this.landPulse = 0;

    for (const [key, name] of Object.entries(BONE_KEYS)) {
      const bone = characterInfo.bones.get(name);
      if (!bone) continue;
      this.rest.set(key, { bone, quaternion: bone.quaternion.clone(), position: bone.position.clone() });
      this.current.set(key, new THREE.Vector3());
      this.target.set(key, new THREE.Vector3());
    }
  }

  setState(state, speed = 0) {
    if (this.state !== state && state === 'LAND') this.landPulse = 1;
    this.state = state;
    this.speed = speed;
  }

  update(dt) {
    this.time += dt;
    this.landPulse = Math.max(0, this.landPulse - dt * 5.5);
    for (const v of this.target.values()) v.set(0, 0, 0);

    let yOffset = 0;
    let tiltX = 0;
    const state = this.state;

    if (state === 'IDLE') this.#idle();
    else if (state === 'WALK') this.#walk(false);
    else if (state === 'RUN') this.#walk(true);
    else if (state === 'JUMP') this.#jump(false);
    else if (state === 'FALL') this.#jump(true);
    else if (state === 'LAND') this.#land();
    else if (state === 'CROUCH_IDLE') { yOffset = -0.10; this.#crouch(false); }
    else if (state === 'CROUCH_WALK') { yOffset = -0.10; this.#crouch(true); }
    else if (state === 'PRONE_IDLE') { yOffset = -0.02; tiltX = 1.34; this.#prone(false); }
    else if (state === 'PRONE_CRAWL') { yOffset = -0.02; tiltX = 1.34; this.#prone(true); }

    const blend = state.startsWith('PRONE') ? 10 : state.startsWith('CROUCH') ? 12 : 15;
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

    this.visualYOffset = THREE.MathUtils.damp(this.visualYOffset, yOffset, 11, dt);
    this.visualTilt = THREE.MathUtils.damp(this.visualTilt, tiltX, 10, dt);
    if (this.visual) this.visual.position.y = this.baseVisualY + this.visualYOffset;
    if (this.posePivot) this.posePivot.rotation.x = this.visualTilt;
  }

  #v(key) { return this.target.get(key); }

  #idle() {
    const breathe = Math.sin(this.time * 2.15);
    const micro = Math.sin(this.time * 0.73);
    this.#v('spine')?.set(0, 0, breathe * 0.018);
    this.#v('chest')?.set(0, 0, -breathe * 0.012);
    this.#v('head')?.set(0, micro * 0.018, micro * 0.012);
    this.#v('lArm')?.set(0, 0, 0.025 + breathe * 0.01);
    this.#v('rArm')?.set(0, 0, -0.025 - breathe * 0.01);
    this.#v('lForeArm')?.set(0, 0, -0.04);
    this.#v('rForeArm')?.set(0, 0, -0.04);
  }

  #walk(run) {
    const cadence = run ? 10.8 : 7.2;
    const ampLeg = run ? 0.82 : 0.50;
    const ampArm = run ? 0.68 : 0.40;
    const s = Math.sin(this.time * cadence);
    const c = Math.cos(this.time * cadence);
    this.#v('lUpperLeg')?.set(0, 0, s * ampLeg);
    this.#v('rUpperLeg')?.set(0, 0, -s * ampLeg);
    this.#v('lLeg')?.set(0, 0, -Math.max(0, -s) * (run ? 0.72 : 0.44));
    this.#v('rLeg')?.set(0, 0, -Math.max(0, s) * (run ? 0.72 : 0.44));
    this.#v('lAnkle')?.set(0, 0, c * (run ? 0.14 : 0.08));
    this.#v('rAnkle')?.set(0, 0, -c * (run ? 0.14 : 0.08));
    this.#v('lArm')?.set(0, 0, -s * ampArm);
    this.#v('rArm')?.set(0, 0, s * ampArm);
    this.#v('lForeArm')?.set(0, 0, -0.10 - Math.max(0, s) * (run ? 0.35 : 0.17));
    this.#v('rForeArm')?.set(0, 0, -0.10 - Math.max(0, -s) * (run ? 0.35 : 0.17));
    this.#v('spine')?.set(0, c * (run ? 0.045 : 0.025), run ? -0.105 : -0.025);
    this.#v('chest')?.set(0, -c * (run ? 0.035 : 0.018), 0);
  }

  #jump(falling) {
    const sign = falling ? -1 : 1;
    this.#v('lUpperLeg')?.set(0, 0, 0.28 * sign);
    this.#v('rUpperLeg')?.set(0, 0, -0.18 * sign);
    this.#v('lLeg')?.set(0, 0, -0.48);
    this.#v('rLeg')?.set(0, 0, -0.35);
    this.#v('lArm')?.set(0, 0, falling ? -0.20 : -0.50);
    this.#v('rArm')?.set(0, 0, falling ? 0.20 : 0.50);
    this.#v('spine')?.set(0, 0, falling ? 0.05 : -0.08);
  }

  #land() {
    const p = this.landPulse;
    this.#v('lUpperLeg')?.set(0, 0, 0.18 * p);
    this.#v('rUpperLeg')?.set(0, 0, 0.18 * p);
    this.#v('lLeg')?.set(0, 0, -0.42 * p);
    this.#v('rLeg')?.set(0, 0, -0.42 * p);
    this.#v('spine')?.set(0, 0, 0.08 * p);
  }

  #crouch(moving) {
    const s = moving ? Math.sin(this.time * 5.3) : 0;
    this.#v('lUpperLeg')?.set(0, 0, 0.50 + s * 0.18);
    this.#v('rUpperLeg')?.set(0, 0, 0.50 - s * 0.18);
    this.#v('lLeg')?.set(0, 0, -0.92 + Math.max(0, -s) * 0.12);
    this.#v('rLeg')?.set(0, 0, -0.92 + Math.max(0, s) * 0.12);
    this.#v('spine')?.set(0, 0, -0.16);
    this.#v('lArm')?.set(0, 0, -s * 0.16);
    this.#v('rArm')?.set(0, 0, s * 0.16);
  }

  #prone(moving) {
    const s = moving ? Math.sin(this.time * 4.7) : Math.sin(this.time * 1.5) * 0.08;
    this.#v('spine')?.set(0, 0, -0.08);
    this.#v('chest')?.set(0, 0, 0.12);
    this.#v('head')?.set(-0.05, 0, -0.20);
    this.#v('lArm')?.set(0, 0, -0.62 + s * 0.20);
    this.#v('rArm')?.set(0, 0, 0.62 - s * 0.20);
    this.#v('lForeArm')?.set(0, 0, -0.55);
    this.#v('rForeArm')?.set(0, 0, -0.55);
    this.#v('lUpperLeg')?.set(0, 0, s * 0.18);
    this.#v('rUpperLeg')?.set(0, 0, -s * 0.18);
    this.#v('lLeg')?.set(0, 0, -0.12 - Math.max(0, -s) * 0.18);
    this.#v('rLeg')?.set(0, 0, -0.12 - Math.max(0, s) * 0.18);
  }
}
