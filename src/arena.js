import * as THREE from 'three';

// One square arena, laid out on the XZ plane with the player starting in the
// open middle. Every solid object is an axis-aligned box, which keeps both
// collision and line-of-sight checks to a handful of comparisons.

export const ARENA_HALF = 25;
const WALL_HEIGHT = 5;
const WALL_THICK = 1;

const OUTLINE = 0x1b1530;
const PALETTE = {
  wall: 0xb9a7ff,
  crate: 0xffb347,
  crateAlt: 0xff7eb6,
  cover: 0x6fe3d3,
  pillar: 0x8fa8ff,
  big: 0xfff07a,
};

// [x, z, width(x), depth(z), height, colour]
const LAYOUT = [
  // Low walls ringing the middle: waist-high cover you can shoot over.
  [0, -10, 8, 1, 1.3, PALETTE.cover],
  [0, 10, 8, 1, 1.3, PALETTE.cover],
  [-10, 0, 1, 8, 1.3, PALETTE.cover],
  [10, 0, 1, 8, 1.3, PALETTE.cover],
  // Tall pillars that block sight lines.
  [-15, -15, 1.8, 1.8, 4.5, PALETTE.pillar],
  [15, -15, 1.8, 1.8, 4.5, PALETTE.pillar],
  [-15, 15, 1.8, 1.8, 4.5, PALETTE.pillar],
  [15, 15, 1.8, 1.8, 4.5, PALETTE.pillar],
  // Crates.
  [-5, 4.5, 2, 2, 2, PALETTE.crate],
  [5.5, -5, 2, 2, 2, PALETTE.crateAlt],
  [-18, 4, 2.5, 2.5, 1.6, PALETTE.crate],
  [18, -4, 2.5, 2.5, 1.6, PALETTE.crateAlt],
  [4, 18, 2.5, 2.5, 1.6, PALETTE.crate],
  [-4, -18, 2.5, 2.5, 1.6, PALETTE.crateAlt],
  [13, 7, 1.6, 1.6, 1.2, PALETTE.crateAlt],
  [-13, -7, 1.6, 1.6, 1.2, PALETTE.crate],
  [-7, 15, 1.6, 1.6, 1.2, PALETTE.crateAlt],
  [7, -15, 1.6, 1.6, 1.2, PALETTE.crate],
  // Big corner blocks.
  [-20, -20, 3.5, 3.5, 2.6, PALETTE.big],
  [20, 20, 3.5, 3.5, 2.6, PALETTE.big],
  // Short walls that make little lanes along the edges.
  [-21, 11, 5, 1, 2.2, PALETTE.wall],
  [21, -11, 5, 1, 2.2, PALETTE.wall],
  [11, -21, 1, 5, 2.2, PALETTE.wall],
  [-11, 21, 1, 5, 2.2, PALETTE.wall],
];

export const SPAWN_POINTS = [
  [-22, -22], [0, -22.5], [22, -22], [22.5, 0], [22, 22], [0, 22.5], [-22, 22], [-22.5, 0],
  [-12, -23], [12, -23], [23, -12], [23, 12], [12, 23], [-12, 23], [-23, 12], [-23, -12],
];

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildFloor();
    this.buildWalls();
    for (const [x, z, w, d, h, color] of LAYOUT) this.addBlock(x, z, w, d, h, color);
  }

  buildFloor() {
    const size = ARENA_HALF * 2 + WALL_THICK * 2;
    const tex = makeGridTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 4, size / 4);
    tex.anisotropy = 4;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);
  }

  buildWalls() {
    const span = ARENA_HALF * 2 + WALL_THICK * 2;
    const off = ARENA_HALF + WALL_THICK / 2;
    this.addBlock(0, -off, span, WALL_THICK, WALL_HEIGHT, PALETTE.wall, false);
    this.addBlock(0, off, span, WALL_THICK, WALL_HEIGHT, PALETTE.wall, false);
    this.addBlock(-off, 0, WALL_THICK, span, WALL_HEIGHT, PALETTE.wall, false);
    this.addBlock(off, 0, WALL_THICK, span, WALL_HEIGHT, PALETTE.wall, false);
  }

  addBlock(x, z, w, d, h, color, outlined = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, h / 2, z);
    this.group.add(mesh);
    if (outlined) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: OUTLINE }),
      );
      edges.position.copy(mesh.position);
      this.group.add(edges);
    }
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      height: h,
    });
  }

  // Pushes a circle (x/z of `pos`, radius r) out of every box it overlaps.
  resolveCircle(pos, r) {
    for (const c of this.colliders) {
      const cx = pos.x < c.minX ? c.minX : pos.x > c.maxX ? c.maxX : pos.x;
      const cz = pos.z < c.minZ ? c.minZ : pos.z > c.maxZ ? c.maxZ : pos.z;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        // Centre is inside the box: leave by the nearest face.
        const pushes = [
          [c.minX - r - pos.x, 0], [c.maxX + r - pos.x, 0],
          [0, c.minZ - r - pos.z], [0, c.maxZ + r - pos.z],
        ];
        pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        pos.x += pushes[0][0];
        pos.z += pushes[0][1];
      }
    }
  }

  // Distance along a ray to the first box it hits, or Infinity. The ray is
  // tested in full 3D so you can shoot over low cover.
  raycast(origin, dir, maxDist = Infinity) {
    let best = maxDist;
    for (const c of this.colliders) {
      const t = rayBox(origin, dir, c);
      if (t < best) best = t;
    }
    // Floor plane.
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) best = t;
    }
    return best;
  }

  // True when nothing solid sits between a and b (both Vector3).
  lineOfSight(a, b) {
    const dir = _tmp.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-6) return true;
    dir.divideScalar(len);
    for (const c of this.colliders) {
      if (rayBox(a, dir, c) < len) return false;
    }
    return true;
  }
}

const _tmp = new THREE.Vector3();

// Slab test against an axis-aligned box resting on the floor.
function rayBox(o, d, c) {
  let tmin = 0;
  let tmax = Infinity;
  const slabs = [
    [o.x, d.x, c.minX, c.maxX],
    [o.y, d.y, 0, c.height],
    [o.z, d.z, c.minZ, c.maxZ],
  ];
  for (const [p, v, lo, hi] of slabs) {
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return Infinity;
    } else {
      let t1 = (lo - p) / v;
      let t2 = (hi - p) / v;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4ecdc';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ebe0cb';
  g.fillRect(0, 0, 64, 64);
  g.fillRect(64, 64, 64, 64);
  g.strokeStyle = '#d8c9ad';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
