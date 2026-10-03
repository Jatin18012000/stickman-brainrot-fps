import * as THREE from 'three';

// The STICK BLASTER. It is drawn in its own little scene on top of the world
// so it never clips into walls, and fires hitscan shots from the screen centre.

export const WEAPON_NAME = 'STICK BLASTER';
export const BASE_DAMAGE = 25;
export const BASE_FIRE_INTERVAL = 0.2; // seconds between shots at 1.00x fire rate
const REST = new THREE.Vector3(0.21, -0.21, -0.5);
const MUZZLE_LOCAL = new THREE.Vector3(0.2, -0.19, -0.95);

export class Weapon {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, 2, 1);
    this.scene.add(key);

    this.damage = BASE_DAMAGE;
    this.interval = BASE_FIRE_INTERVAL;
    this.cooldown = 0;
    this.kick = 0;
    this.flashTime = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;

    this.root = new THREE.Group();
    this.gun = new THREE.Group();
    this.root.add(this.gun);
    this.scene.add(this.root);
    this.buildModel();
  }

  buildModel() {
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1530 });
    const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
    this.bodyMat = new THREE.MeshLambertMaterial({ color: 0xff3b3b });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff27a });

    const add = (geo, mat, x, y, z, parent = this.gun) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    const bodyGeo = new THREE.BoxGeometry(0.12, 0.14, 0.44);
    add(bodyGeo, this.bodyMat, 0, 0, 0);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), new THREE.LineBasicMaterial({ color: 0x1b1530 }));
    this.gun.add(outline);
    add(new THREE.BoxGeometry(0.04, 0.03, 0.22), dark, 0, 0.085, 0.04);
    const barrel = add(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 10), white, 0, 0.01, -0.36);
    barrel.rotation.x = Math.PI / 2;
    const tip = add(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), dark, 0, 0.01, -0.52);
    tip.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.13, 0.05, 0.12), glow, 0, -0.02, -0.08);
    const grip = add(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark, 0, -0.12, 0.12);
    grip.rotation.x = -0.25;

    // Stickman arms: thin black limbs with round hands.
    const limb = new THREE.MeshLambertMaterial({ color: 0x111111 });
    this.addLimb(limb, new THREE.Vector3(0, -0.18, 0.13), new THREE.Vector3(0.12, -0.6, 0.55));
    this.addLimb(limb, new THREE.Vector3(-0.02, -0.06, -0.22), new THREE.Vector3(-0.35, -0.6, 0.2));
    const hand = new THREE.SphereGeometry(0.045, 10, 8);
    add(hand, limb, 0, -0.18, 0.13);
    add(hand, limb, -0.02, -0.06, -0.22);

    // Muzzle flash: an additive star sprite at the barrel tip.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshBasicMaterial({
        map: makeFlashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.flash.position.set(0, 0.01, -0.6);
    this.flash.visible = false;
    this.gun.add(this.flash);

    this.root.position.copy(REST);
    this.root.scale.setScalar(0.62);
  }

  addLimb(mat, from, to) {
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(0.022, 0.022, len, 6);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2); // now runs along +Z from the origin
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
    this.gun.add(m);
  }

  setStats(damageMult, fireRateMult, color) {
    this.damage = BASE_DAMAGE * damageMult;
    this.interval = BASE_FIRE_INTERVAL / fireRateMult;
    this.bodyMat.color.set(color);
    this.cooldown = 0;
    this.kick = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Returns true when a shot should be fired this frame.
  update(dt, player, wantsToFire) {
    this.cooldown -= dt;
    let fired = false;
    if (wantsToFire && this.cooldown <= 0) {
      fired = true;
      // Carry a little of the overshoot so the rate is exact at any frame rate.
      this.cooldown = Math.max(this.cooldown + this.interval, this.interval * 0.5);
      this.kick = Math.min(this.kick + 1, 1.6);
      this.flashTime = 0.05;
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
      player.recoilPitch += 0.012;
    }
    if (this.cooldown < 0) this.cooldown = 0;

    this.kick *= Math.exp(-dt * 14);
    this.flashTime -= dt;
    this.flash.visible = this.flashTime > 0;

    // Lag behind the view a little when turning, and bob while walking.
    const dYaw = player.yaw - this.lastYaw;
    const dPitch = player.pitch - this.lastPitch;
    this.lastYaw = player.yaw;
    this.lastPitch = player.pitch;
    const k = 1 - Math.exp(-dt * 10);
    this.swayX += (THREE.MathUtils.clamp(dYaw * 2, -0.08, 0.08) - this.swayX) * k;
    this.swayY += (THREE.MathUtils.clamp(-dPitch * 2, -0.08, 0.08) - this.swayY) * k;
    const bob = player.bobAmount;
    this.root.position.set(
      REST.x + this.swayX + Math.cos(player.bobPhase * 0.5) * 0.012 * bob,
      REST.y + this.swayY - Math.abs(Math.sin(player.bobPhase * 0.5)) * 0.018 * bob,
      REST.z,
    );
    this.gun.position.z = this.kick * 0.07;
    this.gun.rotation.x = this.kick * 0.16;
    return fired;
  }

  // Where tracers start, in world space.
  muzzleWorld(worldCamera, out) {
    return worldCamera.localToWorld(out.copy(MUZZLE_LOCAL));
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,240,120,0.9)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 31 : 12;
    const a = (i / 16) * Math.PI * 2;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
