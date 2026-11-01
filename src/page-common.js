// Wiring shared by the poster page and the Europe page: flag aspects, text panel with URL fetch and samples, phone bottom sheet.
const $ = (s) => document.querySelector(s);

/** <image> ignores preserveAspectRatio="slice" for SVG files, so the boards need each flag's aspect to crop it themselves. */
export async function loadAspects(flags) {
  const aspect = {};
  await Promise.all(Object.keys(flags.files).map(async (f) => {
    try {
      const tag = (await (await fetch(`assets/flags/${f}`)).text()).match(/<svg\b[^>]*>/is)?.[0] ?? '';
      const vb = tag.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1].trim().split(/[\s,]+/).map(Number);
      const wh = [/\swidth\s*=\s*"([\d.]+)/i, /\sheight\s*=\s*"([\d.]+)/i].map((re) => parseFloat(tag.match(re)?.[1]));
      aspect[f] = (vb ? vb[2] / vb[3] : wh[0] / wh[1]) || 1.5;
    } catch { aspect[f] = 1.5; }
  }));
  return aspect;
}

/**
 * Creates ctx.panel and wires the text box, URL fetch, sample and clear buttons.
 * Adds ctx.setMeta({ text, html }) (source line under the text), ctx.loadRandomSample(auto) and ctx.autoSampleText
 * (the text of a sample a mode loaded on its own, so Detect can tell it from text the player chose).
 * onInput(text, info) is called after the shared bookkeeping.
 */
export function setupText(ctx, { panelMod, urlMod, onInput }) {
  const { ui, samples } = ctx;
  let meta = null; // { text, html }
  const metaEl = $('#text-meta');
  const urlRow = $('#url-row');
  ctx.setMeta = (m) => { meta = m; };
  ctx.panel = panelMod.createTextPanel({
    edit: $('#tp-edit'), badgesEl: $('#tp-badges'),
    onInput(text, info) {
      urlRow.hidden = !ctx.isUrl(text);
      if (meta && meta.text !== text) meta = null;
      metaEl.innerHTML = meta ? meta.html : text ? `${[...text].length.toLocaleString('en')} characters` : '';
      ui.clearNotice('fetch');
      if (info.truncated) ui.notice('truncated', 'warning', `Text cut to ${panelMod.MAX_CHARS.toLocaleString('en')} characters`, 'Only the first part is routed.');
      else ui.clearNotice('truncated');
      onInput(text, info);
    },
  });
  const { panel } = ctx;
  const sampleMeta = (s) => ({ text: s.text, html: `Sample: <a href="${ui.esc(s.source)}" target="_blank" rel="noopener">${ui.esc(s.title || s.source)}</a> · ${ui.esc(s.license)}` });
  ctx.sampleMeta = sampleMeta;
  let lastSample = -1;
  ctx.autoSampleText = null;
  /** auto: loaded by a mode on entry rather than by the player. */
  ctx.loadRandomSample = (auto = false) => {
    let i;
    do { i = Math.floor(Math.random() * samples.length); } while (i === lastSample && samples.length > 1);
    lastSample = i;
    meta = sampleMeta(samples[i]);
    ctx.autoSampleText = auto ? samples[i].text : null;
    panel.setText(samples[i].text);
  };

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
}

/** Phone layout: the board sits on top and the side panel is a bottom sheet with three heights:
 *  'min' (handle only, the board gets the room; the start state), 'peek' (medium) and 'open' (large). Returns layout() and setSheet(). */
export function setupSheet() {
  const side = $('#side'), handle = $('#sheet-handle'), boardPanel = document.querySelector('.board-panel');
  const narrow = matchMedia('(max-width: 899px)');
  const MIN = 46;
  const BY_SIZE = ['min', 'peek', 'open'];
  const TAP_NEXT = { min: 'open', open: 'peek', peek: 'min' };
  let state = 'min';
  function layout() {
    if (!narrow.matches) { boardPanel.style.height = ''; side.style.removeProperty('--peek'); document.body.style.paddingBottom = ''; return; }
    const peek = Math.round(innerHeight * 0.3);
    const below = state === 'min' ? MIN : peek; // 'open' covers the board on purpose; the board keeps its peek size
    side.style.setProperty('--peek', `${peek}px`);
    document.body.style.paddingBottom = `${below}px`;
    const top = boardPanel.getBoundingClientRect().top + scrollY;
    boardPanel.style.height = `${Math.max(240, innerHeight - top - below - 6)}px`;
  }
  function setSheet(s) {
    state = s;
    side.dataset.sheet = s;
    handle.setAttribute('aria-expanded', String(s !== 'min'));
    layout();
  }
  addEventListener('resize', layout);
  narrow.addEventListener('change', layout);
  // Tap: closed -> large -> medium -> closed. Drag: one size up or down.
  handle.addEventListener('click', () => setSheet(TAP_NEXT[state]));
  let drag = null;
  handle.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, moved: false }; });
  addEventListener('pointermove', (e) => { if (drag && Math.abs(e.clientY - drag.y) > 18) drag.moved = true; });
  addEventListener('pointerup', (e) => {
    if (!drag) return;
    if (drag.moved) {
      const i = BY_SIZE.indexOf(state) + (e.clientY < drag.y ? 1 : -1);
      setSheet(BY_SIZE[Math.max(0, Math.min(BY_SIZE.length - 1, i))]);
      handle.addEventListener('click', (ev) => ev.stopImmediatePropagation(), { once: true, capture: true });
    }
    drag = null;
  });
  side.dataset.sheet = state;
  return { layout, setSheet };
}

/** Full-screen board. The class makes the board panel cover the window everywhere (iPhone Safari has no element
 *  full screen); where the Fullscreen API exists it also hides the browser's own bars. Returns toggle(on?). */
export function setupFullscreen() {
  const panel = document.querySelector('.board-panel'), btn = $('#btn-full');
  const on = () => panel.classList.contains('is-full');
  function set(v) {
    if (v === on()) return;
    panel.classList.toggle('is-full', v);
    document.documentElement.classList.toggle('board-full', v);
    btn.setAttribute('aria-pressed', String(v));
    btn.setAttribute('aria-label', v ? 'Exit full screen' : 'Full screen');
    btn.title = v ? 'Exit full screen (F)' : 'Full screen (F)';
    btn.textContent = v ? '✕' : '⤢';
    if (v && document.fullscreenEnabled) panel.requestFullscreen?.().catch(() => {});
    if (!v && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    (panel.querySelector('#board') ?? panel).focus({ preventScroll: true });
  }
  btn.addEventListener('click', () => set(!on()));
  // Esc in real full screen leaves it without a key event; follow the browser.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && on()) set(false); });
  return (v = !on()) => set(v);
}
