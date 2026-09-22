export class MobileInput {
  constructor() {
    this.moveX = 0;
    this.moveY = 0;
    this.run = false;
    this.runButtonHeld = false;
    this.dragSprint = false;
    this.crouch = false;
    this.prone = false;
    this.jumpQueued = false;
    this.cameraDX = 0;
    this.cameraDY = 0;
    this.joystickPointer = null;
    this.cameraPointer = null;
    this.enabled = false;

    this.joystick = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');
    this.cameraZone = document.getElementById('camera-zone');
    this.runButton = document.getElementById('action-run');
    this.jumpButton = document.getElementById('action-jump');
    this.crouchButton = document.getElementById('action-crouch');
    this.proneButton = document.getElementById('action-prone');
    this.#bind();
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) this.reset();
  }

  reset() {
    this.moveX = this.moveY = 0;
    this.run = this.runButtonHeld = this.dragSprint = false;
    this.crouch = this.prone = false;
    this.jumpQueued = false;
    this.cameraDX = this.cameraDY = 0;
    this.joystickPointer = this.cameraPointer = null;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.runButton.classList.remove('active');
    this.crouchButton.classList.remove('active');
    this.proneButton.classList.remove('active');
  }

  consumeJump() {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  consumeCameraDelta() {
    const out = { x: this.cameraDX, y: this.cameraDY };
    this.cameraDX = this.cameraDY = 0;
    return out;
  }

  #syncRun() {
    this.run = !!(this.runButtonHeld || this.dragSprint);
    this.runButton.classList.toggle('active', this.run);
  }

  #bind() {
    const endJoystick = (e) => {
      if (e.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.moveX = this.moveY = 0;
      this.dragSprint = false;
      this.#syncRun();
      this.knob.style.transform = 'translate(0px, 0px)';
    };
    this.joystick.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.joystickPointer !== null) return;
      this.joystickPointer = e.pointerId;
      this.joystick.setPointerCapture?.(e.pointerId);
      this.#updateJoystick(e);
      e.preventDefault();
    });
    this.joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joystickPointer) this.#updateJoystick(e);
    });
    this.joystick.addEventListener('pointerup', endJoystick);
    this.joystick.addEventListener('pointercancel', endJoystick);

    let lastX = 0, lastY = 0;
    const endCamera = (e) => { if (e.pointerId === this.cameraPointer) this.cameraPointer = null; };
    this.cameraZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.cameraPointer !== null) return;
      this.cameraPointer = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      this.cameraZone.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    this.cameraZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.cameraPointer) return;
      this.cameraDX += e.clientX - lastX;
      this.cameraDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    });
    this.cameraZone.addEventListener('pointerup', endCamera);
    this.cameraZone.addEventListener('pointercancel', endCamera);

    const setRunButton = (v) => {
      if (!this.enabled) return;
      this.runButtonHeld = v;
      this.#syncRun();
    };
    this.runButton.addEventListener('pointerdown', (e) => {
      setRunButton(true);
      this.runButton.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    this.runButton.addEventListener('pointerup', () => setRunButton(false));
    this.runButton.addEventListener('pointercancel', () => setRunButton(false));
    this.runButton.addEventListener('lostpointercapture', () => setRunButton(false));

    this.jumpButton.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.jumpQueued = true;
      e.preventDefault();
    });
    this.crouchButton.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.crouch = !this.crouch;
      if (this.crouch) this.prone = false;
      this.crouchButton.classList.toggle('active', this.crouch);
      this.proneButton.classList.toggle('active', this.prone);
      e.preventDefault();
    });
    this.proneButton.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.prone = !this.prone;
      if (this.prone) this.crouch = false;
      this.proneButton.classList.toggle('active', this.prone);
      this.crouchButton.classList.toggle('active', this.crouch);
      e.preventDefault();
    });
  }

  #updateJoystick(e) {
    const r = this.joystick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = r.width * 0.34;
    const rawDx = e.clientX - cx;
    const rawDy = e.clientY - cy;
    let dx = rawDx;
    let dy = rawDy;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = dx / len * radius; dy = dy / len * radius; }
    this.moveX = dx / radius;
    this.moveY = -dy / radius;

    // Drag slightly above the normal joystick radius to sprint, matching the
    // familiar mobile Free Fire control pattern. RUN button still works too.
    this.dragSprint = rawDy < -radius * 1.12 && Math.abs(rawDx) < radius * 1.05;
    this.#syncRun();
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
