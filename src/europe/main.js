// Entry point of the Europe map page: loads data and modules (all with the same ?v= token), wires the tabs, keys and panels.
const V = new URL(import.meta.url).searchParams.get('v') ?? '';
const imp = (p) => import(`../${p}?v=${V}`);
const json = (p) => fetch(`${p}?v=${V}`).then((r) => r.json());
const $ = (s) => document.querySelector(s);

const [engineMod, storageMod, audioMod, panelMod, urlMod, uiMod, commonMod, flagMod, modelMod, mapMod, layoutMod, exploreMod, replayMod, detectMod, guessMod, europe, modelData, chart, flags, samples] = await Promise.all([
  imp('engine.js'), imp('storage.js'), imp('audio.js'), imp('text-panel.js'), imp('url-text.js'), imp('ui.js'), imp('page-common.js'), imp('flag-svg.js'), imp('model.js'),
  imp('europe/map.js'), imp('europe/layout.js'), imp('europe/explore.js'), imp('europe/replay.js'), imp('europe/detect.js'), imp('europe/guess.js'),
  json('src/data/europe.json'), json('src/data/model.json'), json('src/data/chart.json'), json('assets/flags/flags.json'), json('data/samples.json'),
]);

const engine = engineMod.createEngine(chart);
const store = storageMod.createStore('wela.europe.scores'); // the poster's Arcade keeps its own table
const audio = audioMod.createAudio(store);
const ctx = { engine, chart, model: modelMod.createModel(modelData), europe, flags, samples, store, audio, codePoints: engineMod.codePoints, lineCol: engineMod.lineCol, isUrl: urlMod.isUrl, menuReturn: false };

const aspect = await commonMod.loadAspects(flags);
ctx.map = mapMod.createEuropeMap({ svg: $('#board'), mini: $('#minimap'), wrap: $('#board-wrap'), europe, chart, flags, aspect, drawFlag: flagMod.drawFlag, layout: layoutMod, store });
ctx.ui = uiMod.createUi(ctx);
const { map, ui } = ctx;

// ---------- Map switch (board tools and Options share one saved setting, on by default) ----------
const applyMap = () => {
  const on = store.settings.map !== false;
  map.setScenery(on);
  $('#board-map').checked = $('#opt-map').checked = on;
};
for (const id of ['#board-map', '#opt-map']) $(id).addEventListener('change', (e) => store.set('map', e.target.checked));
store.onChange(applyMap);
applyMap();

// ---------- text panel, URL and samples ----------
let mode = null;
commonMod.setupText(ctx, { panelMod, urlMod, onInput: (text, info) => modes[mode]?.onText(text, info) });
const { panel } = ctx;
ctx.loadText = (text, m = 'detect') => { if (mode !== m) setMode(m); ctx.setMeta(null); panel.setText(text); };

// ---------- modes ----------
const replay = replayMod.createReplay(ctx);
const explore = exploreMod.createExplore(ctx);
ctx.openCard = (code) => ui.showCard(code, explore.cardExtra(code));
const modes = { explore, detect: detectMod.createDetect(ctx, replay), guess: guessMod.createGuess(ctx, replay) };
const app = $('#app');
const tabs = [...document.querySelectorAll('#tabs [data-mode]')];
const NAMES = { explore: 'Explore', detect: 'Detect', guess: 'Guess the station' };

function setMode(m) {
  if (m === mode) return;
  if (mode) modes[mode].exit();
  mode = m;
  app.dataset.mode = m;
  tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.mode === m)));
  document.querySelectorAll('[data-modes]').forEach((s) => { s.hidden = !s.dataset.modes.split(' ').includes(m); });
  $('#legend-box').open = m === 'explore';
  $('#hud').hidden = m !== 'guess';
  ui.clearNotice('live');
  modes[m].enter();
  history.replaceState(null, '', `#${m}`);
  ui.announce(`${NAMES[m]} mode.`);
  layout();
}
tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

map.on.station = (c) => modes[mode].onStation?.(c);
map.on.hover = (h) => { if (mode === 'explore') explore.onHover(h); };
map.on.line = (id) => explore.onLine(id);

// ---------- keys ----------
const MODE_KEYS = { 1: 'explore', 2: 'detect', 3: 'guess' };
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
  if (k === 'o') { map.overview(); e.preventDefault(); return; }
  if (k === 'f') { fullscreen(); e.preventDefault(); return; }
  if (k === 'Escape' && document.documentElement.classList.contains('board-full')) { fullscreen(false); e.preventDefault(); return; }
  if (k === 'm') { ui.toggleSound(); e.preventDefault(); return; }
  if (k === '+' || k === '=') { map.zoomBy(1.25); e.preventDefault(); return; }
  if (k === '-') { map.zoomBy(0.8); e.preventDefault(); return; }
  if (k === 'Escape') { explore.hideIntro(); return; }
  if (modes[mode].key?.(e) || (mode !== 'detect' && explore.key(e))) e.preventDefault();
});

// ---------- buttons ----------
$('#btn-overview').addEventListener('click', () => map.overview());
$('#btn-zoom-in').addEventListener('click', () => map.zoomBy(1.25));
$('#btn-zoom-out').addEventListener('click', () => map.zoomBy(0.8));
$('#btn-collection').addEventListener('click', () => ui.openCollection());
$('#btn-options').addEventListener('click', () => { ctx.menuReturn = false; ui.openMenu('options'); });
$('#btn-about').addEventListener('click', () => ui.open($('#dlg-about')));

// ---------- layout: phone bottom sheet ----------
const { layout } = commonMod.setupSheet();
const fullscreen = commonMod.setupFullscreen();

// ---------- start ----------
ui.updateCount();
const deepLang = location.hash.match(/^#lang=([\w-]+)$/)?.[1];
const start = (location.hash.slice(1) in modes) ? location.hash.slice(1) : 'explore';
map.home(true);
setMode(start);
if (deepLang && europe.stations[deepLang]) { explore.select(deepLang, true); map.centerOn(deepLang, 1.2); }
if (new URLSearchParams(location.search).has('debug')) window.wela = { ...ctx, modes, setMode, replay }; // test hook, off by default
