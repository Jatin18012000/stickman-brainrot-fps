import * as THREE from 'three';
import { ARENA_HALF } from './arena.js';
import { NavGrid } from './navgrid.js';
import { sfx } from './audio.js';

// Enemy stat blocks. Speeds are metres per second; the player runs at 7.
export const ENEMY_TYPES = {
  normal: {
    label: 'NORMAL STICK', health: 65, speed: 3.6, damage: 10, score: 100,
    scale: 1, radius: 0.45, reach: 0.9, windup: 0.4, cooldown: 1.0, mass: 1,
    body: 0x1b1530, head: 0xffffff,
  },
  fast: {
    label: 'FAST STICK', health: 40, speed: 6.4, damage: 6, score: 150,
    scale: 0.88, radius: 0.4, reach: 0.8, windup: 0.25, cooldown: 0.7, mass: 0.7,
    body: 0xff7a00, head: 0xfff27a,
  },
  big: {
    label: 'BIG STICK', health: 240, speed: 2.4, damage: 24, score: 300,
    scale: 1.6, radius: 0.75, reach: 1.25, windup: 0.6, cooldown: 1.5, mass: 3,
    body: 0x7a2cff, head: 0xff6fb5,
  },
};

const SPAWN_TIME = 0.6;
const DEATH_TIME = 0.9;
const HIT_FLASH = 0.09;
const HEAD_MULT = 2;

// Shared geometry: a unit cylinder hanging down from its top, scaled per limb.
const LIMB_GEO = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, -0.5, 0);
const HEAD_GEO = new THREE.SphereGeometry(1, 12, 10);
const SHADOW_GEO = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const PUPIL_MAT = new THREE.MeshBasicMaterial({ color: 0x000000 });
const BAR_BG = new THREE.SpriteMaterial({ color: 0x1b1530, depthWrite: false });
const BAR_FILL = new THREE.SpriteMaterial({ color: 0xff3b6b, depthWrite: false });

const _v = new THREE.Vector3();
const _dir = { x: 0, z: 0 };
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();

export class Enemy {
  constructor(type, typeKey, mods) {
    this.type = type;
    this.typeKey = typeKey;
    this.maxHealth = Math.round(type.health * mods.health);
    this.health = this.maxHealth;
    this.speed = type.speed * mods.speed;
    this.damage = type.damage;
    this.radius = type.radius;
    this.scale = type.scale;
    this.position = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.deathVel = new THREE.Vector3();
    this.state = 'spawning';
    this.timer = SPAWN_TIME;
    this.flash = 0;
    this.stagger = 0;
    this.walkPhase = Math.random() * 10;
    this.facing = 0;
    this.attackCooldown = 0;
    this.name = '';
    this.build();
  }

  build() {
    const s = this.scale;
    this.limbMat = new THREE.MeshLambertMaterial({ color: this.type.body });
    this.headMat = new THREE.MeshLambertMaterial({ color: this.type.head });

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(s);
    this.root.add(this.body);

    const limb = (len, r, x, y, z, parent = this.body) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const m = new THREE.Mesh(LIMB_GEO, this.limbMat);
      m.scale.set(r, len, r);
      pivot.add(m);
      parent.add(pivot);
      return pivot;
    };

    // Torso from neck (1.45) down to hip (0.9).
    limb(0.58, 0.06, 0, 1.47, 0);
    this.legL = limb(0.92, 0.055, -0.09, 0.92, 0);
    this.legR = limb(0.92, 0.055, 0.09, 0.92, 0);
    this.armL = limb(0.62, 0.045, -0.1, 1.4, 0);
    this.armR = limb(0.62, 0.045, 0.1, 1.4, 0);
    this.armL.rotation.z = -0.35;
    this.armR.rotation.z = 0.35;

    const head = new THREE.Mesh(HEAD_GEO, this.headMat);
    head.scale.setScalar(0.22);
    head.position.set(0, 1.68, 0);
    this.body.add(head);
    // Googly eyes, facing +Z (towards the player once rotated).
    for (const x of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(HEAD_GEO, EYE_MAT);
      eye.scale.setScalar(0.07);
      eye.position.set(x, 1.72, 0.17);
      this.body.add(eye);
      const pupil = new THREE.Mesh(HEAD_GEO, PUPIL_MAT);
      pupil.scale.setScalar(0.035);
      pupil.position.set(x + (Math.random() - 0.5) * 0.04, 1.71 + (Math.random() - 0.5) * 0.03, 0.23);
      this.body.add(pupil);
    }

