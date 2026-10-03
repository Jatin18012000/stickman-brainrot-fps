import { ARENA_HALF } from './arena.js';

// A 1 m grid over the arena. When the player moves to a new cell we run one
// breadth-first search outward from them; every enemy then just walks
// "downhill" to a neighbouring cell that is closer. ~2,500 cells, so the
// search costs well under a millisecond and handles any number of enemies.

const CELL = 1;
const SIZE = Math.ceil((ARENA_HALF * 2) / CELL);
const INFLATE = 0.55; // keep paths this far from walls so bodies fit
const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class NavGrid {
  constructor(arena) {
    this.blocked = new Uint8Array(SIZE * SIZE);
    this.dist = new Int32Array(SIZE * SIZE).fill(-1);
    this.queue = new Int32Array(SIZE * SIZE);
    this.targetCell = -1;

    for (let gz = 0; gz < SIZE; gz++) {
      for (let gx = 0; gx < SIZE; gx++) {
        const x = cellCentre(gx);
        const z = cellCentre(gz);
        for (const c of arena.colliders) {
          if (x > c.minX - INFLATE && x < c.maxX + INFLATE && z > c.minZ - INFLATE && z < c.maxZ + INFLATE) {
            this.blocked[gz * SIZE + gx] = 1;
            break;
          }
        }
      }
    }
  }

  cellOf(x, z) {
    const gx = clampIndex(Math.floor((x + ARENA_HALF) / CELL));
    const gz = clampIndex(Math.floor((z + ARENA_HALF) / CELL));
    return gz * SIZE + gx;
  }

  // Recomputes distances only when the target moved to another cell.
  setTarget(x, z) {
    const start = this.cellOf(x, z);
    if (start === this.targetCell) return;
    this.targetCell = start;
    this.dist.fill(-1);
    let head = 0;
    let tail = 0;
    this.dist[start] = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const cur = this.queue[head++];
      const cx = cur % SIZE;
      const cz = (cur - cx) / SIZE;
      for (let n = 0; n < 4; n++) {
        const nx = cx + NEIGHBOURS[n][0];
        const nz = cz + NEIGHBOURS[n][1];
        if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
        const ni = nz * SIZE + nx;
        if (this.blocked[ni] || this.dist[ni] !== -1) continue;
        this.dist[ni] = this.dist[cur] + 1;
        this.queue[tail++] = ni;
      }
    }
  }

  // Unit direction {x, z} towards the target, or null if there is no path
  // from here (e.g. the enemy is standing in an inflated wall margin).
  direction(x, z, out) {
    const cur = this.cellOf(x, z);
    const d0 = this.dist[cur];
    if (d0 <= 0) return null;
    const cx = cur % SIZE;
    const cz = (cur - cx) / SIZE;
    let best = d0;
    let bx = 0;
    let bz = 0;
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const d = this.dist[nz * SIZE + nx];
      if (d < 0 || d >= best) continue;
      // No cutting diagonally past a blocked corner.
      if (dx !== 0 && dz !== 0
        && (this.blocked[cz * SIZE + nx] || this.blocked[nz * SIZE + cx])) continue;
      best = d;
      bx = dx;
      bz = dz;
    }
    if (bx === 0 && bz === 0) return null;
    const tx = cellCentre(cx + bx) - x;
    const tz = cellCentre(cz + bz) - z;
    const len = Math.hypot(tx, tz) || 1;
    out.x = tx / len;
    out.z = tz / len;
    return out;
  }
}

function cellCentre(i) {
  return -ARENA_HALF + (i + 0.5) * CELL;
}

function clampIndex(i) {
  return i < 0 ? 0 : i >= SIZE ? SIZE - 1 : i;
}
