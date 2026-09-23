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


const BONE_ALIASES = {
  hips: ['hips','pelvis','mixamorighips'],
  spine: ['spine','spine01','mixamorigspine'],
  chest: ['spine1','spine2','chest','upperchest','mixamorigspine1','mixamorigspine2'],
  neck: ['neck','mixamorigneck'],
  head: ['head','mixamorighead'],
  lClav: ['leftclav','leftshoulder','claviclel','shoulderl','mixamorigleftshoulder'],
  rClav: ['rightclav','rightshoulder','clavicler','shoulderr','mixamorigrightshoulder'],
  lUpperLeg: ['leftlegupper','leftupleg','thighl','upperlegl','mixamorigleftupleg'],
  lLeg: ['leftleg','calfl','lowerlegl','mixamorigleftleg'],
  lAnkle: ['leftankle','leftfoot','footl','mixamorigleftfoot'],
  lToe: ['lefttoe','toel','mixamoriglefttoebase'],
  rUpperLeg: ['rightlegupper','rightupleg','thighr','upperlegr','mixamorigrightupleg'],
  rLeg: ['rightleg','calfr','lowerlegr','mixamorigrightleg'],
  rAnkle: ['rightankle','rightfoot','footr','mixamorigrightfoot'],
  rToe: ['righttoe','toer','mixamorigrighttoebase'],
  lArm: ['leftarm','leftupperarm','upperarml','mixamorigleftarm'],
  lForeArm: ['leftforearm','leftlowerarm','forearml','lowerarml','mixamorigleftforearm'],
  lHand: ['lefthand','handl','mixamoriglefthand'],
  rArm: ['rightarm','rightupperarm','upperarmr','mixamorigrightarm'],
  rForeArm: ['rightforearm','rightlowerarm','forearmr','lowerarmr','mixamorigrightforearm'],
  rHand: ['righthand','handr','mixamorigrighthand']
};

