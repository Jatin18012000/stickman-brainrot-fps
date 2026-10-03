import * as THREE from 'three';
import { ARENA_HALF } from './arena.js';

export const BASE_MOVE_SPEED = 7; // metres per second at 1.00x speed
const EYE_HEIGHT = 1.6;
const RADIUS = 0.4;
const BASE_SENSITIVITY = 0.0022; // radians per pixel at 1.0x
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);
const ACCEL = 14;
const DECEL = 10;

export class Player {
  constructor(camera, arena) {
    this.camera = camera;
    this.arena = arena;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = RADIUS;
    this.yaw = 0;
    this.pitch = 0;
    this.speed = BASE_MOVE_SPEED;
    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.shake = 0;
    this.recoilPitch = 0;
    this.sensitivity = 1;
  }

  reset(stats = { health: 100, speed: 1 }) {
    this.maxHealth = stats.health;
    this.health = stats.health;
    this.speed = BASE_MOVE_SPEED * stats.speed;
    this.alive = true;
    this.position.set(0, 0, 3);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.shake = 0;
    this.recoilPitch = 0;
    this.applyCamera(0);
  }

  get eye() {
    return _eye.set(this.position.x, EYE_HEIGHT, this.position.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, input) {
    const mouse = input.consumeMouse();
    const sens = BASE_SENSITIVITY * this.sensitivity;
    this.yaw -= mouse.x * sens;
    this.pitch -= mouse.y * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);

    const { forward, strafe } = input.moveAxes();
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is -Z at yaw 0; right is +X.
    let wx = -sin * forward + cos * strafe;
    let wz = -cos * forward - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    const targetX = wx * this.speed;
    const targetZ = wz * this.speed;
    const rate = len > 0 ? ACCEL : DECEL;
    const k = 1 - Math.exp(-rate * dt);
    this.velocity.x += (targetX - this.velocity.x) * k;
    this.velocity.z += (targetZ - this.velocity.z) * k;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.arena.resolveCircle(this.position, this.radius);
    const lim = ARENA_HALF - this.radius;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -lim, lim);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -lim, lim);

    const moving = Math.hypot(this.velocity.x, this.velocity.z) / BASE_MOVE_SPEED;
    this.bobAmount += (Math.min(moving, 1.3) - this.bobAmount) * Math.min(1, dt * 10);
    this.bobPhase += dt * (6 + moving * 6);

    this.applyCamera(dt);
  }

  // Topple over sideways when you die. t runs 0 -> 1.
  deathCam(t, dt) {
    const e = 1 - Math.pow(1 - Math.min(1, t), 3);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.camera.position.set(this.position.x, EYE_HEIGHT - (EYE_HEIGHT - 0.3) * e, this.position.z);
    this.camera.rotation.set(this.pitch * (1 - e) + 0.3 * e, this.yaw, 1.25 * e, 'YXZ');
  }

  applyCamera(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.recoilPitch *= Math.exp(-dt * 12);
    const s = this.shake * this.shake;
    const bob = Math.sin(this.bobPhase) * 0.045 * this.bobAmount;
    this.camera.position.set(
      this.position.x + (Math.random() - 0.5) * s * 0.25,
      EYE_HEIGHT + bob + (Math.random() - 0.5) * s * 0.25,
      this.position.z,
    );
    this.camera.rotation.set(
      this.pitch + this.recoilPitch,
      this.yaw,
      (Math.random() - 0.5) * s * 0.08,
      'YXZ',
    );
  }
}

const _eye = new THREE.Vector3();
