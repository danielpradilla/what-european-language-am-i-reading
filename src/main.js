// Entry point: loads data and modules (all with the same ?v= token), wires the tabs, keys and panels.
const V = new URL(import.meta.url).searchParams.get('v') ?? '';
const imp = (p) => import(`./${p}?v=${V}`);
const json = (p) => fetch(`${p}?v=${V}`).then((r) => r.json());
const $ = (s) => document.querySelector(s);

const [engineMod, storageMod, audioMod, boardMod, panelMod, urlMod, uiMod, commonMod, flagMod, mazeMod, detectMod, steerMod, arcadeMod, chart, flags, samples] = await Promise.all([
  imp('engine.js'), imp('storage.js'), imp('audio.js'), imp('board.js'), imp('text-panel.js'), imp('url-text.js'), imp('ui.js'), imp('page-common.js'), imp('flag-svg.js'),
  imp('modes/maze.js'), imp('modes/detect.js'), imp('modes/steer.js'), imp('modes/arcade.js'),
  json('src/data/chart.json'), json('assets/flags/flags.json'), json('data/samples.json'),
]);

const engine = engineMod.createEngine(chart);
const store = storageMod.createStore();
const audio = audioMod.createAudio(store);
const ctx = { engine, chart, flags, samples, store, audio, codePoints: engineMod.codePoints, lineCol: engineMod.lineCol, isUrl: urlMod.isUrl, menuReturn: false };

const aspect = await commonMod.loadAspects(flags);
ctx.board = boardMod.createBoard({ svg: $('#board'), mini: $('#minimap'), wrap: $('#board-wrap'), chart, flags, aspect, drawFlag: flagMod.drawFlag, store, codePoints: engineMod.codePoints });
ctx.ui = uiMod.createUi(ctx);
const { board, ui } = ctx;

// ---------- text panel, URL and samples ----------
let mode = null;
commonMod.setupText(ctx, { panelMod, urlMod, onInput: (text, info) => modes[mode]?.onText(text, info) });
const { panel } = ctx;
ctx.loadText = (text, m = 'detect') => { if (mode !== m) setMode(m); ctx.setMeta(null); panel.setText(text); };
ctx.refreshFog = () => modes.maze.refreshFog();

// ---------- modes ----------
const steer = steerMod.createSteer(ctx);
const modes = {
  maze: mazeMod.createMaze(ctx),
  detect: detectMod.createDetect(ctx),
  steer,
  arcade: arcadeMod.createArcade(ctx, steer),
};
const app = $('#app');
const tabs = [...document.querySelectorAll('#tabs [data-mode]')];
const NAMES = { maze: 'Maze', detect: 'Detect', steer: 'Steer', arcade: 'Arcade' };

function setMode(m) {
  if (m === mode) return;
  if (mode) modes[mode].exit();
  mode = m;
  app.dataset.mode = m;
  tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.mode === m)));
  document.querySelectorAll('[data-modes]').forEach((s) => { s.hidden = !s.dataset.modes.split(' ').includes(m); });
  $('#hud').hidden = m !== 'arcade';
  ui.clearNotice('live');
  modes[m].enter();
  history.replaceState(null, '', `#${m}`);
  ui.announce(`${NAMES[m]} mode.`);
  layout();
}
tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

// ---------- keys ----------
const MODE_KEYS = { 1: 'maze', 2: 'detect', 3: 'steer', 4: 'arcade' };
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) {
    if (e.key === 'Escape') t.blur();
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  if ((e.key === 'Enter' || e.key === ' ') && t.closest?.('button, a, summary, [role="button"]')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (MODE_KEYS[k]) { setMode(MODE_KEYS[k]); e.preventDefault(); return; }
  if (k === 'o') { board.overview(); e.preventDefault(); return; }
  if (k === 'm') { ui.toggleSound(); e.preventDefault(); return; }
  if (k === '+' || k === '=') { board.zoomBy(1.25); e.preventDefault(); return; }
  if (k === '-') { board.zoomBy(0.8); e.preventDefault(); return; }
  if (modes[mode].key?.(e)) e.preventDefault();
});

// ---------- buttons ----------
$('#btn-overview').addEventListener('click', () => board.overview());
$('#btn-zoom-in').addEventListener('click', () => board.zoomBy(1.25));
$('#btn-zoom-out').addEventListener('click', () => board.zoomBy(0.8));
$('#btn-collection').addEventListener('click', () => ui.openCollection());
$('#btn-options').addEventListener('click', () => { ctx.menuReturn = false; ui.openMenu('options'); });
$('#btn-about').addEventListener('click', () => ui.open($('#dlg-about')));
$('#btn-hint').addEventListener('click', () => steer.hint());
$('#pad').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const key = { y: 'y', n: 'n', back: 'Backspace' }[b.dataset.act];
  modes[mode].key?.({ key, preventDefault() {} });
});
$('#btn-next').addEventListener('click', () => { if (mode === 'steer') ctx.loadRandomSample(); });

// ---------- layout: phone bottom sheet ----------
const { layout } = commonMod.setupSheet();

// ---------- start ----------
ui.updateCount();
const deepLang = location.hash.match(/^#lang=([\w-]+)$/)?.[1]; // from the Europe map: open that language's card
const start = (location.hash.slice(1) in modes) ? location.hash.slice(1) : 'detect';
board.overview(true);
setMode(start);
if (deepLang && chart.leaves[deepLang]) ui.showCard(deepLang);
if (new URLSearchParams(location.search).has('debug')) window.wela = { ...ctx, modes, setMode }; // test hook, off by default