function normalizeBoneName(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveBone(bones, key, exactName) {
  const exact = bones.get(exactName);
  if (exact) return exact;
  const aliases = BONE_ALIASES[key] || [];
  for (const bone of bones.values()) {
    const normalized = normalizeBoneName(bone.name);
    if (aliases.some((alias) => normalized === normalizeBoneName(alias))) return bone;
  }
  return null;
}

// V18 memakai preset dasar dari ZUSMO FF PENGATURAN V16 yang diberikan pengguna.
const DEFAULT_ANIMATION = {
  intensity: 1.7,
  walkStride: 1.25,
  runStride: 1.55,
  armSwing: 1.25,
  kneeLift: 0.75,
  bodyBob: 1.0,
  hipSway: 0.8,
  cadence: 1.0,
  blend: 0.95,
  lean: 0.4,
  idleArmDown: 0.35,
  idleElbowBend: 0.35,
  idleArmTwist: 0.0,
  idleShoulderRelax: 0.04,
  idleHandRelax: 0.06,
  idleBreathing: 1.8,
  idleHeadMotion: 1.25
};

const DEFAULT_MOTION = {
  walkSpeed: 4.5,
  runSpeed: 7.5,
  crouchSpeed: 2.3,
  proneSpeed: 0.9
};

const DEFAULT_ACTIONS = {
  walk: { stride: 1, arms: 1, knees: 1, bob: 1, sway: 1, cadence: 1 },
  run: { stride: 1, arms: 1, knees: 1, bob: 1, sway: 1, cadence: 1, lean: 1 },
  jump: { tuck: 1, arms: 1, lean: 1, landing: 1 },
  crouch: { depth: 1, stride: 1, arms: 1, lean: 1, cadence: 1 },
  prone: { bodyPitch: 1.30, groundHeight: 0.10, crawlStride: 1, armReach: 1, legKick: 1, headLift: 1, cadence: 1 },
  punch: { speed: 1, reach: 1, guard: 1, torso: 1, windup: 1 }
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
    this.context = { verticalVelocity: 0, grounded: true };
    this.settings = { ...DEFAULT_ANIMATION };
    this.motion = { ...DEFAULT_MOTION };
    this.actions = JSON.parse(JSON.stringify(DEFAULT_ACTIONS));
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
    this.poseBaseY = this.posePivot?.position?.y || 0;
    this.landPulse = 0;
    this.punchTime = -1;
    this.punchSide = -1;
    this.punchDuration = 0.42;

    for (const [key, name] of Object.entries(BONE_KEYS)) {
      const bone = resolveBone(characterInfo.bones, key, name);
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
    const actions = tuning?.actions || {};
    this.settings = { ...DEFAULT_ANIMATION, ...anim };
    this.motion = { ...DEFAULT_MOTION, ...movement };
    this.actions = {};
    for (const [name, defaults] of Object.entries(DEFAULT_ACTIONS)) {
      this.actions[name] = { ...defaults, ...(actions[name] || {}) };
    }
    this.poseBaseY = Number(tuning?.character?.footOffset) || 0;
    this.punchDuration = 0.42 / THREE.MathUtils.clamp(this.actions.punch.speed, 0.55, 1.8);
  }

  triggerPunch() {
    if (this.punchTime >= 0 && this.punchTime < 0.15) return false;
    this.punchSide *= -1;
    this.punchTime = 0;
    return true;
  }

  setState(state, speed = 0, context = null) {
    if (this.state !== state) {
      this.prevState = this.state;
      this.stateTime = 0;
      if (state === 'LAND') this.landPulse = 1;
      if ((state === 'WALK' || state === 'RUN') && !(this.prevState === 'WALK' || this.prevState === 'RUN')) {
        this.phase = 0.04;
      }
    }
    this.state = state;
    this.speed = speed;
    if (context) this.context = { ...this.context, ...context };
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    this.landPulse = Math.max(0, this.landPulse - dt * 5.8);
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
    let poseLift = 0;
    const state = this.state;

    if (state === 'IDLE') this.#idle();
    else if (state === 'WALK') ({ bob, rollZ, tiltX } = this.#locomotion(false, dt));
    else if (state === 'RUN') ({ bob, rollZ, tiltX } = this.#locomotion(true, dt));
    else if (state === 'JUMP') ({ yOffset, tiltX } = this.#jump(false));
    else if (state === 'FALL') ({ yOffset, tiltX } = this.#jump(true));
    else if (state === 'LAND') ({ yOffset, tiltX } = this.#land());
    else if (state === 'CROUCH_IDLE' || state === 'CROUCH_WALK') {
      const entering = !this.prevState.startsWith('CROUCH');
      const t = entering ? this.#smooth01(this.stateTime / 0.20) : 1;
      yOffset = THREE.MathUtils.lerp(0, -0.39 * this.actions.crouch.depth, t);
      const out = this.#crouch(state === 'CROUCH_WALK', dt, t);
      bob = out.bob; rollZ = out.rollZ; tiltX = out.tiltX;
    } else if (state === 'PRONE_IDLE' || state === 'PRONE_CRAWL') {
      const entering = !this.prevState.startsWith('PRONE');
      const t = entering ? this.#smooth01(this.stateTime / 0.42) : 1;
      const prone = this.actions.prone;
      // Pivot tetap pada kaki, tetapi pose tidak lagi dibuat seperti tubuh
      // telentang lurus. Sudut sedikit kurang dari 90 derajat, dada dinaikkan
      // dari tanah, kepala diangkat, dan siku menopang tubuh.
      tiltX = THREE.MathUtils.lerp(-0.12, -prone.bodyPitch, t);
      yOffset = 0;
      poseLift = THREE.MathUtils.lerp(0, prone.groundHeight, t);
      const out = this.#prone(state === 'PRONE_CRAWL', dt, t);
      bob = out.bob; rollZ = out.rollZ;
    }

    if (this.punchTime >= 0 && !state.startsWith('PRONE')) this.#punchOverlay();

    const b = THREE.MathUtils.clamp(this.settings.blend, 0.55, 2.0);
    const stateBlend = state.startsWith('PRONE') ? 9.5 : state.startsWith('CROUCH') ? 12.5 : state === 'LAND' ? 18 : 15;
    const blend = stateBlend * b;

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

    this.visualYOffset = THREE.MathUtils.damp(this.visualYOffset, yOffset, state.startsWith('PRONE') ? 9 : 13, dt);
    this.visualBob = THREE.MathUtils.damp(this.visualBob, bob, 16 * b, dt);
    this.visualTilt = THREE.MathUtils.damp(this.visualTilt, tiltX, state.startsWith('PRONE') ? 10 : 14 * b, dt);
    this.visualRoll = THREE.MathUtils.damp(this.visualRoll, rollZ, 13 * b, dt);

    if (this.visual) this.visual.position.y = this.baseVisualY + this.visualYOffset + this.visualBob;
    if (this.posePivot) {
      this.posePivot.rotation.x = this.visualTilt;
      this.posePivot.rotation.z = this.visualRoll;
      const targetPoseY = this.poseBaseY + poseLift;
      this.posePivot.position.y = THREE.MathUtils.damp(this.posePivot.position.y, targetPoseY, state.startsWith('PRONE') ? 12 : 18, dt);
    }
  }

  #v(key) { return this.target.get(key); }
  #p(key) { return this.targetPos.get(key); }
  #set(key, x = 0, y = 0, z = 0) { this.#v(key)?.set(x, y, z); }
  #add(key, x = 0, y = 0, z = 0) { const v = this.#v(key); if (v) { v.x += x; v.y += y; v.z += z; } }
  #setPos(key, x = 0, y = 0, z = 0) { this.#p(key)?.set(x, y, z); }
  #smooth01(x) { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  #idleArms(strength = 1, swing = 0) {
    const S = this.settings;
    const I = S.intensity;
    const down = THREE.MathUtils.clamp(S.idleArmDown, 0.26, 0.48) * strength;
    const elbow = THREE.MathUtils.clamp(S.idleElbowBend, 0.07, 0.22) * strength;
    this.#set('lClav', 0, S.idleShoulderRelax * 0.015 * I, 0);
    this.#set('rClav', 0, -S.idleShoulderRelax * 0.015 * I, 0);
    this.#set('lArm', 0, (down + swing) * I, -0.012 * I);
    this.#set('rArm', 0, (-down - swing) * I, -0.012 * I);
    this.#set('lForeArm', 0, 0.012 * I, -elbow * 0.78 * I);
    this.#set('rForeArm', 0, -0.012 * I, -elbow * 0.78 * I);
    this.#set('lHand', 0, 0, -S.idleHandRelax * 0.08 * I);
    this.#set('rHand', 0, 0, -S.idleHandRelax * 0.08 * I);
  }

  #idle() {
    const S = this.settings;
    const I = S.intensity;
    const breathe = Math.sin(this.time * 1.5);
    const slow = Math.sin(this.time * 0.63 + 0.8);
    const micro = Math.sin(this.time * 0.41);
    this.#setPos('hips', micro * 0.0012 * I, breathe * 0.0016 * S.idleBreathing * I, 0);
    this.#set('hips', 0, micro * 0.004 * I, slow * 0.003 * I);
    this.#set('spine', breathe * 0.006 * S.idleBreathing * I, micro * 0.004 * I, 0.008 * I);
    this.#set('chest', -breathe * 0.004 * S.idleBreathing * I, -micro * 0.006 * I, -0.004 * I);
    this.#set('neck', 0, micro * 0.004 * S.idleHeadMotion * I, 0);
    this.#set('head', slow * 0.002 * S.idleHeadMotion * I, -micro * 0.007 * S.idleHeadMotion * I, 0);
    this.#idleArms(1, breathe * 0.003 * S.idleBreathing);
    this.#set('lUpperLeg', 0, 0, 0.006 * I);
    this.#set('rUpperLeg', 0, 0, -0.006 * I);
  }

  #locomotion(runRequested, dt) {
    const S = this.settings;
    const I = S.intensity;
    const A = runRequested ? this.actions.run : this.actions.walk;
    const walkBase = Math.max(0.5, this.motion.walkSpeed);
    const runBase = Math.max(walkBase + 0.1, this.motion.runSpeed);
    const runBlend = runRequested ? this.#smooth01((this.speed - walkBase * 0.92) / Math.max(0.35, runBase - walkBase * 0.92)) : 0;
    const speedNorm = THREE.MathUtils.clamp(this.speed / THREE.MathUtils.lerp(walkBase, runBase, runBlend), 0.28, 1.12);
    const cycleHz = THREE.MathUtils.lerp(1.38, 1.82, runBlend) * THREE.MathUtils.lerp(0.86, 1.05, speedNorm) * S.cadence * A.cadence;
    this.phase = (this.phase + dt * cycleHz) % 1;

    const phase = this.phase * Math.PI * 2;
    const leg = Math.sin(phase);
    const liftL = Math.max(0, leg);
    const liftR = Math.max(0, -leg);
    const backL = Math.max(0, -leg);
    const backR = Math.max(0, leg);
    const doubleStep = Math.cos(phase * 2);

    const hipAmp = THREE.MathUtils.lerp(0.235, 0.405, runBlend) * THREE.MathUtils.lerp(S.walkStride, S.runStride, runBlend) * A.stride * I;
    const kneeBase = THREE.MathUtils.lerp(0.08, 0.12, runBlend) * S.kneeLift * A.knees * I;
    const kneeFront = THREE.MathUtils.lerp(0.25, 0.47, runBlend) * S.kneeLift * A.knees * I;
    const kneeBack = THREE.MathUtils.lerp(0.12, 0.35, runBlend) * S.kneeLift * A.knees * I;
    const ankleAmp = THREE.MathUtils.lerp(0.035, 0.070, runBlend) * I;

    const bobAmp = THREE.MathUtils.lerp(0.006, 0.010, runBlend) * S.bodyBob * A.bob * I;
    const swayAmp = THREE.MathUtils.lerp(0.010, 0.017, runBlend) * S.hipSway * A.sway * I;
    const hipYaw = -leg * THREE.MathUtils.lerp(0.018, 0.030, runBlend) * S.hipSway * I;
    const torsoYaw = -hipYaw * 1.45;
    const lean = -THREE.MathUtils.lerp(0.018, 0.105, runBlend) * S.lean * (A.lean ?? 1) * I;

    this.#setPos('hips', Math.sin(phase) * swayAmp * 0.16, (1 - doubleStep) * 0.5 * bobAmp, 0);
    this.#set('hips', 0, hipYaw, Math.cos(phase) * swayAmp);
    this.#set('spine', 0, torsoYaw * 0.42, lean * 0.55);
    this.#set('chest', 0, torsoYaw, lean * 0.45);
    this.#set('neck', 0, -torsoYaw * 0.20, -lean * 0.08);
    this.#set('head', 0, -torsoYaw * 0.12, -Math.cos(phase) * swayAmp * 0.12);

    this.#set('lUpperLeg', 0, 0, leg * hipAmp);
    this.#set('rUpperLeg', 0, 0, -leg * hipAmp);
    this.#set('lLeg', 0, 0, -(kneeBase + liftL * kneeFront + backL * kneeBack));
    this.#set('rLeg', 0, 0, -(kneeBase + liftR * kneeFront + backR * kneeBack));
    this.#set('lAnkle', 0, 0, (-leg * ankleAmp + backL * 0.025 * I));
    this.#set('rAnkle', 0, 0, (leg * ankleAmp + backR * 0.025 * I));
    this.#set('lToe', 0, 0, -backL * THREE.MathUtils.lerp(0.025, 0.065, runBlend) * I);
    this.#set('rToe', 0, 0, -backR * THREE.MathUtils.lerp(0.025, 0.065, runBlend) * I);

    // Free Fire reference: the forward arm is strongly elbow-bent near the
    // chest; the rear arm extends back but never flies far away from the torso.
    const armAmp = THREE.MathUtils.lerp(0.13, 0.30, runBlend) * S.armSwing * A.arms * I;
    const down = THREE.MathUtils.lerp(0.37, 0.31, runBlend) * I;
    const frontBend = THREE.MathUtils.lerp(0.34, 0.82, runBlend) * I;
    const rearBend = THREE.MathUtils.lerp(0.18, 0.30, runBlend) * I;
    const lForward = liftR; // opposite the left leg
    const rForward = liftL;
    const lElbow = rearBend + lForward * (frontBend - rearBend);
    const rElbow = rearBend + rForward * (frontBend - rearBend);

    this.#set('lClav', 0, 0.004 * I, -torsoYaw * 0.08);
    this.#set('rClav', 0, -0.004 * I, -torsoYaw * 0.08);
    this.#set('lArm', 0, down, leg * armAmp - 0.018 * I);
    this.#set('rArm', 0, -down, -leg * armAmp - 0.018 * I);
    this.#set('lForeArm', 0, 0.014 * I, -lElbow);
    this.#set('rForeArm', 0, -0.014 * I, -rElbow);
    this.#set('lHand', 0, 0, -0.015 * I);
    this.#set('rHand', 0, 0, -0.015 * I);

    return {
      bob: (1 - doubleStep) * 0.5 * bobAmp * 0.28,
      rollZ: -Math.cos(phase) * swayAmp * 0.24,
      tiltX: THREE.MathUtils.lerp(0, -0.035, runBlend) * S.lean * (A.lean ?? 1) * I
    };
  }

  #jump(falling) {
    const I = this.settings.intensity;
    const A = this.actions.jump;
    const t = this.#smooth01(Math.min(1, this.stateTime / (falling ? 0.18 : 0.16)));
    const leadLeft = Math.sin(this.phase * Math.PI * 2) >= 0;
    const lead = (falling ? 0.26 : THREE.MathUtils.lerp(0.20, 0.34, t)) * A.tuck;
    const trail = (falling ? 0.10 : THREE.MathUtils.lerp(0.08, 0.15, t)) * A.tuck;
    const leadKnee = (falling ? 0.46 : THREE.MathUtils.lerp(0.34, 0.64, t)) * A.tuck;
    const trailKnee = (falling ? 0.25 : THREE.MathUtils.lerp(0.18, 0.32, t)) * A.tuck;

    this.#set('hips', 0, 0, (falling ? 0.012 : -0.018) * I);
    this.#set('spine', 0, 0, (falling ? 0.018 : -0.055) * I);
    this.#set('chest', 0, 0, (falling ? 0.008 : -0.025) * I);
    this.#set('lUpperLeg', 0, 0, (leadLeft ? lead : trail) * I);
    this.#set('rUpperLeg', 0, 0, (leadLeft ? trail : lead) * I);
    this.#set('lLeg', 0, 0, -(leadLeft ? leadKnee : trailKnee) * I);
    this.#set('rLeg', 0, 0, -(leadLeft ? trailKnee : leadKnee) * I);
    this.#set('lAnkle', 0, 0, 0.035 * I);
    this.#set('rAnkle', 0, 0, 0.035 * I);

    // Reference jump silhouette: shoulders open briefly at take-off, then both
    // forearms come forward with elbows bent while one knee leads.
    const armOpen = (falling ? 0.05 : (1 - t) * 0.12) * A.arms;
    this.#set('lArm', 0, (0.29 - armOpen) * I * A.arms, (-0.16 - armOpen) * I * A.arms);
    this.#set('rArm', 0, (-0.29 + armOpen) * I * A.arms, (-0.16 - armOpen) * I * A.arms);
    this.#set('lForeArm', 0, 0.012 * I, -(falling ? 0.54 : 0.72) * I * A.arms);
    this.#set('rForeArm', 0, -0.012 * I, -(falling ? 0.54 : 0.72) * I * A.arms);
    return { yOffset: 0, tiltX: (falling ? -0.015 : -0.045) * I * A.lean };
  }

  #land() {
    const I = this.settings.intensity;
    const A = this.actions.jump;
    const p = THREE.MathUtils.clamp(this.landPulse, 0, 1);
    const squash = p * p * A.landing;
    this.#setPos('hips', 0, -0.028 * squash * I, 0);
    this.#set('hips', 0, 0, 0.050 * squash * I);
    this.#set('lUpperLeg', 0, 0, 0.44 * squash * I);
    this.#set('rUpperLeg', 0, 0, 0.44 * squash * I);
    this.#set('lLeg', 0, 0, -0.82 * squash * I);
    this.#set('rLeg', 0, 0, -0.82 * squash * I);
    this.#set('spine', 0, 0, -0.11 * squash * I);
    this.#set('chest', 0, 0, -0.045 * squash * I);
    this.#set('lArm', 0, 0.34 * I, -0.10 * squash * I);
    this.#set('rArm', 0, -0.34 * I, -0.10 * squash * I);
    this.#set('lForeArm', 0, 0.012 * I, -(0.28 + 0.18 * squash) * I);
    this.#set('rForeArm', 0, -0.012 * I, -(0.28 + 0.18 * squash) * I);
    return { yOffset: -0.035 * squash, tiltX: -0.055 * squash * I };
  }

  #crouch(moving, dt, transition = 1) {
    const S = this.settings;
    const I = S.intensity;
    const A = this.actions.crouch;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.3, this.motion.crouchSpeed), 0, 1.1);
    if (moving) this.phase = (this.phase + dt * (1.02 + speedNorm * 0.32) * S.cadence * A.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const step = moving ? Math.sin(p) * A.stride : 0;
    const t = transition;

    this.#set('hips', 0, step * 0.012 * S.hipSway * I * t, 0.08 * I * t);
    this.#set('lUpperLeg', 0, 0, (0.90 * A.depth + step * 0.11) * I * t);
    this.#set('rUpperLeg', 0, 0, (0.90 * A.depth - step * 0.11) * I * t);
    this.#set('lLeg', 0, 0, (-1.32 * A.depth - Math.max(0, -step) * 0.10) * I * t);
    this.#set('rLeg', 0, 0, (-1.32 * A.depth - Math.max(0, step) * 0.10) * I * t);
    this.#set('lAnkle', 0, 0, (0.16 + Math.cos(p) * 0.04 * (moving ? 1 : 0)) * I * t);
    this.#set('rAnkle', 0, 0, (0.16 - Math.cos(p) * 0.04 * (moving ? 1 : 0)) * I * t);
    this.#set('spine', 0, -step * 0.018 * I * t, -0.24 * A.lean * I * t);
    this.#set('chest', 0, step * 0.020 * I * t, -0.10 * A.lean * I * t);
    this.#set('neck', 0, 0, 0.055 * I * t);

    const arm = moving ? step * 0.07 * S.armSwing * A.arms * I : 0;
    this.#set('lArm', 0, 0.37 * I * t, (-0.10 + arm) * I * t);
    this.#set('rArm', 0, -0.37 * I * t, (-0.10 - arm) * I * t);
    this.#set('lForeArm', 0, 0.016 * I * t, -0.54 * I * t);
    this.#set('rForeArm', 0, -0.016 * I * t, -0.54 * I * t);

    return {
      bob: moving ? Math.abs(Math.sin(p)) * 0.006 * S.bodyBob * I * t : 0,
      rollZ: moving ? -step * 0.008 * S.hipSway * I * t : 0,
      tiltX: -0.115 * A.lean * I * t
    };
  }

  #prone(moving, dt, transition = 1) {
    const S = this.settings;
    const I = S.intensity;
    const A = this.actions.prone;
    const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(0.2, this.motion.proneSpeed), 0, 1.1);
    if (moving) this.phase = (this.phase + dt * (0.72 + speedNorm * 0.26) * S.cadence * A.cadence) % 1;
    const p = this.phase * Math.PI * 2;
    const s = moving ? Math.sin(p) * A.crawlStride : Math.sin(this.time * 1.0) * 0.035;
    const t = transition;
    const crouch = 1 - t;

    // The reference transition goes through a deep crouch/hands-down phase
    // before the torso reaches the floor. Blend from that silhouette instead
    // of fading from a standing rest pose.
    this.#set('hips', 0, 0, (0.08 * crouch) * I);
    this.#set('spine', 0, -s * 0.020 * I * t, (-0.24 * crouch - 0.03 * t) * I);
    this.#set('chest', 0, s * 0.025 * I * t, (-0.10 * crouch + 0.10 * t) * I);
    this.#set('neck', 0, -s * 0.010 * I * t, (0.055 * crouch - 0.12 * A.headLift * t) * I);
    this.#set('head', -0.03 * I * t, -s * 0.012 * I * t, -0.16 * A.headLift * I * t);

    // Elbows planted in front of the chest in prone; during the first half of
    // the transition they move forward from the crouch/thigh position.
    this.#set('lArm', 0, (0.37 * crouch + 0.31 * t) * I, (-0.10 * crouch + (-0.34 * A.armReach + s * 0.09) * t) * I);
    this.#set('rArm', 0, (-0.37 * crouch - 0.31 * t) * I, (-0.10 * crouch + (-0.34 * A.armReach - s * 0.09) * t) * I);
    this.#set('lForeArm', 0, 0.014 * I, (-0.54 * crouch + (-0.92 * A.armReach - s * 0.15) * t) * I);
    this.#set('rForeArm', 0, -0.014 * I, (-0.54 * crouch + (-0.92 * A.armReach + s * 0.15) * t) * I);

    // Folded crouch legs progressively extend behind the character.
    this.#set('lUpperLeg', 0, 0, (0.90 * crouch + (0.04 + s * 0.09 * A.legKick) * t) * I);
    this.#set('rUpperLeg', 0, 0, (0.90 * crouch + (0.04 - s * 0.09 * A.legKick) * t) * I);
    this.#set('lLeg', 0, 0, (-1.32 * crouch + (-0.12 - Math.max(0, -s) * 0.15 * A.legKick) * t) * I);
    this.#set('rLeg', 0, 0, (-1.32 * crouch + (-0.12 - Math.max(0, s) * 0.15 * A.legKick) * t) * I);
    this.#set('lAnkle', 0, 0, (0.16 * crouch - s * 0.035 * t) * I);
    this.#set('rAnkle', 0, 0, (0.16 * crouch + s * 0.035 * t) * I);

    return moving ? {
      bob: Math.abs(s) * 0.004 * S.bodyBob * I * t,
      rollZ: -s * 0.006 * S.hipSway * I * t
    } : { bob: 0, rollZ: 0 };
  }

  #punchOverlay() {
    const I = this.settings.intensity;
    const A = this.actions.punch;
    const u = THREE.MathUtils.clamp(this.punchTime / this.punchDuration, 0, 1);
    const wind = u < 0.20 ? this.#smooth01(u / 0.20) : 1;
    const strike = u < 0.20 ? 0 : u < 0.48 ? this.#smooth01((u - 0.20) / 0.28) : 1;
    const recover = u < 0.48 ? 0 : this.#smooth01((u - 0.48) / 0.52);
    const hit = strike * (1 - recover);
    const prep = wind * (1 - strike);
    const rightPunch = this.punchSide < 0;
    const punchArm = rightPunch ? 'rArm' : 'lArm';
    const punchFore = rightPunch ? 'rForeArm' : 'lForeArm';
    const guardArm = rightPunch ? 'lArm' : 'rArm';
    const guardFore = rightPunch ? 'lForeArm' : 'rForeArm';
    const sideSign = rightPunch ? -1 : 1;
    const guardSign = -sideSign;
    const torso = sideSign * (0.10 * prep * A.windup + 0.22 * hit) * I * A.torso;

    this.#add('hips', 0, torso * 0.26, 0);
    this.#add('spine', 0, torso * 0.55, -0.035 * hit * I);
    this.#add('chest', 0, torso, -0.055 * hit * I);

    // Clear wind-up then visible extension. The rear/guard hand remains by the
    // cheek/chest instead of dropping to the side.
    this.#add(punchArm, 0, sideSign * (0.04 * prep * A.windup - 0.01 * hit) * I, (-0.28 * prep * A.windup - 0.78 * hit * A.reach) * I);
    this.#add(punchFore, 0, sideSign * 0.014 * I, (-0.88 * prep * A.windup + 0.60 * hit * A.reach) * I);
    this.#add(guardArm, 0, guardSign * 0.03 * I, -0.17 * (wind + hit) * I * A.guard);
    this.#add(guardFore, 0, guardSign * 0.010 * I, -0.72 * (wind + hit) * I * A.guard);
  }
}
