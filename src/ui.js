import { sfx, toggleMute, isMuted } from './audio.js';
import { CHARACTERS, CHARACTER_ORDER, loadPick, savePick } from './characters.js';

const BAR_BLOCKS = 10;

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
    this.pick = loadPick();
    document.addEventListener('keydown', (e) => this.onKey(e));
    game.onStateChange = (state, data) => this.onState(state, data);
    this.show('main');
  }

  onKey(e) {
    if (e.code === 'KeyM' && !e.repeat) {
      const muted = toggleMute();
      const tag = this.screen.querySelector('[data-mute]');
      if (tag) tag.textContent = muteLabel(muted);
      if (this.game.state === 'playing') this.game.hud.announce(muted ? 'MUTED' : 'SOUND ON', '', 0.9);
      return;
    }
    // A focused button already handles Enter/Space itself.
    const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (this.current === 'gameover' && !onButton && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      this.game.start();
      return;
    }
    if (this.current !== 'select') return;
    if (e.code === 'Enter' && !e.repeat && !onButton) {
      e.preventDefault();
      this.game.start(CHARACTERS[this.pick]);
      return;
    }
    const i = CHARACTER_ORDER.indexOf(this.pick);
    let next = null;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') next = CHARACTER_ORDER[Number(e.code.slice(-1)) - 1];
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') next = CHARACTER_ORDER[(i + 2) % 3];
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') next = CHARACTER_ORDER[(i + 1) % 3];
    if (next) {
      e.preventDefault();
      sfx.click();
      this.select(next);
    }
  }

  select(key) {
    this.pick = key;
    savePick(key);
    for (const card of this.screen.querySelectorAll('.char-card')) {
      card.classList.toggle('picked', card.dataset.key === key);
      card.setAttribute('aria-pressed', card.dataset.key === key);
    }
    const go = this.screen.querySelector('[data-action="start"]');
    if (go) go.textContent = `PLAY AS ${CHARACTERS[key].name}`;
  }

  handle(action, btn) {
    const g = this.game;
    if (action === 'play' || action === 'characters') this.show('select');
    else if (action === 'pick') this.select(btn.dataset.key);
    else if (action === 'start') g.start(CHARACTERS[this.pick]);
    else if (action === 'back') this.show('main');
    else if (action === 'howto') this.show('howto');
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
    this.screen.className = `screen screen-${name}${name === 'pause' || name === 'gameover' ? ' dim' : ''}`;
    this.screen.innerHTML = this[`render_${name}`](data);
    const first = this.screen.querySelector('.btn');
    if (first) first.focus({ preventScroll: true });
  }

  render_main() {
    const c = CHARACTERS[this.pick];
    const best = this.game.best;
    return `
      <div class="title">STICKMAN<br><span class="accent">BRAIN ROT</span> FPS</div>
      <div class="subtitle">ENTER THE BRAINROT.</div>
      <div class="menu-buttons">
        <button class="btn go" data-action="play">PLAY</button>
        <button class="btn" data-action="characters">CHARACTERS</button>
        <button class="btn alt" data-action="howto">HOW TO PLAY</button>
      </div>
      <div class="selected-tag">STICK: <span style="color:${c.css}">${c.name}</span> · ${c.role}</div>
      ${best > 0 ? `<div class="hint">BEST SCORE: ${String(best).padStart(6, '0')}</div>` : ''}
      <div class="hint" data-mute>${muteLabel(isMuted())}</div>`;
  }

  render_howto() {
    const key = (k, label) => `<div class="key-row"><span class="key">${k}</span><span class="key-label">${label}</span></div>`;
    return `
      <h2>HOW TO PLAY</h2>
      <div class="keys">
        ${key('WASD', 'MOVE')}
        ${key('MOUSE', 'AIM')}
        ${key('LEFT CLICK', 'SHOOT (HOLD FOR AUTO)')}
        ${key('ESC', 'RELEASE MOUSE / PAUSE')}
        ${key('M', 'MUTE')}
      </div>
      <div class="objective">SURVIVE. GET KILLS. DON'T GET COOKED.</div>
      <div class="howto-notes">
        <div><b style="color:#fff">NORMAL STICK</b> 100 pts · <b style="color:#ff9a2e">FAST STICK</b> 150 pts · <b style="color:#b07aff">BIG STICK</b> 300 pts</div>
        <div>Headshots deal double damage. Back off when a stick raises its arms to dodge the bonk.</div>
        <div>Clearing a wave heals you a little.</div>
      </div>
      <div class="row-buttons">
        <button class="btn go" data-action="play">PLAY</button>
        <button class="btn alt" data-action="back">BACK</button>
      </div>`;
  }

  render_select() {
    const cards = CHARACTER_ORDER.map((k, i) => {
      const c = CHARACTERS[k];
      return `
        <button class="char-card${k === this.pick ? ' picked' : ''}" data-action="pick" data-key="${k}"
          aria-pressed="${k === this.pick}" style="--c:${c.css}">
          <span class="char-num">${i + 1}</span>
          ${stickSvg(k, c.css)}
          <span class="char-name">${c.name}</span>
          <span class="char-role">${c.role}</span>
          <span class="char-stats">
            ${statRow('HP', c.health / 160, String(c.health))}
            ${statRow('SPD', c.speed / 2, `${c.speed.toFixed(2)}x`)}
            ${statRow('DMG', c.damage / 2, `${c.damage.toFixed(2)}x`)}
            ${statRow('FIRE', c.fireRate / 2, `${c.fireRate.toFixed(2)}x`)}
          </span>
          <span class="char-blurb">${c.blurb}</span>
        </button>`;
    }).join('');
    return `
      <h2>CHOOSE YOUR STICK</h2>
      <div class="char-cards">${cards}</div>
      <div class="row-buttons">
        <button class="btn go" data-action="start">PLAY AS ${CHARACTERS[this.pick].name}</button>
        <button class="btn alt" data-action="back">BACK</button>
      </div>
      <div class="hint">1 / 2 / 3 or ← → to pick</div>`;
  }

  render_pause() {
    return `
      <h2>PAUSED</h2>
      <div class="hint">The mouse is free. Click resume to jump back in.</div>
      <div class="hint">WASD move · MOUSE aim · CLICK shoot · M mute</div>
      <div class="menu-buttons">
        <button class="btn go" data-action="resume">RESUME</button>
        <button class="btn alt" data-action="menu">QUIT TO MENU</button>
      </div>`;
  }

  render_gameover(d) {
    return `
      <h2>YOU GOT COOKED 💀</h2>
      <div class="subtitle">${d.line}</div>
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
      </div>
      <div class="hint">ENTER to restart</div>`;
  }
}

