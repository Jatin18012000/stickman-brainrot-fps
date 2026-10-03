// Keyboard, mouse and pointer-lock handling. Keys are tracked by physical
// position (event.code) so WASD works on AZERTY/QWERTZ keyboards too.

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

// Some platforms report a huge movementX/Y spike on the first event after the
// pointer is captured. Clamping one event stops the view snapping sideways.
const MAX_MOUSE_STEP = 250;

export class InputManager {
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.fireHeld = false;
    this.locked = false;
    this.onLockChange = null;
    this.onLockError = null;

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.locked && MOVE_KEYS.has(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += clamp(e.movementX || 0, -MAX_MOUSE_STEP, MAX_MOUSE_STEP);
      this.mouseDY += clamp(e.movementY || 0, -MAX_MOUSE_STEP, MAX_MOUSE_STEP);
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.fireHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget;
      if (!this.locked) this.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockError) this.onLockError();
    });
  }

  requestLock() {
    try {
      const result = this.lockTarget.requestPointerLock();
      // Chrome returns a promise that rejects if the request comes too soon
      // after the user pressed ESC; other browsers fire pointerlockerror.
      if (result && typeof result.catch === 'function') {
        result.catch(() => { if (this.onLockError) this.onLockError(); });
      }
    } catch (err) {
      if (this.onLockError) this.onLockError();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  clear() {
    this.keys.clear();
    this.fireHeld = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  consumeMouse() {
    const delta = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  down(code) {
    return this.keys.has(code);
  }

  // Returns { forward, strafe } each in -1..1.
  moveAxes() {
    const forward = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
      - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const strafe = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
      - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
