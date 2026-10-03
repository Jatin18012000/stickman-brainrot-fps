import { Game } from './game.js';
import { UI } from './ui.js';

const uiRoot = document.getElementById('ui');
const game = new Game(document.getElementById('game'), uiRoot);
const ui = new UI(uiRoot, game);

// Handy for poking at the game from the console (and for the smoke test).
window.__game = game;
window.__ui = ui;
