// Entry point: loads data and modules (all with the same ?v= token), wires the tabs, keys and panels.
const V = new URL(import.meta.url).searchParams.get('v') ?? '';
const imp = (p) => import(`./${p}?v=${V}`);
const json = (p) => fetch(`${p}?v=${V}`).then((r) => r.json());
const $ = (s) => document.querySelector(s);

const [engineMod, storageMod, audioMod, boardMod, panelMod, urlMod, uiMod, mazeMod, detectMod, steerMod, arcadeMod, chart, flags, samples] = await Promise.all([
  imp('engine.js'), imp('storage.js'), imp('audio.js'), imp('board.js'), imp('text-panel.js'), imp('url-text.js'), imp('ui.js'),
  imp('modes/maze.js'), imp('modes/detect.js'), imp('modes/steer.js'), imp('modes/arcade.js'),
  json('src/data/chart.json'), json('assets/flags/flags.json'), json('data/samples.json'),
]);

const engine = engineMod.createEngine(chart);
const store = storageMod.createStore();
const audio = audioMod.createAudio(store);
const ctx = { engine, chart, flags, samples, store, audio, codePoints: engineMod.codePoints, lineCol: engineMod.lineCol, isUrl: urlMod.isUrl, menuReturn: false };

// <image> ignores preserveAspectRatio="slice" for SVG files, so the board needs each flag's aspect to crop it itself.
const aspect = {};
await Promise.all(Object.keys(flags.files).map(async (f) => {
  try {
    const tag = (await (await fetch(`assets/flags/${f}`)).text()).match(/<svg\b[^>]*>/is)?.[0] ?? '';
    const vb = tag.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1].trim().split(/[\s,]+/).map(Number);
    const wh = [/\swidth\s*=\s*"([\d.]+)/i, /\sheight\s*=\s*"([\d.]+)/i].map((re) => parseFloat(tag.match(re)?.[1]));
    aspect[f] = (vb ? vb[2] / vb[3] : wh[0] / wh[1]) || 1.5;
  } catch { aspect[f] = 1.5; }
}));
ctx.board = boardMod.createBoard({ svg: $('#board'), mini: $('#minimap'), wrap: $('#board-wrap'), chart, flags, aspect, store, codePoints: engineMod.codePoints });
ctx.ui = uiMod.createUi(ctx);
const { board, ui } = ctx;

// ---------- text panel, URL and samples ----------
let meta = null; // { text, html }: source line for the current text
const metaEl = $('#text-meta');
const urlRow = $('#url-row');
let mode = null;

ctx.panel = panelMod.createTextPanel({
  edit: $('#tp-edit'), badgesEl: $('#tp-badges'),
  onInput(text, info) {
    urlRow.hidden = !ctx.isUrl(text);
    if (meta && meta.text !== text) meta = null;
    metaEl.innerHTML = meta ? meta.html : text ? `${[...text].length.toLocaleString('en')} characters` : '';
    ui.clearNotice('fetch');
    if (info.truncated) ui.notice('truncated', 'warning', `Text cut to ${panelMod.MAX_CHARS.toLocaleString('en')} characters`, 'Only the first part is routed.');
    else ui.clearNotice('truncated');
    modes[mode]?.onText(text, info);
  },
});
const { panel } = ctx;

ctx.loadText = (text, m = 'detect') => { if (mode !== m) setMode(m); meta = null; panel.setText(text); };
let lastSample = -1;
ctx.loadRandomSample = () => {
  let i;
  do { i = Math.floor(Math.random() * samples.length); } while (i === lastSample && samples.length > 1);
  lastSample = i;
  const s = samples[i];
  meta = { text: s.text, html: `Sample: <a href="${ui.esc(s.source)}" target="_blank" rel="noopener">${ui.esc(s.title || s.source)}</a> · ${ui.esc(s.license)}` };
  panel.setText(s.text);
};
ctx.refreshFog = () => modes.maze.refreshFog();

async function doFetch() {
  const url = panel.text().trim();
  if (!ctx.isUrl(url)) return;
  const btn = $('#btn-fetch');
  btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
  ui.clearNotice('fetch');
  try {
    const { text, lang, finalUrl } = await urlMod.fetchText(url);
    const host = new URL(finalUrl).host;
    meta = { text, html: `Fetched from <a href="${ui.esc(finalUrl)}" target="_blank" rel="noopener">${ui.esc(host)}</a> · page declares <code>${ui.esc(lang || 'no language')}</code>` };
    panel.setText(text);
  } catch (err) {
    ui.notice('fetch', 'error', 'Could not fetch that page', err.message);
  } finally {
    btn.removeAttribute('aria-busy'); btn.disabled = false;
  }
}
$('#btn-fetch').addEventListener('click', doFetch);
panel.edit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && ctx.isUrl(panel.text())) { e.preventDefault(); doFetch(); }
});
$('#btn-sample').addEventListener('click', () => ctx.loadRandomSample());
$('#btn-clear').addEventListener('click', () => { meta = null; panel.setText(''); panel.focus(); });

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
const side = $('#side'), handle = $('#sheet-handle'), boardPanel = document.querySelector('.board-panel');
const narrow = matchMedia('(max-width: 899px)');
function layout() {
  if (!narrow.matches) { boardPanel.style.height = ''; side.style.removeProperty('--peek'); document.body.style.paddingBottom = ''; return; }
  const peek = Math.round(innerHeight * 0.36);
  side.style.setProperty('--peek', `${peek}px`);
  document.body.style.paddingBottom = `${peek}px`;
  const top = boardPanel.getBoundingClientRect().top + scrollY;
  boardPanel.style.height = `${Math.max(260, innerHeight - top - peek - 6)}px`;
}
addEventListener('resize', layout);
narrow.addEventListener('change', layout);
handle.addEventListener('click', () => {
  const open = side.dataset.open !== 'true';
  side.dataset.open = open; handle.setAttribute('aria-expanded', String(open));
});
let drag = null;
handle.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, moved: false }; });
addEventListener('pointermove', (e) => { if (drag && Math.abs(e.clientY - drag.y) > 18) drag.moved = true; });
addEventListener('pointerup', (e) => {
  if (!drag) return;
  if (drag.moved) {
    const open = e.clientY < drag.y;
    side.dataset.open = open; handle.setAttribute('aria-expanded', String(open));
    handle.addEventListener('click', (ev) => ev.stopImmediatePropagation(), { once: true, capture: true });
  }
  drag = null;
});

// ---------- start ----------
ui.updateCount();
const start = (location.hash.slice(1) in modes) ? location.hash.slice(1) : 'detect';
board.overview(true);
setMode(start);
if (new URLSearchParams(location.search).has('debug')) window.wela = { ...ctx, modes, setMode }; // test hook, off by default