    const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    shadow.scale.setScalar(this.radius * 1.1);
    shadow.position.y = 0.02;
    this.root.add(shadow);

    // Health bar: hidden until the enemy is first hurt.
    this.barBg = new THREE.Sprite(BAR_BG);
    this.barBg.scale.set(0.9, 0.09, 1);
    this.barFill = new THREE.Sprite(BAR_FILL);
    this.barFill.center.set(0, 0.5);
    this.barFill.scale.set(0.86, 0.06, 1);
    this.barBg.visible = this.barFill.visible = false;
    this.root.add(this.barBg, this.barFill);
    this.placeBar();
  }

  placeBar() {
    const y = 2.05 * this.scale + 0.1;
    this.barBg.position.set(0, y, 0);
    this.barFill.position.set(-0.43, y, 0.001);
  }

  get headY() { return 1.68 * this.scale; }
  get headRadius() { return 0.26 * this.scale; } // a bit generous: arcade
  get bodyTop() { return 1.48 * this.scale; }
  get bodyRadius() { return 0.3 * this.scale; }
  get alive() { return this.state !== 'dying' && this.state !== 'dead'; }

  setLabel(sprite) {
    this.label = sprite;
    sprite.position.set(0, 2.05 * this.scale + 0.36, 0);
    this.root.add(sprite);
  }
}

export class EnemyManager {
  constructor(scene, arena, effects) {
    this.scene = scene;
    this.arena = arena;
    this.effects = effects;
    this.nav = new NavGrid(arena);
    this.enemies = [];
    this.onPlayerHit = null;
    this.onKill = null;
    this.decorate = null; // optional hook to add a name tag etc.
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  spawn(typeKey, x, z, mods = { health: 1, speed: 1 }) {
    const e = new Enemy(ENEMY_TYPES[typeKey], typeKey, mods);
    e.position.set(x, 0, z);
    e.root.position.copy(e.position);
    e.body.position.y = -2 * e.scale;
    if (this.decorate) this.decorate(e);
    this.scene.add(e.root);
    this.enemies.push(e);
    this.effects.burst(_v.set(x, 0.3, z), e.type.body, 14, 3, 3);
    return e;
  }

  clear() {
    for (const e of this.enemies) this.dispose(e);
    this.enemies.length = 0;
  }

  dispose(e) {
    this.scene.remove(e.root);
    e.limbMat.dispose();
    e.headMat.dispose();
  }

  // Nearest enemy along a ray, closer than maxT. Head checked separately.
  raycast(o, d, maxT) {
    let best = null;
    let bestT = maxT;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const p = e.position;
      const hy = e.headY + e.body.position.y;
      const tHead = raySphere(o, d, p.x, hy, p.z, e.headRadius);
      if (tHead < bestT) { bestT = tHead; best = { enemy: e, t: tHead, head: true }; }
      const tBody = rayCylinder(o, d, p.x, p.z, e.bodyRadius, e.body.position.y, e.bodyTop + e.body.position.y);
      if (tBody < bestT) { bestT = tBody; best = { enemy: e, t: tBody, head: false }; }
    }
    return best;
  }

