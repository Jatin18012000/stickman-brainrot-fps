// The three playable sticks. Multipliers are applied to the player's base
// move speed (player.js) and the Stick Blaster's damage and fire rate (weapon.js).
export const CHARACTERS = {
  red: {
    key: 'red', name: 'RED', role: 'ASSAULT', blurb: 'Balanced. Does a bit of everything.',
    color: 0xff3b3b, css: '#ff3b3b',
    health: 100, speed: 1.0, damage: 1.0, fireRate: 1.0,
  },
  blue: {
    key: 'blue', name: 'BLUE', role: 'SPEED', blurb: 'Zooms around and sprays. Folds fast.',
    color: 0x2f8bff, css: '#2f8bff',
    health: 75, speed: 1.35, damage: 0.85, fireRate: 1.25,
  },
  green: {
    key: 'green', name: 'GREEN', role: 'TANK', blurb: 'Slow, chunky, hits like a truck.',
    color: 0x19c37d, css: '#19c37d',
    health: 160, speed: 0.75, damage: 1.35, fireRate: 0.8,
  },
};

export const CHARACTER_ORDER = ['red', 'blue', 'green'];

const PICK_KEY = 'stickman-brainrot-fps:character';

export function loadPick() {
  try {
    const k = localStorage.getItem(PICK_KEY);
    return CHARACTERS[k] ? k : 'red';
  } catch {
    return 'red';
  }
}

export function savePick(key) {
  try {
    localStorage.setItem(PICK_KEY, key);
  } catch {
    /* not remembered, that's fine */
  }
}
