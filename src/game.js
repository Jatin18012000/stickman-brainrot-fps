import * as THREE from 'three';
import { Arena } from './arena.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { Effects } from './effects.js';
import { sfx, unlockAudio } from './audio.js';
import { EnemyManager } from './enemy.js';
import { WaveManager, WAVE_CLEAR_HEAL } from './waves.js';
import { Hud } from './hud.js';

const MAX_SHOT_RANGE = 120;
const DEATH_CAM_TIME = 1.4;
const BEST_KEY = 'stickman-brainrot-fps:best';
const DEFAULT_CHARACTER = {
  key: 'red', name: 'RED', role: 'ASSAULT', color: 0xff3b3b, css: '#ff3b3b',
  health: 100, speed: 1, damage: 1, fireRate: 1,
};

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

// States: menu -> playing <-> paused, playing -> dying -> gameover -> playing
export class Game {
  constructor(container, uiRoot) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0x9fd8ff, 30, 75);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(12, 30, 8);
    this.scene.add(sun);

    this.arena = new Arena(this.scene);
    this.input = new InputManager(this.renderer.domElement);
    this.player = new Player(this.camera, this.arena);
    this.weapon = new Weapon();
    this.effects = new Effects(this.scene);
    this.enemies = new EnemyManager(this.scene, this.arena, this.effects);
    this.waves = new WaveManager(this.enemies);
    this.hud = new Hud(uiRoot);

    this.enemies.onPlayerHit = (damage) => this.damagePlayer(damage);
    this.enemies.onKill = (enemy, head) => this.handleKill(enemy, head);
    this.waves.onWaveStart = (wave, count) => this.handleWaveStart(wave, count);
    this.waves.onWaveClear = (wave) => this.handleWaveClear(wave);

    this.state = 'menu';
    this.onStateChange = null;
    this.character = DEFAULT_CHARACTER;
    this.score = 0;
    this.kills = 0;
    this.best = loadBest();
    this.menuTime = 0;

    this.input.onLockChange = (locked) => this.handleLockChange(locked);
    this.input.onLockError = () => {
      if (this.state === 'playing') this.setState('paused');
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.input.exitLock();
        this.setState('paused');
      }
    });

    window.addEventListener('resize', () => this.resize());
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setState(state, data) {
    this.state = state;
    this.hud.show(state === 'playing' || state === 'dying');
    if (this.onStateChange) this.onStateChange(state, data);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.weapon.resize(this.camera.aspect);
  }

  // Must be called from a click handler so the pointer lock is allowed.
  start(character = this.character) {
    unlockAudio();
    this.character = character;
    this.player.reset(character);
    this.weapon.setStats(character.damage, character.fireRate, character.color);
    this.effects.clear();
    this.enemies.clear();
    this.score = 0;
    this.kills = 0;
    this.hud.reset();
    this.hud.setCharacter(character);
    this.setState('playing');
    this.waves.begin();
    this.input.requestLock();
  }

  resume() {
    if (this.state !== 'paused') return;
    unlockAudio();
    this.input.requestLock();
  }

  quitToMenu() {
    this.input.exitLock();
    this.enemies.clear();
    this.effects.clear();
    this.waves.reset();
    this.setState('menu');
  }

  handleLockChange(locked) {
    if (!locked && this.state === 'playing') {
      this.setState('paused');
    } else if (locked && this.state === 'paused') {
      this.setState('playing');
    }
  }

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.update(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.state === 'playing' || this.state === 'paused') this.weapon.render(this.renderer);
  }

  update(dt) {
    const s = this.state;
    if (s === 'playing') {
      this.player.update(dt, this.input);
      if (this.weapon.update(dt, this.player, this.input.fireHeld)) this.shoot();
      this.enemies.update(dt, this.player);
      this.waves.update(dt, this.player);
      this.effects.update(dt);
      this.hud.update(dt, this);
    } else if (s === 'dying') {
      this.deathTimer -= dt;
      this.player.deathCam(1 - this.deathTimer / DEATH_CAM_TIME, dt);
      this.enemies.update(dt, this.player);
      this.effects.update(dt);
      this.hud.update(dt, this);
      if (this.deathTimer <= 0) this.finishGame();
    } else if (s === 'menu') {
      this.menuTime += dt;
      const a = this.menuTime * 0.08;
      this.camera.position.set(Math.sin(a) * 20, 9, Math.cos(a) * 20);
      this.camera.lookAt(0, 0, 0);
      this.effects.update(dt);
    }
  }

  // Hitscan from the centre of the screen. Returns what was hit.
  shoot() {
    this.camera.updateMatrixWorld();
    this.camera.getWorldPosition(_origin);
    this.camera.getWorldDirection(_dir);
    const wallDist = this.arena.raycast(_origin, _dir, MAX_SHOT_RANGE);
    const hit = this.enemies.raycast(_origin, _dir, wallDist);
    const dist = hit ? hit.t : wallDist;
    _end.copy(_origin).addScaledVector(_dir, Math.min(dist, MAX_SHOT_RANGE));
    this.effects.tracer(this.weapon.muzzleWorld(this.camera, _muzzle), _end);
    sfx.shoot();
    if (hit) {
      const killed = this.enemies.damage(hit.enemy, this.weapon.damage, _dir, hit.head);
      this.effects.burst(_end, hit.head ? 0xff3b6b : hit.enemy.type.body, hit.head ? 10 : 6, 3, 1.5);
      this.hud.hitmarker(hit.head, killed);
      if (!killed) (hit.head ? sfx.headshot : sfx.hit)();
    } else if (wallDist < MAX_SHOT_RANGE) {
      this.effects.burst(_end, 0x3a2f55, 7, 2.5, 1);
    }
    return hit;
  }

  handleKill(enemy, head) {
    this.kills++;
    this.score += enemy.type.score;
    this.hud.killMessage(head ? 'HEADSHOT' : 'COOKED', `+${enemy.type.score}`);
  }

  handleWaveStart(wave, count) {
    this.hud.announce(`WAVE ${wave}`, `${count} STICKS INCOMING`);
    sfx.waveStart();
  }

  handleWaveClear(wave) {
    const p = this.player;
    const healed = Math.min(WAVE_CLEAR_HEAL, p.maxHealth - p.health);
    p.health += healed;
    this.hud.announce(`WAVE ${wave} CLEARED`, healed > 0 ? `+${Math.round(healed)} HP` : 'FULL HP');
    sfx.waveClear();
  }

  damagePlayer(amount) {
    const p = this.player;
    if (this.state !== 'playing' || !p.alive) return;
    p.health = Math.max(0, p.health - amount);
    p.shake = Math.min(1, p.shake + 0.45 + amount / 40);
    this.hud.damageFlash(amount / 30);
    sfx.playerHurt();
    if (p.health <= 0) this.die();
  }

  die() {
    this.player.alive = false;
    this.input.fireHeld = false;
    this.deathTimer = DEATH_CAM_TIME;
    sfx.gameOver();
    this.setState('dying');
  }

  finishGame() {
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      saveBest(this.best);
    }
    this.input.exitLock();
    this.setState('gameover', {
      score: this.score, kills: this.kills, wave: this.waves.wave, best: this.best, newBest,
    });
  }
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage unavailable: best score just isn't remembered */
  }
}
