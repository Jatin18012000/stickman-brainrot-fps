// End-to-end smoke test: boots the game in headless Chromium and walks the
// whole V1 loop — menu, character select, pointer lock, movement, mouse look,
// shooting, enemies, waves, death, game over, restart.
//
//   npm test                 # against the dev server (started here)
//   npm test -- --dist       # against the production build in dist/
//
// Needs Chromium for Playwright: `npx playwright install chromium` once.
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';

const useDist = process.argv.includes('--dist');
const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const server = useDist
  ? await preview({ preview: { port: 4173, strictPort: false }, logLevel: 'error' })
  : await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' }).then((s) => s.listen());
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const ev = (fn, arg) => page.evaluate(fn, arg);
const mouse = (type, init) => ev(([t, i]) => document.dispatchEvent(new MouseEvent(t, i)), [type, init]);

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__ui);

  // ---- Menu ----
  check('main menu loads', await page.isVisible('[data-action="play"]')
    && await page.isVisible('[data-action="characters"]') && await page.isVisible('[data-action="howto"]'));
  await page.click('[data-action="howto"]');
  check('how to play screen', (await page.textContent('.screen')).includes("DON'T GET COOKED"));
  await page.click('[data-action="back"]');
  await page.click('[data-action="characters"]');
  check('characters screen', (await page.textContent('.screen h2')) === 'CHOOSE YOUR STICK');
  await page.click('[data-action="back"]');

  // ---- Characters: stats must change gameplay, not just the card ----
  const measured = {};
  for (const key of ['red', 'blue', 'green']) {
    await page.click('[data-action="play"]');
    await page.click(`.char-card[data-key="${key}"]`);
    await page.click('[data-action="start"]');
    await page.waitForTimeout(150);
    measured[key] = await ev(() => {
      const g = window.__game;
      const p = g.player;
      const w = g.weapon;
      g.waves.state = 'idle';
      g.enemies.clear();
      p.position.set(0, 0, 3);
      p.velocity.set(0, 0, 0);
      p.yaw = Math.PI / 2;
      const fake = { consumeMouse: () => ({ x: 0, y: 0 }), moveAxes: () => ({ forward: 1, strafe: 0 }) };
      for (let i = 0; i < 60; i++) p.update(1 / 60, fake);
      const run = Math.hypot(p.position.x, p.position.z - 3);
      w.cooldown = 0;
      let shots = 0;
      for (let i = 0; i < 180; i++) if (w.update(1 / 60, p, true)) shots++;
      return { hp: p.maxHealth, run, shots, dmg: w.damage, name: g.character.name };
    });
    await ev(() => window.__game.quitToMenu());
  }
  const { red, blue, green } = measured;
  check('RED stats', red.hp === 100 && red.dmg === 25 && red.shots === 15, JSON.stringify(red));
  check('BLUE stats', blue.hp === 75 && Math.abs(blue.run / red.run - 1.35) < 0.02
    && Math.abs(blue.dmg - 21.25) < 1e-9 && blue.shots > red.shots, JSON.stringify(blue));
  check('GREEN stats', green.hp === 160 && Math.abs(green.run / red.run - 0.75) < 0.02
    && Math.abs(green.dmg - 33.75) < 1e-9 && green.shots < red.shots, JSON.stringify(green));

  // ---- FPS core ----
  await page.click('[data-action="play"]');
  await page.click('.char-card[data-key="red"]');
  await page.click('[data-action="start"]');
  await page.waitForTimeout(200);
  check('pointer lock on PLAY', await ev(() => !!document.pointerLockElement && window.__game.state === 'playing'));
  await ev(() => { window.__game.waves.state = 'idle'; });
  const before = await ev(() => window.__game.player.position.toArray());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  const after = await ev(() => window.__game.player.position.toArray());
  check('WASD moves the player', after[2] < before[2] - 0.5 && after[0] > before[0] + 0.3,
    `${before.map((v) => v.toFixed(1))} -> ${after.map((v) => v.toFixed(1))}`);
  const look = await ev(() => {
    const p = window.__game.player;
    const y0 = p.yaw;
    for (let i = 0; i < 5; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementX: 30, movementY: 10 }));
    return new Promise((r) => setTimeout(() => r({ dyaw: p.yaw - y0, pitch: p.pitch }), 100));
  });
  check('mouse look turns the camera', look.dyaw < -0.2 && look.pitch < -0.05, JSON.stringify(look));
  const clamp = await ev(() => {
    for (let i = 0; i < 40; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementY: -200 }));
    return new Promise((r) => setTimeout(() => r(window.__game.player.pitch), 100));
  });
  check('vertical look is clamped', clamp > 1.4 && clamp < 1.5, clamp.toFixed(3));

  // ---- Shooting and enemies ----
  const combat = await ev(async () => {
    const g = window.__game;
    const p = g.player;
    g.enemies.clear();
    p.position.set(0, 0, 3);
    const e = g.enemies.spawn('normal', 0, -5);
    e.state = 'chase';
    e.body.position.y = 0;
    const kills0 = g.kills;
    const score0 = g.score;
    // Aim at its chest and hold the trigger through the real input path.
    const aim = () => {
      const dx = e.position.x - p.position.x;
      const dz = e.position.z - p.position.z;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2(1.0 - 1.6, Math.hypot(dx, dz));
      p.recoilPitch = 0;
    };
    aim();
    const hp0 = e.health;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    let tookDamage = false;
    for (let i = 0; i < 100 && e.alive; i++) {
      aim();
      await new Promise((r) => requestAnimationFrame(r));
      if (e.health < hp0) tookDamage = true;
    }
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    return { tookDamage, died: !e.alive, kills: g.kills - kills0, score: g.score - score0 };
  });
  check('shooting damages an enemy', combat.tookDamage);
  check('enemy dies', combat.died);
  check('kill counter and score increase', combat.kills === 1 && combat.score === 100, JSON.stringify(combat));

  const attack = await ev(async () => {
    const g = window.__game;
    const p = g.player;
    g.enemies.clear();
    p.health = p.maxHealth;
    const e = g.enemies.spawn('normal', 0, -4);
    const start = e.position.clone();
    for (let i = 0; i < 400 && p.health === p.maxHealth; i++) await new Promise((r) => requestAnimationFrame(r));
    return { moved: e.position.distanceTo(start), hp: p.health, max: p.maxHealth };
  });
  check('enemy moves toward the player', attack.moved > 1, attack.moved.toFixed(2));
  check('enemy attack damages the player', attack.hp < attack.max, `${attack.hp}/${attack.max}`);

  // ---- Waves (logic run without rendering, so it is quick) ----
  const waves = await ev(() => {
    const g = window.__game;
    const p = g.player;
    g.enemies.clear();
    g.waves.begin();
    g.damagePlayer = () => {};
    const counts = [];
    const mods = [];
    const prevStart = g.waves.onWaveStart;
    g.waves.onWaveStart = (w, n) => { counts.push(n); mods.push(g.waves.mods.health); prevStart(w, n); };
    counts.push(g.waves.total);
    mods.push(g.waves.mods.health);
    let t = 0;
    while (g.waves.wave < 5 && t < 600) {
      let best = null;
      let bd = Infinity;
      for (const e of g.enemies.enemies) {
        if (!e.alive || e.state === 'spawning') continue;
        const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
        if (d < bd) { bd = d; best = e; }
      }
      g.input.fireHeld = !!best;
      if (best) {
        const dx = best.position.x - p.position.x;
        const dz = best.position.z - p.position.z;
        p.yaw = Math.atan2(-dx, -dz);
        p.pitch = Math.atan2(best.scale - 1.6, Math.hypot(dx, dz));
        p.recoilPitch = 0;
      }
      g.update(1 / 60);
      t += 1 / 60;
    }
    g.input.fireHeld = false;
    delete g.damagePlayer; // back to the prototype method
    return { wave: g.waves.wave, counts, mods };
  });
  check('waves progress', waves.wave >= 5, `reached wave ${waves.wave}`);
  check('wave sizes 3/5/7/10', waves.counts.slice(0, 4).join() === '3,5,7,10', waves.counts.join());
  check('difficulty increases', waves.mods.every((m, i) => i === 0 || m > waves.mods[i - 1]), waves.mods.join());

  // ---- Death, game over, restart ----
  await ev(() => { const g = window.__game; g.player.health = 1; g.damagePlayer(10); });
  check('player can die', await ev(() => window.__game.state === 'dying'));
  const ended = await ev(async () => {
    const g = window.__game;
    let frames = 0;
    for (; frames < 600 && g.state !== 'gameover'; frames++) await new Promise((r) => requestAnimationFrame(r));
    return { state: g.state, frames, deathTimer: g.deathTimer };
  });
  check('death leads to game over', ended.state === 'gameover', JSON.stringify(ended));
  const over = await page.textContent('.screen');
  check('game over screen', over.includes('YOU GOT COOKED') && over.includes('SCORE') && over.includes('KILLS')
    && over.includes('WAVE'));
  check('mouse released on game over', await ev(() => !document.pointerLockElement));
  await page.click('[data-action="restart"]');
  await page.waitForTimeout(200);
  const restarted = await ev(() => {
    const g = window.__game;
    return {
      state: g.state, score: g.score, kills: g.kills, wave: g.waves.wave, hp: g.player.health,
      locked: !!document.pointerLockElement, enemies: g.enemies.enemies.length,
    };
  });
  check('restart resets the game', restarted.state === 'playing' && restarted.score === 0 && restarted.kills === 0
    && restarted.wave === 1 && restarted.hp === 100 && restarted.locked && restarted.enemies === 0, JSON.stringify(restarted));
  const respawn = await ev(async () => {
    const g = window.__game;
    for (let i = 0; i < 600 && g.enemies.aliveCount === 0; i++) await new Promise((r) => requestAnimationFrame(r));
    return { alive: g.enemies.aliveCount, state: g.state, waves: g.waves.state, timer: g.waves.timer };
  });
  check('play again: enemies spawn after restart', respawn.alive > 0, JSON.stringify(respawn));

  // ---- Pause ----
  await ev(() => document.exitPointerLock());
  await page.waitForTimeout(150);
  check('ESC (pointer unlock) pauses', await ev(() => window.__game.state === 'paused' && window.__ui.current === 'pause'));

} catch (err) {
  check('test run', false, err.stack || String(err));
} finally {
  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  await server.close();
}

console.log(`\nStickman Brain Rot FPS — smoke test (${useDist ? 'production build' : 'dev server'})\n`);
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
