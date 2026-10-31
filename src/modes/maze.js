// Maze: free exploration of the chart with the snake. No text (SPEC 6.1).
const $ = (s) => document.querySelector(s);
const DIR_WORD = { l: 'left', r: 'right', u: 'up', d: 'down' };
const KEYDIR = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd' };

export function createMaze(ctx) {
  const { engine, chart, board, ui, audio, codePoints, store } = ctx;
  const panelEl = $('#sec-station');
  let active = false;
  let stack = [{ key: chart.root, via: null }]; // via = edge taken to get here
  let busy = false;
  const travelled = new Set();
  const cur = () => stack.at(-1);
  const E = (s) => ui.esc(s);

  const leafNames = (key) => engine.reachable(key).map((c) => chart.leaves[c].english);
  function leadsTo(key, label, dir) {
    const names = leafNames(key);
    const shown = names.length > 8 ? `${names.slice(0, 8).join(', ')} and ${names.length - 8} more` : names.join(', ');
    return `<p class="leads"><b class="ans ${label === 'Y' ? 'y' : 'n'}">${label}</b> <span class="muted">(${DIR_WORD[dir]})</span> leads to <b>${names.length}</b> ${names.length === 1 ? 'language' : 'languages'}: ${E(shown)}.</p>`;
  }

  function render() {
    const { key } = cur();
    if (key.startsWith('L:')) {
      const code = key.slice(2), lf = chart.leaves[code];
      panelEl.innerHTML = `<div class="maze-leaf">${ui.flagHtml(code)}<div><h3>${E(lf.label)}</h3><p class="muted">${E(lf.english)}</p><button type="button" class="btn btn-small btn-primary" id="maze-card">Open language card</button></div></div><p class="hint">Press Backspace to walk back.</p>`;
      $('#maze-card').onclick = () => ui.showCard(code);
      return;
    }
    const s = chart.stations[key], o = board.graph.out[key];
    const seqs = s.test.map((q) => `<span class="big-seq"><span class="g">${E(q)}</span><code>${E(codePoints(q))}</code></span>`).join('');
    panelEl.innerHTML = `
      <span class="label">Station ${stack.length}</span>
      <h3>Does the text contain any of these?</h3>
      <div class="big-seqs">${seqs}</div>
      ${leadsTo(s.yes, 'Y', o.y.dir)}
      ${leadsTo(s.no, 'N', o.n.dir)}
      <div class="row"><button type="button" class="btn btn-small btn-go" data-go="y">Y ${DIR_WORD[o.y.dir]}</button><button type="button" class="btn btn-small btn-danger" data-go="n">N ${DIR_WORD[o.n.dir]}</button><button type="button" class="btn btn-small" data-go="back" ${stack.length < 2 ? 'disabled' : ''}>Back</button></div>`;
  }

  function after() {
    const { key } = cur();
    board.here(key.startsWith('L:') ? null : key);
    const o = key.startsWith('L:') ? null : board.graph.out[key];
    const ids = new Set([key, ...(o ? [o.y.to, o.n.to] : [cur().via?.from])].filter((k) => k && !k.startsWith('L:')));
    board.setTabbable(ids);
    board.setExtra(board.growthFor(stack.slice(1).map((s) => s.via))); // grows with the path walked; going back shrinks it
    board.setDim(travelled.size ? travelled : null);
    render();
    if (key.startsWith('L:')) {
      const code = key.slice(2), lf = chart.leaves[code];
      audio.fanfare();
      board.flash('good');
      ui.burst('Found!', lf.english);
      const isNew = ui.found(code);
      board.setFog(new Set(Object.keys(store.collection())));
      ui.announce(`${lf.english}, ${lf.label}. ${isNew ? 'New flag!' : ''}`);
      setTimeout(() => active && cur().key === key && ui.showCard(code), 650);
    } else {
      const s = chart.stations[key];
      const o2 = board.graph.out[key];
      ui.announce(`Station ${s.test.join(' ')}. Y goes ${DIR_WORD[o2.y.dir]}, N goes ${DIR_WORD[o2.n.dir]}.`);
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

  panelEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b || b.disabled) return;
    if (b.dataset.go === 'back') back(); else answer(b.dataset.go === 'y');
  });

  return {
    enter() {
      active = true;
      board.setPanMode(false);
      board.on.station = onTarget;
      board.on.leaf = (code) => onTarget(`L:${code}`);
      board.on.hover = null;
      board.on.swipe = dirMove;
      board.setFog(new Set(Object.keys(store.collection())));
      const p = board.nodePos(cur().key);
      board.teleport(...p);
      board.setFollow(true);
      after();
    },
    exit() { active = false; busy = false; board.cancelMove(); board.setFog(null); board.setDim(null); board.setExtra(0); board.here(null); },
    onText() {},
    refreshFog() { if (active) board.setFog(new Set(Object.keys(store.collection()))); },
    reset() { stack = [{ key: chart.root, via: null }]; travelled.clear(); },
    key(e) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYDIR[k]) { dirMove(KEYDIR[k]); return true; }
      if (k === 'y') { answer(true); return true; }
      if (k === 'n') { answer(false); return true; }
      if (k === 'Backspace') { back(); return true; }
      return false;
    },
  };
}
