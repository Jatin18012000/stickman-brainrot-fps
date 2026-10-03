import { SPAWN_POINTS } from './arena.js';

const FIRST_WAVES = [3, 5, 7, 10];
const INTRO_TIME = 2.5;
const BREAK_TIME = 3;
export const WAVE_CLEAR_HEAL = 20;

export function waveSize(wave) {
  return FIRST_WAVES[wave - 1] ?? Math.round(10 + 3.5 * (wave - 4));
}

// Health and speed multipliers applied to every enemy in a wave.
export function waveMods(wave) {
  return {
    health: 1 + 0.12 * (wave - 1),
    speed: Math.min(1.45, 1 + 0.04 * (wave - 1)),
  };
}

// Which enemy types make up a wave. Wave 1 is all normal sticks so new
// players can learn the controls; fast sticks join on wave 2, big on wave 3.
export function waveComposition(wave) {
  const n = waveSize(wave);
  const fast = wave >= 2 ? Math.max(1, Math.floor(n * Math.min(0.35, 0.1 * (wave - 1)))) : 0;
  const big = wave >= 3 ? Math.max(1, Math.floor(n * Math.min(0.25, 0.06 * (wave - 2) + 0.04))) : 0;
  const list = [];
  for (let i = 0; i < n - fast - big; i++) list.push('normal');
  for (let i = 0; i < fast; i++) list.push('fast');
  for (let i = 0; i < big; i++) list.push('big');
  shuffle(list);
  // Open each wave with a normal stick, and keep big sticks out of the first two spawns.
  const firstNormal = list.indexOf('normal');
  if (firstNormal > 0) [list[0], list[firstNormal]] = [list[firstNormal], list[0]];
  for (let i = 1; i < Math.min(2, list.length); i++) {
    if (list[i] === 'big') {
      const j = list.findIndex((t, k) => k > 1 && t !== 'big');
      if (j > 0) [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list;
}

export class WaveManager {
  constructor(enemies) {
    this.enemies = enemies;
    this.onWaveStart = null;
    this.onWaveClear = null;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.queue = [];
    this.state = 'idle';
    this.timer = 0;
    this.spawnTimer = 0;
  }

  begin() {
    this.reset();
    this.next();
  }

  next() {
    this.wave++;
    this.queue = waveComposition(this.wave);
    this.mods = waveMods(this.wave);
    this.total = this.queue.length;
    this.state = 'intro';
    this.timer = INTRO_TIME;
    if (this.onWaveStart) this.onWaveStart(this.wave, this.total);
  }

  get maxAlive() {
    return Math.min(16, 5 + this.wave);
  }

  get spawnInterval() {
    return Math.max(0.45, 1.4 - 0.1 * this.wave);
  }

  // Enemies still to come in this wave, including those on the field.
  get remaining() {
    return this.queue.length + this.enemies.aliveCount;
  }

  update(dt, player) {
    if (this.state === 'intro') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'active'; this.spawnTimer = 0; }
    } else if (this.state === 'active') {
      this.spawnTimer -= dt;
      if (this.queue.length && this.spawnTimer <= 0 && this.enemies.aliveCount < this.maxAlive) {
        const [x, z] = this.pickSpawn(player);
        this.enemies.spawn(this.queue.shift(), x, z, this.mods);
        this.spawnTimer = this.spawnInterval;
      }
      if (!this.queue.length && this.enemies.aliveCount === 0) {
        this.state = 'break';
        this.timer = BREAK_TIME;
        if (this.onWaveClear) this.onWaveClear(this.wave);
      }
    } else if (this.state === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.next();
    }
  }

  // A random spawn among the farther half from the player, avoiding spots
  // another stickman is already standing on.
  pickSpawn(player) {
    const scored = SPAWN_POINTS
      .map((p) => ({ p, d: Math.hypot(p[0] - player.position.x, p[1] - player.position.z) }))
      .filter(({ p }) => !this.enemies.enemies.some((e) => Math.hypot(e.position.x - p[0], e.position.z - p[1]) < 1.6))
      .sort((a, b) => b.d - a.d);
    const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
    if (!pool.length) return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    return pool[Math.floor(Math.random() * pool.length)].p;
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
