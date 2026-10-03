import { sfx } from './audio.js';

// Menu screens. Each screen is plain HTML; buttons carry data-action and are
// handled in one place.
export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.screen = document.createElement('div');
    root.appendChild(this.screen);
    this.screen.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      sfx.click();
      this.handle(btn.dataset.action, btn);
    });
    game.onStateChange = (state, data) => this.onState(state, data);
    this.show('main');
  }

  handle(action) {
    const g = this.game;
    if (action === 'play') g.start();
    else if (action === 'resume') g.resume();
    else if (action === 'restart') g.start();
    else if (action === 'menu') { g.quitToMenu(); }
  }

  onState(state, data) {
    if (state === 'playing' || state === 'dying') this.hide();
    else if (state === 'paused') this.show('pause');
    else if (state === 'gameover') this.show('gameover', data);
    else if (state === 'menu') this.show('main');
  }

  hide() {
    this.screen.className = 'hidden';
    this.screen.innerHTML = '';
  }

  show(name, data) {
    this.current = name;
    this.screen.className = `screen${name === 'pause' || name === 'gameover' ? ' dim' : ''}`;
    this.screen.innerHTML = this[`render_${name}`](data);
    const first = this.screen.querySelector('.btn');
    if (first) first.focus({ preventScroll: true });
  }

  render_main() {
    return `
      <div class="title">STICKMAN <span class="accent">BRAIN ROT</span> FPS</div>
      <div class="subtitle">ENTER THE BRAINROT.</div>
      <div class="menu-buttons">
        <button class="btn go" data-action="play">PLAY</button>
      </div>`;
  }

  render_pause() {
    return `
      <h2>PAUSED</h2>
      <div class="hint">The mouse is free. Click resume to jump back in.</div>
      <div class="menu-buttons">
        <button class="btn go" data-action="resume">RESUME</button>
        <button class="btn alt" data-action="menu">QUIT TO MENU</button>
      </div>`;
  }

  render_gameover(d) {
    return `
      <h2>YOU GOT COOKED 💀</h2>
      <div class="stats-card">
        <div>SCORE: <span class="big">${String(d.score).padStart(6, '0')}</span></div>
        <div>KILLS: ${d.kills}</div>
        <div>WAVE: ${d.wave}</div>
        <div class="hint">BEST: ${String(d.best).padStart(6, '0')}</div>
      </div>
      ${d.newBest ? '<div class="newbest">NEW BEST. NO CAP.</div>' : ''}
      <div class="row-buttons">
        <button class="btn go" data-action="restart">RESTART</button>
        <button class="btn alt" data-action="menu">MAIN MENU</button>
      </div>`;
  }
}
