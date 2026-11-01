// Shared UI: announcements, toasts, notices, language card, collection, options, effects.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createUi(ctx) {
  const { engine, chart, flags, samples, store, audio } = ctx;
  const leaves = ctx.leaves ?? chart.leaves; // the Europe page adds its bus languages; the poster's chart stays untouched
  const reduced = () => store.settings.reduced;
  let lastFound = null;

  // ---------- announcements, toasts, notices ----------
  const live = $('#live');
  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };

  function toast(title, body) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `<div class="burst burst-gold ${reduced() ? '' : 'boil'}" aria-hidden="true">&#9733;</div><div><span class="label" style="color: var(--marigold)">New flag</span><strong>${esc(title)}</strong><span style="font-size: 0.9rem">${esc(body)}</span></div>`;
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 4200);
  }

  const notices = $('#notices');
  function notice(key, kind, title, body) {
    clearNotice(key);
    const n = document.createElement('div');
    n.className = `note ${kind ? `note-${kind}` : ''}`;
    n.dataset.key = key;
    n.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span class="muted">${esc(body)}</span>` : ''}`;
    notices.append(n);
    return n;
  }
  const clearNotice = (key) => notices.querySelectorAll(`[data-key="${key}"]`).forEach((n) => n.remove());

  // ---------- flags and names ----------
  const leafInfo = (code) => leaves[code];
  const name = (code) => leafInfo(code).english;
  function flagHtml(code) {
    const info = flags.leaves[code] ?? { files: [], layout: 'single' };
    const img = (f) => `<img src="assets/flags/${f}" alt="" loading="lazy">`;
    const inner = info.layout === 'chai' || info.layout === 'text' ? `<span class="chai">${esc(info.text ?? 'חי')}</span>` : info.files.map(img).join('');
    return `<span class="flag flag-${info.layout}" role="img" aria-label="${leafInfo(code).flagNote ? `Flag of ${esc(leafInfo(code).flagNote)}` : `Flag for ${esc(leafInfo(code).english)}`}">${inner}</span>`;
  }

  // ---------- dialogs ----------
  function open(dlg) { if (!dlg.open) dlg.showModal(); }
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg.id !== 'dlg-over' && dlg.id !== 'dlg-menu') dlg.close(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  }

  // ---------- language card (SPEC 7.1) ----------
  const seqs = (station) => engine.testOf(station).map((q) => `<code>${esc(q)}</code>`).join(' ');
  const NOTES = {
    hsb: 'The metro map swapped the two Sorbian flags: <code>ř</code> N leads here. Upper Sorbian uses <code>ř</code>, so real Upper Sorbian text usually ends at Lower Sorbian instead. The app keeps the map’s routing.',
    dsb: 'The metro map swapped the two Sorbian flags: <code>ů</code> N leads here. Real Lower Sorbian text (<code>č</code>, <code>ě</code>, no <code>ř</code>) ends at Upper Sorbian. The app keeps the map’s routing.',
    rmy: 'Two stations lead to this flag, so there are two routes.',
  };
  /** extra: html shown under the heading (the Europe map adds line, branch and a poster link). */
  function showCard(code, extra = '') {
    const lf = leafInfo(code);
    const bus = !chart.leaves[code]; // a regional bus language: no place on the poster, so no routes
    const paths = bus ? [] : engine.pathsTo(code);
    const sample = samples.find((s) => s.lang === code);
    const routeHtml = paths.map((p, i) => {
      const yes = p.filter((s) => s.answer), no = p.filter((s) => !s.answer);
      return `<div class="card-route">
        ${paths.length > 1 ? `<span class="label">Route ${i + 1}</span>` : ''}
        <p><span class="label">Must contain</span><br>${yes.length ? yes.map((s) => `<span class="req">${seqs(s.station)}</span>`).join(' ') : '<span class="muted">nothing in particular</span>'}</p>
        <p><span class="label">Must not contain</span><br>${no.length ? no.map((s) => `<span class="req">${seqs(s.station)}</span>`).join(' ') : '<span class="muted">nothing</span>'}</p>
        <p class="hint">${p.length} steps. “Must contain” means at least one letter from each group.</p>
      </div>`;
    }).join('');
    const min = bus ? '' : engine.minimalText(code);
    $('#dlg-card-body').innerHTML = `
      <div class="card-top">
        <div class="card-flag">${flagHtml(code)}</div>
        <div>
          <h2>${esc(lf.label)}</h2>
          <p class="muted">${esc(lf.english)} · <span class="num">${esc(code)}</span>${lf.flagNote ? ` · flag of ${esc(lf.flagNote)}` : ''}</p>
        </div>
      </div>
      ${extra || ctx.cardExtra?.(code) || ''}
      ${bus ? `<p>${esc(lf.note)}</p>` : routeHtml}
      ${!bus && NOTES[code] ? `<div class="note note-warning"><strong>Chart quirk</strong><span>${NOTES[code]}</span></div>` : ''}
      ${bus ? '' : `<div class="card-min">
        <span class="label">Shortest text that reaches it</span>
        <p><code class="min-text">${esc(min)}</code></p>
        <button class="btn btn-small btn-primary" type="button" id="card-load-min">Load it in Detect</button>
      </div>`}
      ${sample ? `<div class="card-sample"><span class="label">Sample</span><p class="sample-text" lang="${esc(code)}">${esc(sample.text.length > 260 ? `${sample.text.slice(0, 260)}…` : sample.text)}</p>
        <p class="hint"><a href="${esc(sample.source)}" target="_blank" rel="noopener">${esc(sample.title || sample.source)}</a> · ${esc(sample.license)}</p>
        <button class="btn btn-small" type="button" id="card-load-sample">Try this sample</button></div>` : '<p class="hint">No sample text for this language.</p>'}`;
    const lm = $('#card-load-min');
    if (lm) lm.onclick = () => { $('#dlg-card').close(); $('#dlg-collection').close(); ctx.loadText(min, 'detect'); };
    const ls = $('#card-load-sample');
    if (ls) ls.onclick = () => { $('#dlg-card').close(); $('#dlg-collection').close(); ctx.loadText(sample.text, 'detect'); };
    open($('#dlg-card'));
    announce(`${lf.english}. ${lf.label}.`);
  }

  // ---------- collection (SPEC 7.2) ----------
  const codes = Object.keys(leaves);
  const have = () => codes.filter((c) => store.collection()[c]).length; // the collection is shared with the poster, which has fewer languages
  function updateCount() { $('#coll-count').textContent = `${have()}/${codes.length}`; }
  function renderCollection() {
    const coll = store.collection();
    $('#coll-sub').textContent = `${have()} of ${codes.length} flags reached in any mode.`;
    $('#coll-grid').innerHTML = codes.map((c, i) => {
      const got = coll[c];
      if (!got) return `<div class="stage-card is-locked" aria-disabled="true"><span class="stamp">${i + 1}</span><h3>Locked</h3><span class="label">Not found yet</span></div>`;
      const cur = c === lastFound ? ' is-current' : '';
      return `<button type="button" class="stage-card is-cleared${cur}" data-code="${c}" ${cur ? 'aria-current="step"' : ''}><span class="stamp">${i + 1}</span><div class="cc-flag">${flagHtml(c)}</div><h3>${esc(leafInfo(c).label)}</h3><span class="label muted">${esc(leafInfo(c).english)} · ${esc(got)}</span></button>`;
    }).join('');
  }
  function openCollection() { renderCollection(); open($('#dlg-collection')); }
  $('#coll-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-code]'); if (b) showCard(b.dataset.code); });
  $('#coll-reset').addEventListener('click', () => {
    if (confirm('Forget every flag you have found?')) { store.resetCollection(); lastFound = null; renderCollection(); updateCount(); ctx.refreshFog?.(); }
  });

  /** Called whenever the snake reaches a flag. Returns true for a new flag. */
  function found(code) {
    const isNew = store.collect(code);
    lastFound = code;
    updateCount();
    if (isNew) {
      toast(leafInfo(code).label, `${leafInfo(code).english} · ${have()} of ${codes.length} found`);
      ctx.refreshFog?.();
    }
    return isNew;
  }

  // ---------- options and pause menu ----------
  const dlgMenu = $('#dlg-menu');
  const optSound = $('#opt-sound'), optReduced = $('#opt-reduced'), optShake = $('#opt-shake');
  function applySettings() {
    optSound.checked = store.settings.sound;
    optReduced.checked = store.settings.reduced;
    optShake.checked = store.settings.shake;
    document.documentElement.toggleAttribute('data-reduced', store.settings.reduced);
  }
  optSound.onchange = () => store.set('sound', optSound.checked);
  optReduced.onchange = () => store.set('reduced', optReduced.checked);
  optShake.onchange = () => store.set('shake', optShake.checked);
  store.onChange(applySettings);
  applySettings();
  const showMenuPart = (part) => { $('#menu-pause').hidden = part !== 'pause'; $('#menu-options').hidden = part !== 'options'; };
  function openMenu(part, onClose) {
    showMenuPart(part);
    ctx.menuClosed = onClose ?? null;
    open(dlgMenu);
    (part === 'pause' ? $('[data-menu="resume"]') : $('#opt-sound')).focus();
  }
  dlgMenu.addEventListener('close', () => { const f = ctx.menuClosed; ctx.menuClosed = null; f?.(); });
  $('#opt-done').onclick = () => (ctx.menuReturn ? (showMenuPart('pause'), (ctx.menuReturn = false)) : dlgMenu.close());
  function toggleSound() {
    store.set('sound', !store.settings.sound);
    announce(store.settings.sound ? 'Sound on' : 'Sound off');
    if (store.settings.sound) audio.click();
    return store.settings.sound;
  }

  // ---------- effects ----------
  const fx = $('#fx');
  /** items: [{ text, rect }] fly to the head. */
  function flyLetters(items, target) {
    if (reduced()) return;
    const host = $('#board-wrap').getBoundingClientRect();
    items.slice(0, 12).forEach((it, i) => {
      if (!it.rect) return;
      const s = document.createElement('span');
      s.className = 'fly';
      s.textContent = it.text;
      const x0 = it.rect.left - host.left, y0 = it.rect.top - host.top;
      s.style.left = `${x0}px`; s.style.top = `${y0}px`;
      fx.append(s);
      const dx = target.x - host.left - x0, dy = target.y - host.top - y0;
      const a = s.animate([{ transform: 'translate(0,0) scale(1.4)', opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(1.1)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.2 }], { duration: 480, delay: i * 45, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'backwards' });
      a.onfinish = () => s.remove();
    });
  }
  /** Big teal "Found!" starburst over the board. */
  function burst(text = 'Found!', sub = '', cls = 'burst-found') {
    const b = document.createElement('div');
    b.className = `burst ${cls} ${reduced() ? '' : 'boil'} burst-pop`;
    b.style.setProperty('--size', '132px');
    b.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    fx.append(b);
    setTimeout(() => b.remove(), 1500);
  }

  return { announce, toast, notice, clearNotice, flagHtml, name, showCard, openCollection, updateCount, found, openMenu, toggleSound, flyLetters, burst, open, esc, applySettings, get lastFound() { return lastFound; } };
}
