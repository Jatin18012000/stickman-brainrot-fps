import * as THREE from 'three';

// Pooled, allocation-free visual effects: one Points cloud for every particle
// and a fixed set of tracer beams. Nothing here is created per shot.

const MAX_PARTICLES = 400;
const GRAVITY = -14;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.count = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    tracerGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xfff27a, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tracerIndex = 0;
    this._color = new THREE.Color();
  }

  burst(pos, color, count = 12, speed = 4, upward = 2) {
    this._color.set(color);
    for (let i = 0; i < count; i++) {
      // Reuse the oldest slot when full rather than dropping the effect.
      const p = this.count < MAX_PARTICLES ? this.count++ : Math.floor(Math.random() * MAX_PARTICLES);
      const i3 = p * 3;
      this.positions[i3] = pos.x;
      this.positions[i3 + 1] = pos.y;
      this.positions[i3 + 2] = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i3] = Math.sin(phi) * Math.cos(theta) * s;
      this.vel[i3 + 1] = Math.abs(Math.cos(phi)) * s * 0.6 + upward * Math.random();
      this.vel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
      const shade = 0.75 + Math.random() * 0.25;
      this.colors[i3] = this._color.r * shade;
      this.colors[i3 + 1] = this._color.g * shade;
      this.colors[i3 + 2] = this._color.b * shade;
      this.life[p] = 0.4 + Math.random() * 0.5;
    }
  }

  tracer(from, to) {
    const t = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, from.distanceTo(to));
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.9;
    t.life = 0.07;
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap the dead particle with the last live one.
        const last = this.count - 1;
        if (i !== last) {
          this.copySlot(last, i);
        }
        this.count--;
        continue;
      }
      const i3 = i * 3;
      this.vel[i3 + 1] += GRAVITY * dt;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.03) {
        this.positions[i3 + 1] = 0.03;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
      }
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
  }

  copySlot(from, to) {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.positions[t3 + k] = this.positions[f3 + k];
      this.colors[t3 + k] = this.colors[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
    }
    this.life[to] = this.life[from];
  }
}