  // Applies damage; returns true if this hit killed the enemy.
  damage(e, amount, dir, head) {
    if (!e.alive) return false;
    const dealt = head ? amount * HEAD_MULT : amount;
    e.health -= dealt;
    e.flash = HIT_FLASH;
    e.stagger = 0.12;
    const push = (head ? 3.2 : 2.4) / e.type.mass;
    e.knock.x += dir.x * push;
    e.knock.z += dir.z * push;
    e.barBg.visible = e.barFill.visible = true;
    e.barFill.scale.x = 0.86 * Math.max(0, e.health / e.maxHealth);
    if (e.health > 0) return false;

    e.state = 'dying';
    e.timer = DEATH_TIME;
    e.barBg.visible = e.barFill.visible = false;
    if (e.label) e.label.visible = false;
    // Yeet: fly backwards and up, spinning.
    e.deathVel.set(dir.x * 7, 6 + Math.random() * 2, dir.z * 7).multiplyScalar(1 / Math.sqrt(e.type.mass));
    e.deathSpin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6);
    sfx.enemyDeath();
    if (this.onKill) this.onKill(e, head);
    return true;
  }

  update(dt, player, camera) {
    this.nav.setTarget(player.position.x, player.position.z);
    const list = this.enemies;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.state === 'dead') {
        this.dispose(e);
        list.splice(i, 1);
        continue;
      }
      this.updateEnemy(e, dt, player);
    }
    this.separate();
    for (const e of list) {
      e.root.position.copy(e.position);
      if (e.flash > 0) {
        e.flash -= dt;
        const on = e.flash > 0 ? 1 : 0;
        e.limbMat.emissive.setScalar(on);
        e.headMat.emissive.setScalar(on);
      }
    }
  }

  updateEnemy(e, dt, player) {
    const dx = player.position.x - e.position.x;
    const dz = player.position.z - e.position.z;
    const dist = Math.hypot(dx, dz);
    const touch = player.radius + e.radius;

    if (e.state === 'dying') {
      this.updateDeath(e, dt);
      return;
    }
    if (e.state === 'dance') {
      this.dance(e, dt);
      return;
    }

    // Always turn to face the player.
    const want = Math.atan2(dx, dz);
    let diff = want - e.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    e.facing += diff * Math.min(1, dt * 10);
    e.root.rotation.y = e.facing;

    e.attackCooldown -= dt;
    e.stagger -= dt;
    let moveX = 0;
    let moveZ = 0;

    if (e.state === 'spawning') {
      e.timer -= dt;
      e.body.position.y = -2 * e.scale * Math.max(0, e.timer / SPAWN_TIME);
      if (e.timer <= 0) { e.body.position.y = 0; e.state = 'chase'; }
    } else if (e.state === 'chase') {
      if (dist <= touch + e.type.reach && e.attackCooldown <= 0) {
        e.state = 'windup';
        e.timer = e.type.windup;
        sfx.enemyAttack();
      } else if (dist > touch + 0.05 && e.stagger <= 0) {
        const dir = this.steer(e, dx, dz, dist);
        moveX = dir.x * e.speed;
        moveZ = dir.z * e.speed;
      }
    } else if (e.state === 'windup') {
      e.timer -= dt;
      if (e.timer <= 0) {
        // The swing lands only if you're still in reach: back off to dodge.
        if (dist <= touch + e.type.reach + 0.35 && this.onPlayerHit) {
          this.onPlayerHit(e.damage, e);
        }
        e.state = 'recover';
        e.timer = 0.25;
        e.attackCooldown = e.type.cooldown;
      }
    } else if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'chase';
    }

    // Movement plus decaying knockback.
    const kd = Math.exp(-dt * 7);
    e.knock.multiplyScalar(kd);
    e.position.x += (moveX + e.knock.x) * dt;
    e.position.z += (moveZ + e.knock.z) * dt;
    this.arena.resolveCircle(e.position, e.radius);
    const lim = ARENA_HALF - e.radius;
    e.position.x = THREE.MathUtils.clamp(e.position.x, -lim, lim);
    e.position.z = THREE.MathUtils.clamp(e.position.z, -lim, lim);

    // Never stand inside the player.
    const ndx = e.position.x - player.position.x;
    const ndz = e.position.z - player.position.z;
    const nd = Math.hypot(ndx, ndz);
    if (nd < touch && nd > 1e-4) {
      e.position.x = player.position.x + (ndx / nd) * touch;
      e.position.z = player.position.z + (ndz / nd) * touch;
    }

    this.animate(e, dt, Math.hypot(moveX, moveZ));
  }

  // Straight at the player when the way is clear, otherwise follow the grid.
  steer(e, dx, dz, dist) {
    _eye.set(e.position.x, 0.5, e.position.z);
    _target.set(e.position.x + dx, 0.5, e.position.z + dz);
    if (dist < 2.5 || this.arena.lineOfSight(_eye, _target)) {
      _dir.x = dx / dist;
      _dir.z = dz / dist;
      return _dir;
    }
    if (this.nav.direction(e.position.x, e.position.z, _dir)) return _dir;
    _dir.x = dx / dist;
    _dir.z = dz / dist;
    return _dir;
  }

  animate(e, dt, speed) {
    const s = speed / e.speed;
    e.walkPhase += dt * (4 + e.speed * 1.6) * Math.min(1, s + 0.05);
    const swing = Math.sin(e.walkPhase) * 0.75 * Math.min(1, s);
    e.legL.rotation.x = swing;
    e.legR.rotation.x = -swing;
    let lean = e.typeKey === 'fast' ? 0.35 * s : 0.08 * s;
    if (e.state === 'windup') {
      // Arms up, lean back: "I'm about to bonk you".
      const k = 1 - e.timer / e.type.windup;
      e.armL.rotation.x = e.armR.rotation.x = -2.6 * k;
      lean = -0.25 * k;
    } else if (e.state === 'recover') {
      e.armL.rotation.x = e.armR.rotation.x = 0.9;
      lean = 0.3;
    } else {
      e.armL.rotation.x = -swing * 0.8;
      e.armR.rotation.x = swing * 0.8;
    }
    if (e.stagger > 0) lean = -0.45;
    e.body.rotation.x += (lean - e.body.rotation.x) * Math.min(1, dt * 14);
  }

  // Everyone left alive hits the griddy (used when the player dies).
  celebrate() {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.state = 'dance';
      e.body.position.y = 0;
      e.danceStyle = Math.floor(Math.random() * 3);
    }
  }

  // A little line of dancing sticks for the main menu.
  spawnDancers() {
    const keys = ['fast', 'normal', 'big', 'normal', 'fast'];
    keys.forEach((k, i) => {
      const e = this.spawn(k, (i - 2) * 2.6, 2);
      e.state = 'dance';
      e.body.position.y = 0;
      e.danceStyle = i % 3;
      e.walkPhase = i * 0.7;
      if (e.label) e.label.visible = false;
    });
  }

  dance(e, dt) {
    e.walkPhase += dt * 9;
    const t = e.walkPhase;
    const s = Math.sin(t);
    if (e.danceStyle === 0) {
      // Griddy: knees up, arms pumping.
      e.legL.rotation.x = Math.max(0, s) * -1.1;
      e.legR.rotation.x = Math.max(0, -s) * -1.1;
      e.armL.rotation.x = -1.2 + s * 0.8;
      e.armR.rotation.x = -1.2 - s * 0.8;
      e.body.position.y = Math.abs(s) * 0.12 * e.scale;
    } else if (e.danceStyle === 1) {
      // Arms in the air, side to side.
      e.armL.rotation.x = e.armR.rotation.x = -2.9;
      e.armL.rotation.z = -0.4 + s * 0.3;
      e.armR.rotation.z = 0.4 + s * 0.3;
      e.body.rotation.z = s * 0.25;
      e.body.position.y = Math.abs(Math.cos(t)) * 0.18 * e.scale;
    } else {
      // Spin and bounce.
      e.facing += dt * 5;
      e.armL.rotation.x = e.armR.rotation.x = -1.57;
      e.legL.rotation.x = s * 0.4;
      e.legR.rotation.x = -s * 0.4;
      e.body.position.y = Math.abs(s) * 0.25 * e.scale;
    }
    e.body.rotation.x += (0 - e.body.rotation.x) * Math.min(1, dt * 10);
    e.root.rotation.y = e.facing;
  }

  updateDeath(e, dt) {
    e.timer -= dt;
    e.deathVel.y -= 20 * dt;
    e.position.addScaledVector(e.deathVel, dt);
    if (e.position.y < 0) {
      e.position.y = 0;
      e.deathVel.y *= -0.4;
      e.deathVel.x *= 0.6;
      e.deathVel.z *= 0.6;
    }
    e.body.rotation.x += e.deathSpin * dt;
    e.body.rotation.z += e.deathSpin * 0.4 * dt;
    // Flailing limbs.
    const f = e.timer * 40;
    e.armL.rotation.x = Math.sin(f) * 2;
    e.armR.rotation.x = Math.cos(f) * 2;
    e.legL.rotation.x = Math.sin(f * 0.8) * 1.2;
    e.legR.rotation.x = -Math.sin(f * 0.8) * 1.2;
    if (e.timer <= 0) {
      _v.set(e.position.x, e.position.y + e.headY * 0.6, e.position.z);
      this.effects.burst(_v, e.type.body, 22, 5, 3);
      this.effects.burst(_v, e.type.head, 10, 4, 3);
      e.state = 'dead';
    }
  }

  // Cheap pairwise push so a crowd doesn't collapse into one stickman.
  separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const wa = b.type.mass / (a.type.mass + b.type.mass);
        a.position.x -= (dx / d) * push * 2 * wa;
        a.position.z -= (dz / d) * push * 2 * wa;
        b.position.x += (dx / d) * push * 2 * (1 - wa);
        b.position.z += (dz / d) * push * 2 * (1 - wa);
      }
    }
  }
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}

// Ray against a vertical cylinder's side wall between heights y0 and y1.
function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return Infinity;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t <= 0) return Infinity;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : Infinity;
}
