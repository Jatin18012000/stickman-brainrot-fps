// Keyboard, mouse and pointer-lock handling. Keys are tracked by physical
// position (event.code) so WASD works on AZERTY/QWERTZ keyboards too.

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

// Some browsers report a huge movementX/Y spike when the pointer is captured
// (the cursor's jump to the lock point) and occasionally at random. No real
// flick moves this far in a single event, so such events are dropped.
const MAX_MOUSE_STEP = 300;

export class InputManager {
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.fireHeld = false;
    this.locked = false;
    this.ignoreMouseUntil = 0;
    this.lockedOnLastMove = false;
    this.onLockChange = null;
    this.onLockError = null;

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.locked && MOVE_KEYS.has(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());

    document.addEventListener('mousemove', (e) => {
      // Read the lock state directly: pointerlockchange can arrive after the
      // first locked mousemove events.
      const lockedNow = document.pointerLockElement === this.lockTarget;
      const firstLocked = lockedNow && !this.lockedOnLastMove;
      this.lockedOnLastMove = lockedNow;
      if (!lockedNow || !this.locked || firstLocked || performance.now() < this.ignoreMouseUntil) return;
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      if (Math.abs(mx) > MAX_MOUSE_STEP || Math.abs(my) > MAX_MOUSE_STEP) return;
      this.mouseDX += mx;
      this.mouseDY += my;
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
      // The first movement event after capture can carry the cursor's whole
      // jump to the lock point; ignore input for a moment so the view doesn't snap.
      if (this.locked) this.ignoreMouseUntil = performance.now() + 80;
      if (this.locked) this.consumeMouse();
      else this.clear();
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
