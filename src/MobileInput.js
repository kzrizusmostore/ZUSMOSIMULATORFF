export class MobileInput {
  constructor() {
    this.moveX = 0;
    this.moveY = 0;
    this.run = false;
    this.crouch = false;
    this.prone = false;
    this.jumpQueued = false;
    this.punchQueued = 0;
    this.punchHeld = false;
    this.punchHoldTimer = null;
    this.punchRepeatTimer = null;
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
    this.punchButton = document.getElementById('action-punch');
    this.#bind();
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) this.reset();
  }

  reset() {
    this.moveX = this.moveY = 0;
    this.run = false;
    this.crouch = this.prone = false;
    this.jumpQueued = false;
    this.punchQueued = 0;
    this.#stopPunchRepeat();
    this.cameraDX = this.cameraDY = 0;
    this.joystickPointer = this.cameraPointer = null;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.runButton.classList.remove('active');
    this.crouchButton.classList.remove('active');
    this.proneButton.classList.remove('active');
    this.punchButton?.classList.remove('active');
  }

  consumeJump() {
    const value = this.jumpQueued;
    this.jumpQueued = false;
    return value;
  }

  consumePunch() {
    if (this.punchQueued <= 0) return false;
    this.punchQueued -= 1;
    return true;
  }

  consumeCameraDelta() {
    const out = { x: this.cameraDX, y: this.cameraDY };
    this.cameraDX = this.cameraDY = 0;
    return out;
  }

  #bind() {
    // Analog versi awal: 360 derajat penuh, tanpa drag-to-sprint dan tanpa
    // penguncian arah. Posisi stik langsung menjadi moveX/moveY.
    const endJoystick = (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.moveX = this.moveY = 0;
      this.knob.style.transform = 'translate(0px, 0px)';
    };

    this.joystick.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.joystickPointer !== null) return;
      this.joystickPointer = event.pointerId;
      this.joystick.setPointerCapture?.(event.pointerId);
      this.#updateJoystick(event);
      event.preventDefault();
    });
    this.joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.joystickPointer) this.#updateJoystick(event);
    });
    this.joystick.addEventListener('pointerup', endJoystick);
    this.joystick.addEventListener('pointercancel', endJoystick);
    this.joystick.addEventListener('lostpointercapture', endJoystick);

    let lastX = 0;
    let lastY = 0;
    const endCamera = (event) => {
      if (event.pointerId === this.cameraPointer) this.cameraPointer = null;
    };
    this.cameraZone.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.cameraPointer !== null) return;
      this.cameraPointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      this.cameraZone.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    this.cameraZone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.cameraPointer) return;
      this.cameraDX += event.clientX - lastX;
      this.cameraDY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    });
    this.cameraZone.addEventListener('pointerup', endCamera);
    this.cameraZone.addEventListener('pointercancel', endCamera);
    this.cameraZone.addEventListener('lostpointercapture', endCamera);

    const setRun = (value) => {
      if (!this.enabled) return;
      this.run = value;
      this.runButton.classList.toggle('active', value);
    };
    this.runButton.addEventListener('pointerdown', (event) => {
      setRun(true);
      this.runButton.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    this.runButton.addEventListener('pointerup', () => setRun(false));
    this.runButton.addEventListener('pointercancel', () => setRun(false));
    this.runButton.addEventListener('lostpointercapture', () => setRun(false));

    this.jumpButton.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      this.jumpQueued = true;
      event.preventDefault();
    });

    const queuePunch = () => { this.punchQueued = Math.min(2, this.punchQueued + 1); };
    const stopPunch = () => {
      this.punchHeld = false;
      this.#stopPunchRepeat();
      this.punchButton?.classList.remove('active');
    };
    this.punchButton?.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      this.punchHeld = true;
      queuePunch();
      this.punchButton.classList.add('active');
      this.punchButton.setPointerCapture?.(event.pointerId);
      this.punchHoldTimer = setTimeout(() => {
        if (!this.punchHeld) return;
        queuePunch();
        this.punchRepeatTimer = setInterval(() => {
          if (this.punchHeld) queuePunch();
        }, 410);
      }, 230);
      event.preventDefault();
    });
    this.punchButton?.addEventListener('pointerup', stopPunch);
    this.punchButton?.addEventListener('pointercancel', stopPunch);
    this.punchButton?.addEventListener('lostpointercapture', stopPunch);

    this.crouchButton.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      this.crouch = !this.crouch;
      if (this.crouch) this.prone = false;
      this.crouchButton.classList.toggle('active', this.crouch);
      this.proneButton.classList.toggle('active', this.prone);
      event.preventDefault();
    });

    this.proneButton.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      this.prone = !this.prone;
      if (this.prone) this.crouch = false;
      this.proneButton.classList.toggle('active', this.prone);
      this.crouchButton.classList.toggle('active', this.crouch);
      event.preventDefault();
    });
  }

  #stopPunchRepeat() {
    if (this.punchHoldTimer) clearTimeout(this.punchHoldTimer);
    if (this.punchRepeatTimer) clearInterval(this.punchRepeatTimer);
    this.punchHoldTimer = null;
    this.punchRepeatTimer = null;
  }

  #updateJoystick(event) {
    const rect = this.joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width * 0.34;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = dx / length * radius;
      dy = dy / length * radius;
    }
    this.moveX = dx / radius;
    this.moveY = -dy / radius;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
