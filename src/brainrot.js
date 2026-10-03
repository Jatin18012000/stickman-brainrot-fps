import * as THREE from 'three';

// All the words. Kept in one place so it's easy to add more.

export const ENEMY_NAMES = {
  normal: ['BRO', 'NPC', 'GOOBER', 'SUS STICK', 'MID', 'LIL BRO'],
  fast: ['SKIBIDI', 'ZOOMER', 'SPEEDRUN', 'SONIC.EXE', 'ZOOM ZOOM'],
  big: ['GIGACHAD', 'BRAINROT', 'THE UNIT', 'BIG BACK', 'OHIO BOSS'],
};

const KILL = ['COOKED', 'GET OUT', 'NAHH 💀', 'ABSOLUTELY FRIED', 'SKILL ISSUE', '💀', 'RATIO', 'L + BOZO', 'UNALIVED'];
const HEADSHOT = ['HEADSHOT', 'BRAIN EMPTY', 'NO THOUGHTS', 'DOME'];
const STREAK = { 2: 'DOUBLE COOKED', 3: 'TRIPLE FRIED', 4: 'MEGA RIZZ', 5: 'UNSTOPPABLE AURA' };
const WAVE_START = [
  'LOCK IN.', 'THEY MULTIPLYING 💀', 'IT\'S GIVING DANGER', 'NO SHOT YOU SURVIVE THIS',
  'BUILT DIFFERENT? PROVE IT', 'OHIO LEVEL THREAT', 'STAY SIGMA',
];
const WAVE_CLEAR = ['W', 'EZ', 'AURA +1000', 'CLEAN', 'GG GO NEXT', 'HIM.'];
export const GAME_OVER_LINES = [
  'ratio\'d by stickmen', 'go touch grass', 'that was not very sigma of you',
  'the sticks are hitting the griddy on your grave', 'skill issue tbh', 'NPC behaviour',
];

let last = '';
export function pick(list) {
  // Avoid showing the same line twice in a row.
  let s = list[Math.floor(Math.random() * list.length)];
  if (s === last && list.length > 1) s = list[(list.indexOf(s) + 1) % list.length];
  last = s;
  return s;
}

export function killLine(enemy, head, streak) {
  if (streak >= 2) return STREAK[Math.min(streak, 5)];
  if (head) return pick(HEADSHOT);
  if (Math.random() < 0.25) return `${enemy.name} GOT DELETED`;
  return pick(KILL);
}

export function waveStartLine(wave) {
  if (wave === 1) return 'warm up bro';
  return pick(WAVE_START);
}

export function waveClearLine() {
  return pick(WAVE_CLEAR);
}

// Floating name tags. One texture per name, shared by every stick with it.
const tagCache = new Map();
export function nameTag(name, color) {
  const key = `${name}|${color}`;
  let mat = tagCache.get(key);
  if (!mat) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = '900 34px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = '#14111f';
    g.strokeText(name, 128, 34);
    g.fillStyle = color;
    g.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    tagCache.set(key, mat);
  }
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.7, 0.425, 1);
  return sprite;
}