function muteLabel(muted) {
  return muted ? 'SOUND OFF · M to unmute' : 'SOUND ON · M to mute';
}

function statRow(label, frac, value) {
  const filled = Math.max(1, Math.min(BAR_BLOCKS, Math.round(frac * BAR_BLOCKS)));
  let blocks = '';
  for (let i = 0; i < BAR_BLOCKS; i++) blocks += `<i class="${i < filled ? 'on' : ''}"></i>`;
  return `<span class="stat"><span class="stat-label">${label}</span><span class="stat-bar">${blocks}</span><span class="stat-val">${value}</span></span>`;
}

// Little stickman portraits: GREEN is thick, BLUE leans forward mid-sprint,
// RED stands ready with a blaster.
function stickSvg(key, color) {
  const w = key === 'green' ? 9 : key === 'blue' ? 5 : 6.5;
  const poses = {
    red: `<circle cx="60" cy="28" r="14"/><line x1="60" y1="42" x2="60" y2="88"/>
      <line x1="60" y1="55" x2="88" y2="62"/><line x1="60" y1="55" x2="84" y2="70"/>
      <rect x="82" y="56" width="26" height="9" rx="2" fill="#1b1530" stroke="none"/>
      <line x1="60" y1="88" x2="46" y2="122"/><line x1="60" y1="88" x2="74" y2="122"/>`,
    blue: `<circle cx="70" cy="30" r="13"/><line x1="66" y1="43" x2="54" y2="86"/>
      <line x1="62" y1="56" x2="88" y2="48"/><line x1="62" y1="56" x2="36" y2="70"/>
      <line x1="54" y1="86" x2="78" y2="104"/><line x1="78" y1="104" x2="74" y2="122"/>
      <line x1="54" y1="86" x2="34" y2="112"/>
      <line x1="10" y1="50" x2="28" y2="50" stroke-width="3"/><line x1="4" y1="66" x2="24" y2="66" stroke-width="3"/>
      <line x1="12" y1="82" x2="30" y2="82" stroke-width="3"/>`,
    green: `<circle cx="60" cy="27" r="16"/><line x1="60" y1="43" x2="60" y2="86"/>
      <line x1="60" y1="54" x2="30" y2="40"/><line x1="60" y1="54" x2="90" y2="40"/>
      <line x1="30" y1="40" x2="30" y2="24"/><line x1="90" y1="40" x2="90" y2="24"/>
      <line x1="60" y1="86" x2="40" y2="122"/><line x1="60" y1="86" x2="80" y2="122"/>`,
  };
  return `<svg class="char-svg" viewBox="0 0 120 130" aria-hidden="true" fill="none" stroke="${color}"
    stroke-width="${w}" stroke-linecap="round">${poses[key]}</svg>`;
}
