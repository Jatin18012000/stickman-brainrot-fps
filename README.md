# STICKMAN BRAIN ROT FPS

**ENTER THE BRAINROT.**

A fast, chaotic, arcade first-person shooter where you're a stickman with a
STICK BLASTER, and waves of googly-eyed stickmen named GOOBER, SKIBIDI and
GIGACHAD want to bonk you. Survive. Get kills. Don't get cooked.

Runs in any modern desktop browser. Needs a mouse and keyboard.

## Play it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173), choose a stick and press **PLAY**.

To build a static copy you can host anywhere (GitHub Pages, Netlify, itch.io):

```bash
npm run build      # writes dist/
npm run preview    # serves dist/ locally to check it
```

The build uses relative paths, so `dist/` works from any sub-folder.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Aim |
| Left click | Shoot (hold for auto) |
| `Esc` | Release the mouse / pause |
| `M` | Mute |

Mouse sensitivity is on the pause and How To Play screens.

## The sticks

| | Role | Health | Speed | Damage | Fire rate |
| --- | --- | --- | --- | --- | --- |
| **RED** | Assault | 100 | 1.00x | 1.00x | 1.00x |
| **BLUE** | Speed | 75 | 1.35x | 0.85x | 1.25x |
| **GREEN** | Tank | 160 | 0.75x | 1.35x | 0.80x |

The multipliers are real: they scale your run speed, the Stick Blaster's damage
per shot and its time between shots.

## The enemies

| | Health | Speed | Hit | Points |
| --- | --- | --- | --- | --- |
| **Normal stick** | 65 | 3.6 m/s | 10 | 100 |
| **Fast stick** | 40 | 6.4 m/s | 6 | 150 |
| **Big stick** | 240 | 2.4 m/s | 24 | 300 |

Sticks raise their arms (and their heads glow red) before they swing: back off
to make them whiff. Headshots do double damage.

Waves are 3, 5, 7 and 10 sticks, then 3–4 more each wave. Every wave adds 12%
health and 4% speed (up to +45%), and the share of fast and big sticks grows.
Clearing a wave heals 20 HP.

## How it's built

Plain JavaScript modules, [Three.js](https://threejs.org/) for rendering and
[Vite](https://vitejs.dev/) as the dev server and bundler. No other runtime
dependencies, no asset files: every model is simple geometry, every texture
is drawn on a canvas at startup, and every sound is synthesised with Web
Audio.

```
src/
  main.js        boot: creates the Game and the UI
  game.js        game state machine, main loop, shooting, scoring
  input.js       keyboard, mouse, pointer lock
  player.js      first-person movement, camera, collision, death cam
  characters.js  RED / BLUE / GREEN stats
  weapon.js      the Stick Blaster: viewmodel, fire rate, recoil, muzzle flash
  enemy.js       enemy types, stickman model, AI, hits, death, dancing
  navgrid.js     flow-field pathfinding around cover
  waves.js       wave sizes, composition and difficulty scaling
  arena.js       the arena layout, colliders, ray casts
  effects.js     pooled particles and tracers
  hud.js         in-game HUD, kill messages, announcements
  ui.js          main menu, character select, how to play, pause, game over
  brainrot.js    names, kill lines and other words
  audio.js       procedural sound effects
  style.css      all the styling
```

### Enemy AI

Enemies walk straight at you when nothing is in the way. When cover blocks the
direct line, they follow a flow field: a breadth-first search over a 1 m grid,
re-run only when you step into a new cell. That keeps them from getting stuck
on crates for well under a millisecond per frame, however many there are.

## Testing

```bash
npx playwright install chromium   # once
npm test                          # smoke test against the dev server
npm run test:dist                 # build, then smoke test the production bundle
```

The smoke test drives the whole loop in headless Chromium: menus, all three
characters (and checks their stats actually change speed, damage and fire
rate), pointer lock, WASD, mouse look, shooting, enemies chasing and
attacking, kills and score, waves 1–5, death, game over, restart and pause.
It fails on any console error.
