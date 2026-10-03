import { WEAPON_NAME } from './weapon.js';

// In-game overlay. DOM nodes are written only when their value changes so the
// HUD costs next to nothing per frame.

export class Hud {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hp-text">HP: <b data-hp>100</b> / <span data-maxhp>100</span></div>
        <div class="hp-bar"><div class="hp-fill" data-hpfill></div></div>
      </div>
      <div class="hud-tc">
        <div class="wave-label" data-wave>WAVE 1</div>
        <div class="wave-left" data-left></div>
      </div>
      <div class="hud-tr">
        <div>SCORE: <b data-score>000000</b></div>
        <div>KILLS: <b data-kills>0</b></div>
      </div>
      <div class="crosshair" data-crosshair><i></i><i></i><i></i><i></i></div>
      <div class="hitmarker" data-hitmarker></div>
      <div class="killmsg" data-killmsg></div>
      <div class="announce" data-announce><div class="announce-title"></div><div class="announce-sub"></div></div>
      <div class="hud-br"><div class="weapon-name">${WEAPON_NAME}</div><div class="char-tag" data-char></div></div>
      <div class="damage-flash" data-flash></div>
      <div class="lowhp" data-lowhp></div>
    `;
    root.appendChild(this.root);
    const q = (k) => this.root.querySelector(`[data-${k}]`);
    this.el = {
      hp: q('hp'), maxhp: q('maxhp'), hpfill: q('hpfill'), wave: q('wave'), left: q('left'),
      score: q('score'), kills: q('kills'), crosshair: q('crosshair'), hitmarker: q('hitmarker'),
      killmsg: q('killmsg'), announce: q('announce'), flash: q('flash'), lowhp: q('lowhp'), char: q('char'),
    };
    this.el.announceTitle = this.el.announce.querySelector('.announce-title');
    this.el.announceSub = this.el.announce.querySelector('.announce-sub');
    this.cache = {};
    this.killTimer = 0;
    this.announceTimer = 0;
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  set(key, value, write) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    write(value);
  }

  setCharacter(ch) {
    this.el.char.textContent = `${ch.name} · ${ch.role}`;
    this.el.char.style.color = ch.css;
    this.root.style.setProperty('--player-color', ch.css);
  }

  update(dt, game) {
    const p = game.player;
    const hp = Math.ceil(p.health);
    this.set('hp', hp, (v) => { this.el.hp.textContent = v; });
    this.set('maxhp', p.maxHealth, (v) => { this.el.maxhp.textContent = v; });
    const frac = Math.max(0, p.health / p.maxHealth);
    this.set('hpfill', frac.toFixed(3), () => {
      this.el.hpfill.style.transform = `scaleX(${frac})`;
      this.el.hpfill.classList.toggle('low', frac <= 0.3);
    });
    this.set('lowhp', frac <= 0.3 && p.alive, (v) => this.el.lowhp.classList.toggle('on', v));
    this.set('wave', game.waves.wave, (v) => { this.el.wave.textContent = `WAVE ${v}`; });
    const left = game.waves.state === 'active' || game.waves.state === 'intro' ? game.waves.remaining : 0;
    this.set('left', left, (v) => { this.el.left.textContent = v > 0 ? `${v} STICK${v === 1 ? '' : 'S'} LEFT` : ''; });
    this.set('score', game.score, (v) => { this.el.score.textContent = String(v).padStart(6, '0'); });
    this.set('kills', game.kills, (v) => { this.el.kills.textContent = v; });

    if (this.killTimer > 0) {
      this.killTimer -= dt;
      if (this.killTimer <= 0) this.el.killmsg.classList.remove('on');
    }
    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.el.announce.classList.remove('on');
    }
  }

  hitmarker(head, kill) {
    const el = this.el.hitmarker;
    el.className = 'hitmarker';
    void el.offsetWidth; // restart the CSS animation
    el.className = `hitmarker on${head ? ' head' : ''}${kill ? ' kill' : ''}`;
  }

  damageFlash(strength) {
    const el = this.el.flash;
    el.style.setProperty('--strength', Math.min(1, 0.35 + strength).toFixed(2));
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  // One big message at a time; a new kill replaces the old one.
  killMessage(text, sub) {
    const el = this.el.killmsg;
    el.innerHTML = '';
    const main = document.createElement('div');
    main.className = 'killmsg-main';
    main.textContent = text;
    el.appendChild(main);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'killmsg-sub';
      s.textContent = sub;
      el.appendChild(s);
    }
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.killTimer = 1.1;
  }

  announce(title, sub, seconds = 2.2) {
    this.el.announceTitle.textContent = title;
    this.el.announceSub.textContent = sub || '';
    const el = this.el.announce;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.announceTimer = seconds;
  }

  reset() {
    this.cache = {};
    this.killTimer = 0;
    this.announceTimer = 0;
    this.el.killmsg.classList.remove('on');
    this.el.announce.classList.remove('on');
    this.el.flash.classList.remove('on');
  }
}
