import * as THREE from 'three';
import { Arena } from './arena.js';
import { InputManager } from './input.js';
import { Player } from './player.js';

export class Game {
  constructor(container, ui) {
    this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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

    this.state = 'menu';
    this.input.onLockChange = (locked) => this.handleLockChange(locked);

    window.addEventListener('resize', () => this.resize());
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this.player.reset();
    this.state = 'playing';
    this.input.requestLock();
    this.ui.onStart();
  }

  resume() {
    this.input.requestLock();
  }

  handleLockChange(locked) {
    if (!locked && this.state === 'playing') {
      this.state = 'paused';
      this.ui.onPause();
    } else if (locked && this.state === 'paused') {
      this.state = 'playing';
      this.ui.onResume();
    }
  }

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (this.state === 'playing') {
      this.player.update(dt, this.input);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
