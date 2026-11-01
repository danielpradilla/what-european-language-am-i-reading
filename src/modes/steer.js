// Steer: free exploration of the chart with the snake. No text (SPEC 6.1). The snake's bubble tells what each station tests.
const $ = (s) => document.querySelector(s);
const DIR_WORD = { l: 'left', r: 'right', u: 'up', d: 'down' };
const ARROW = { l: '←', r: '→', u: '↑', d: '↓' };
const KEYDIR = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd' };

export function createSteer(ctx) {
  const { engine, chart, board, ui, audio, codePoints, store } = ctx;
  const bubble = $('#bubble-text'), padQ = $('#pad-q'), pad = $('#pad');
  let active = false;
  let stack = [{ key: chart.root, via: null }]; // via = edge taken to get here
  let busy = false;
  const travelled = new Set();
  const cur = () => stack.at(-1);
  const E = (s) => ui.esc(s);
  const found = () => new Set(Object.keys(store.collection()));

  function leadsTo(key, label, dir) {
    const names = engine.reachable(key).map((c) => chart.leaves[c].english);
    const shown = names.length > 8 ? `${names.slice(0, 8).join(', ')} and ${names.length - 8} more` : names.join(', ');
    return `<div class="leads"><b class="ans ${label === 'Y' ? 'y' : 'n'}">${label}</b> <span class="muted">(${DIR_WORD[dir]})</span> leads to <b>${names.length}</b> ${names.length === 1 ? 'language' : 'languages'}: ${E(shown)}.</div>`;
  }

  function resetPad() {
    for (const act of ['y', 'n']) { const b = $(`#pad [data-act="${act}"]`); b.textContent = act.toUpperCase(); b.removeAttribute('aria-label'); }
    padQ.textContent = '';
    delete pad.dataset.leaf;
  }

  /** Bubble and pad for the current spot. `isNew` is only known when a flag was just reached. */
  function render(isNew = false) {
    const { key } = cur();
    $('#pad [data-act="back"]').disabled = stack.length < 2;
    if (key.startsWith('L:')) {
      const code = key.slice(2), lf = chart.leaves[code];
      pad.dataset.leaf = '';
      padQ.textContent = '';
      bubble.innerHTML = `<div class="leaf-line">${ui.flagHtml(code)}<div><b>${E(lf.english)}</b> <span class="muted">${E(lf.label)}</span>${isNew ? ' <b class="seq-inline">New flag!</b>' : ''}<br><button type="button" class="btn btn-small btn-primary" id="steer-card">Open language card <kbd>Enter</kbd></button></div></div><div class="muted">Press Backspace or Back to walk back.</div>`;
      $('#steer-card').onclick = () => ui.showCard(code);
      return;
    }
    delete pad.dataset.leaf;
    const s = chart.stations[key], o = board.graph.out[key];
    for (const [act, dir] of [['y', o.y.dir], ['n', o.n.dir]]) {
      const b = $(`#pad [data-act="${act}"]`);
      b.innerHTML = `${act.toUpperCase()}<span class="dir" aria-hidden="true">${ARROW[dir]}</span>`;
      b.setAttribute('aria-label', `${act === 'y' ? 'Yes' : 'No'}, go ${DIR_WORD[dir]}`);
    }
    const seq = s.test.join(' ');
    padQ.innerHTML = `<span>Has <b>${E(seq)}</b>?</span>`; // the snake's head covers the station, so the question sits on the pad too
    const seqs = s.test.map((q) => `<span class="big-seq"><span class="g">${E(q)}</span><code>${E(codePoints(q))}</code></span>`).join('');
    bubble.innerHTML = `This stop asks: does the text have any of these letters?<div class="big-seqs">${seqs}</div>${leadsTo(s.yes, 'Y', o.y.dir)}${leadsTo(s.no, 'N', o.n.dir)}`;
  }

  function after() {
    const { key } = cur();
    const leaf = key.startsWith('L:');
    board.here(leaf ? null : key);
    const o = leaf ? null : board.graph.out[key];
    const ids = new Set([key, ...(o ? [o.y.to, o.n.to] : [cur().via?.from])].filter((k) => k && !k.startsWith('L:')));
    board.setTabbable(ids);
    board.setExtra(board.growthFor(stack.slice(1).map((s) => s.via))); // grows with the path walked; going back shrinks it
    board.setDim(travelled.size ? travelled : null);
    if (leaf) {
      const code = key.slice(2), lf = chart.leaves[code];
      audio.fanfare();
      board.flash('good');
      ui.burst('Found!', lf.english);
      const isNew = ui.found(code);
      render(isNew);
      board.setFog(found());
      ui.announce(`${lf.english}, ${lf.label}. ${isNew ? 'New flag!' : ''}`);
      setTimeout(() => active && cur().key === key && ui.showCard(code), 650);
    } else {
      render();
      const s = chart.stations[key];
      ui.announce(`Station ${s.test.join(' ')}. Y goes ${DIR_WORD[o.y.dir]}, N goes ${DIR_WORD[o.n.dir]}.`);
    }
  }

  async function go(edge) {
    if (busy || !edge) return;
    busy = true;
    travelled.add(edge.id);
    board.setDim(travelled);
    audio.tick();
    const ok = await board.moveAlong(edge.points);
    busy = false;
    if (!ok || !active) return;
    stack.push({ key: edge.to, via: edge });
    after();
  }
  async function back() {
    if (busy || stack.length < 2) return;
    busy = true;
    const { via } = cur();
    audio.tick();
    const ok = await board.moveAlong([...via.points].reverse(), { shrink: true });
    busy = false;
    if (!ok || !active) return;
    stack.pop();
    after();
  }

  function dirMove(dir) {
    const { key, via } = cur();
    if (via && via.back === dir) return back();
    if (key.startsWith('L:')) return;
    const o = board.graph.out[key];
    if (o.y.dir === dir) go(o.y); else if (o.n.dir === dir) go(o.n);
    else ui.announce(`No line leaves ${DIR_WORD[dir]} from here.`);
  }
  function answer(yes) {
    const { key } = cur();
    if (key.startsWith('L:')) return;
    go(yes ? board.graph.out[key].y : board.graph.out[key].n);
  }
  function onTarget(k) {
    const { key, via } = cur();
    if (!key.startsWith('L:')) {
      const o = board.graph.out[key];
      if (o.y.to === k) return go(o.y);
      if (o.n.to === k) return go(o.n);
    }
    if (via && via.from === k) back();
  }

  return {
    enter() {
      active = true;
      board.setPanMode(false);
      board.on.station = onTarget;
      board.on.leaf = (code) => onTarget(`L:${code}`);
      board.on.hover = null;
      board.on.swipe = dirMove;
      board.setFog(found());
      board.teleport(...board.nodePos(cur().key));
      board.setFollow(true);
      after();
    },
    exit() {
      active = false; busy = false;
      board.cancelMove(); board.setFog(null); board.setDim(null); board.setExtra(0); board.here(null);
      resetPad();
      $('#pad [data-act="back"]').disabled = false;
    },
    onText() {},
    refreshFog() { if (active) board.setFog(found()); },
    key(e) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYDIR[k]) { dirMove(KEYDIR[k]); return true; }
      if (k === 'y') { answer(true); return true; }
      if (k === 'n') { answer(false); return true; }
      if (k === 'Backspace') { back(); return true; }
      if (k === 'Enter' && cur().key.startsWith('L:')) { ui.showCard(cur().key.slice(2)); return true; }
      return false;
    },
  };
}
