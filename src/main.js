import { Game } from './game.js';

const ui = document.getElementById('ui');
ui.innerHTML = `
  <div class="crosshair hidden" id="crosshair"></div>
  <div class="overlay" id="overlay">
    <h1>STICKMAN BRAIN ROT FPS</h1>
    <button class="btn" id="play">PLAY</button>
  </div>`;
const overlay = ui.querySelector('#overlay');
const crosshair = ui.querySelector('#crosshair');

const game = new Game(document.getElementById('game'), {
  onStart() { overlay.classList.add('hidden'); crosshair.classList.remove('hidden'); },
  onPause() { overlay.classList.remove('hidden'); crosshair.classList.add('hidden'); },
  onResume() { overlay.classList.add('hidden'); crosshair.classList.remove('hidden'); },
});
ui.querySelector('#play').addEventListener('click', () => {
  if (game.state === 'paused') game.resume(); else game.start();
});
window.__game = game;
