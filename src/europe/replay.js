// Replay of the poster's route on the Europe map: each letter question fades the languages it rules out (SPEC 16.3).
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createReplay(ctx) {
  const { engine, chart, map, ui, store, audio } = ctx;
  const chip = $('#eu-chip');
  const list = $('#route-list');
  const title = $('#result-title');
  const btn = $('#btn-replay');
  const all = new Set(map.codes);
  let token = 0;
  let route = null;

  const nextNode = (s) => (s.answer ? chart.stations[s.station].yes : chart.stations[s.station].no);
  const keepAfter = (i) => (i < 0 ? all : new Set(engine.reachable(nextNode(route.steps[i]))));
  const askText = (s) => {
    const q = engine.testOf(s.station);
    return q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q.at(-1)}` : q[0];
  };
  const left = (i) => keepAfter(i).size;
  const langs = (n) => `${n} language${n === 1 ? '' : 's'}`;

  /** Show the map as it is after answering step i (-1 = before the first question). */
  function show(i, { finish = false } = {}) {
    if (!route) return;
    const keep = keepAfter(i);
    map.setOut(i < 0 ? null : keep);
    map.clearMarks('lit');
    chip.hidden = false;
    if (i < 0) chip.innerHTML = `<span class="eu-n"><b>${all.size}</b> languages in play</span>`;
    else {
      const s = route.steps[i];
      chip.innerHTML = `<span class="eu-q">Has <b class="seq-inline">${ui.esc(askText(s))}</b>?</span> <span class="eu-a ${s.answer ? 'y' : 'n'}">${s.answer ? 'Yes' : 'No'}.</span> <span class="eu-n"><b>${left(i)}</b> ${left(i) === 1 ? 'language' : 'languages'} left</span>`;
    }
    list.querySelectorAll('.step').forEach((b) => b.classList.toggle('is-now', Number(b.dataset.i) === i));
    if (finish && i === route.steps.length - 1) {
      map.mark(route.leaf, 'lit', true);
      const lf = chart.leaves[route.leaf];
      chip.innerHTML = `<span class="eu-found">${ui.flagHtml(route.leaf)}<span><b>${ui.esc(lf.english)}</b><br><span class="hint">${ui.esc(lf.label.split(' / ')[0])}</span></span></span>`;
    }
  }

  function renderList(r, text) {
    route = r;
    list.innerHTML = '';
    btn.hidden = !r?.leaf;
    if (!r?.leaf) { title.textContent = 'Route'; return; }
    r.steps.forEach((s, i) => {
      const seq = engine.testOf(s.station).join(' ');
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="step" data-i="${i}"><span class="step-n">${i + 1}</span><span class="seq">${ui.esc(seq)}</span><b class="ans ${s.answer ? 'y' : 'n'}">${s.answer ? 'Y' : 'N'}</b><span class="meta">${langs(left(i))} left</span></button>`;
      list.append(li);
    });
    const lf = chart.leaves[r.leaf];
    title.innerHTML = `<span class="found-line">${ui.flagHtml(r.leaf)}<span>The chart ends at <b>${ui.esc(lf.english)}</b> <span class="muted">· ${ui.esc(lf.label.split(' / ')[0])}</span></span><button type="button" class="btn btn-small" data-card>Card</button></span>`;
  }

  /** Animate the whole route. celebrate: fanfare, burst and collection (Detect), not in Guess. */
  async function play({ delay = 1000, celebrate = true } = {}) {
    if (!route?.leaf) return;
    const my = ++token;
    const r = route, n = r.steps.length;
    delay = Math.min(delay, Math.max(350, 9000 / n)); // long routes must not take minutes
    if (store.settings.reduced) { show(n - 1, { finish: true }); done(celebrate); return; }
    show(-1);
    await sleep(delay * 0.6);
    for (let i = 0; i < n; i++) {
      if (my !== token) return;
      show(i, { finish: false });
      audio.tick();
      await sleep(delay);
    }
    if (my !== token) return;
    show(n - 1, { finish: true });
    done(celebrate);
  }
  function done(celebrate) {
    const lf = chart.leaves[route.leaf];
    if (celebrate) {
      audio.fanfare();
      ui.burst('Found!', lf.english);
      ui.found(route.leaf);
    }
    ui.announce(`Route ends at ${lf.english}, ${lf.label.split(' / ')[0]}.`);
  }
  /** Jump to the end state without animation (typing). */
  function showEnd() { token++; if (route?.leaf) { show(route.steps.length - 1, { finish: true }); ui.found(route.leaf); } }
  function seek(i) { token++; show(i, { finish: i === route.steps.length - 1 }); }
  function reset() {
    token++; route = null;
    map.setOut(null); map.clearMarks('lit');
    chip.hidden = true; chip.innerHTML = '';
    list.innerHTML = ''; btn.hidden = true; title.textContent = 'Route';
  }

  list.addEventListener('click', (e) => { const b = e.target.closest('.step'); if (b) seek(Number(b.dataset.i)); });
  title.addEventListener('click', (e) => { if (e.target.closest('[data-card]') && route?.leaf) ctx.openCard(route.leaf); });
  btn.addEventListener('click', () => play());

  return { renderList, play, showEnd, seek, reset, show, get route() { return route; } };
}
