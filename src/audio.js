// Every sound is synthesised with Web Audio, so there are no files to load.
// The context is created on the first user gesture, as browsers require.

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

function ready() {
  return ctx && ctx.state === 'running';
}

// A single oscillator that slides from f0 to f1 while fading out.
function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, vol, filterType, freq, delay = 0) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  shoot() {
    if (!ready()) return;
    const pitch = 0.9 + Math.random() * 0.2;
    tone('square', 900 * pitch, 120, 0.09, 0.12);
    noise(0.06, 0.18, 'highpass', 2500);
  },
  hit() {
    if (!ready()) return;
    tone('triangle', 1500, 900, 0.05, 0.18);
  },
  headshot() {
    if (!ready()) return;
    tone('square', 1800, 1700, 0.05, 0.1);
    tone('square', 2400, 2300, 0.08, 0.1, 0.05);
  },
  enemyDeath() {
    if (!ready()) return;
    // Slide-whistle "bwoooop" plus a pop.
    tone('sine', 1300, 160, 0.45, 0.22);
    noise(0.12, 0.25, 'bandpass', 900);
  },
  enemyAttack() {
    if (!ready()) return;
    noise(0.1, 0.12, 'lowpass', 600);
  },
  playerHurt() {
    if (!ready()) return;
    tone('square', 160, 55, 0.2, 0.2);
    noise(0.15, 0.2, 'lowpass', 500);
  },
  waveStart() {
    if (!ready()) return;
    tone('sawtooth', 220, 220, 0.18, 0.08);
    tone('sawtooth', 330, 330, 0.3, 0.08, 0.18);
  },
  waveClear() {
    if (!ready()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.08, i * 0.08));
  },
  gameOver() {
    if (!ready()) return;
    [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.28, 0.16, i * 0.22));
  },
  click() {
    if (!ready()) return;
    tone('sine', 700, 500, 0.06, 0.15);
  },
};
