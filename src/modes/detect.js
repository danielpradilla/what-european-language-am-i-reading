// Detect: paste, type or fetch text; the snake runs the route and the letters that decided each turn light up (SPEC 6.2).
const $ = (s) => document.querySelector(s);

export function createDetect(ctx) {
  const { engine, chart, board, panel, ui, store, audio, lineCol } = ctx;
  const list = $('#route-list');
  const title = $('#result-title');
  const whyIn = $('#why-in'), whyOut = $('#why-out');
  let active = false;
  let route = null;
  let prevSteps = null;
  let token = 0;
  let focusIdx = -1;
  let newTimer = 0;
  const lc = (text, off) => lineCol(text, off);
  const where = (text, off) => { const p = lc(text, off); return `line ${p.line}, col ${p.col}`; };

  // "Why not…?" language list
  const byValue = {};
  $('#why-list').innerHTML = Object.entries(chart.leaves).sort((a, b) => a[1].english.localeCompare(b[1].english)).map(([code, l]) => {
    const v = `${l.english} (${l.label})`;
    byValue[v] = code;
    return `<option value="${ui.esc(v)}"></option>`;
  }).join('');

  function renderList() {
    list.innerHTML = '';
    if (!route?.leaf) { title.textContent = 'Route'; return; }
    const text = panel.text();
    route.steps.forEach((s, i) => {
      const seq = engine.testOf(s.station).join(' ');
      const meta = s.answer ? `×${s.count} first at ${where(text, s.hits[0].start)}` : 'none in the text';
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="step" data-i="${i}"><span class="step-n">${i + 1}</span><span class="seq">${ui.esc(seq)}</span><b class="ans ${s.answer ? 'y' : 'n'}">${s.answer ? 'Y' : 'N'}</b><span class="meta">${meta}</span></button>`;
      list.append(li);
    });
    const lf = chart.leaves[route.leaf];
    title.innerHTML = `<span class="found-line">${ui.flagHtml(route.leaf)}<span>Ends at <b>${ui.esc(lf.english)}</b> <span class="muted">· ${ui.esc(lf.label)}</span></span><button type="button" class="btn btn-small" data-card>Card</button></span>`;
  }

  function paintText() {
    panel.clearAll();
    if (!route?.leaf) return;
    const ys = route.steps.filter((s) => s.answer);
    panel.setHighlight('hl-y', ys.flatMap((s) => s.hits));
    panel.setBadges(route.steps.map((s, i) => (s.answer ? { n: i + 1, offset: s.hits[0].start } : null)).filter(Boolean));
  }

  function focusStep(i) {
    focusIdx = i;
    list.querySelectorAll('.step').forEach((b) => b.classList.toggle('is-focus', Number(b.dataset.i) === i));
    if (i < 0 || !route?.leaf) { board.focusStep(null); panel.clearHighlight('hl-focus'); return; }
    const s = route.steps[i];
    board.focusStep(s.station, s.answer);
    if (s.answer) { panel.setHighlight('hl-focus', s.hits); panel.scrollTo(s.hits[0].start); } else panel.clearHighlight('hl-focus');
  }

  async function play(from = 0, speed = 4) {
    const my = ++token;
    board.cancelMove();
    const steps = route.steps;
    board.here(null);
    board.showRoute(steps, null, from); // the trail so far stays lit; the rest lights up as the snake passes
    board.setExtra(board.growthFor(steps.slice(0, from)));
    board.teleport(...board.nodePos(steps[Math.min(from, steps.length - 1)].station));
    for (let i = from; i < steps.length; i++) {
      const e = board.graph.edges[`${steps[i].station}|${steps[i].answer ? 'y' : 'n'}`];
      board.lightStep(steps[i], i);
      board.grow(steps[i].answer);
      audio.tick();
      if (!(await board.moveAlong(e.points, { speed })) || my !== token) return;
    }
    board.here(null);
    if (my === token) arrived();
  }
  function arrived() {
    const code = route.leaf;
    board.mark(code, 'on', true);
    audio.fanfare();
    board.flash('good');
    ui.burst('Found!', chart.leaves[code].english);
    ui.found(code);
    ui.announce(`Route ends at ${chart.leaves[code].english}, ${chart.leaves[code].label}.`);
  }

  /** Called whenever the text changes. */
  function onText(text, info = {}) {
    if (!active) return;
    const prev = prevSteps;
    ctx.urlRowUpdate?.(text);
    if (ctx.isUrl(text)) { route = null; prevSteps = null; board.clearRoute(); renderList(); paintText(); ui.notice('empty', 'info', 'That looks like a web address', 'Press Enter or the button to fetch its text.'); return; }
    ui.clearNotice('empty');
    route = engine.route(text);
    ui.clearNotice('scripts');
    if (!route.leaf) {
      prevSteps = null; token++;
      board.cancelMove(); board.clearRoute(); board.setExtra(0); board.overview(); board.teleport(...board.nodePos(chart.root)); board.here(chart.root);
      renderList(); paintText(); focusStep(-1); whyOut.textContent = '';
      if (text.trim()) ui.notice('empty', 'info', 'No letters to follow', 'Digits and punctuation do not say anything about a language.');
      else ui.notice('empty', 'info', 'Nothing to read yet', 'Type, paste text or a web address, or try a sample.');
      return;
    }
    if (!route.european) ui.notice('scripts', 'warning', 'This chart only covers European alphabets.', 'The route below is where the chart sends it anyway.');
    renderList(); paintText(); focusStep(-1); runWhy();
    const box = board.bboxOf([board.nodePos(chart.root), ...route.steps.flatMap((s) => board.graph.edges[`${s.station}|${s.answer ? 'y' : 'n'}`].points), board.nodePos(`L:${route.leaf}`)]);
    board.frame(box, { pad: 60, maxZ: 2.4 });
    // first changed step: the snake reruns from there
    let k = 0;
    if (prev) while (k < prev.length && k < route.steps.length && prev[k].station === route.steps[k].station && prev[k].answer === route.steps[k].answer) k++;
    const same = prev && k === prev.length && k === route.steps.length;
    prevSteps = route.steps.map((s) => ({ station: s.station, answer: s.answer }));
    if (same) { board.here(null); return; }
    if (info.user && prev) liveNote(text, info.prev ?? '', k);
    play(info.user && prev ? Math.min(k, route.steps.length - 1) : 0, info.user ? 5 : 4);
  }

  function liveNote(text, old, k) {
    let p = 0;
    while (p < text.length && p < old.length && text[p] === old[p]) p++;
    let s = 0;
    while (s < text.length - p && s < old.length - p && text.at(-1 - s) === old.at(-1 - s)) s++;
    const ins = text.slice(p, text.length - s), del = old.slice(p, old.length - s);
    if (ins.length + del.length > 40 || !(ins || del)) return;
    const step = route.steps[Math.min(k, route.steps.length - 1)];
    const hit = step?.hits.find((h) => h.start >= p && h.end <= text.length - s);
    const shown = hit ? hit.seq : (ins || del).trim() || '·';
    const verb = ins ? 'typed' : 'removed';
    const msg = `You ${verb} ${shown}: the route moved at step ${k + 1} and now ends at ${chart.leaves[route.leaf].english}.`;
    ui.notice('live', 'info', msg);
    ui.announce(msg);
    clearTimeout(newTimer);
    if (ins) {
      panel.setHighlight('hl-new', [{ start: p, end: p + ins.length }]);
      newTimer = setTimeout(() => { panel.clearHighlight('hl-new'); ui.clearNotice('live'); }, 1500);
    } else newTimer = setTimeout(() => ui.clearNotice('live'), 3500);
  }

  // "Why not…?"
  function runWhy() {
    const code = byValue[whyIn.value];
    whyOut.innerHTML = '';
    if (!code || !route?.leaf) return;
    const english = chart.leaves[code].english;
    if (code === route.leaf) { whyOut.innerHTML = `<div class="note"><strong>Your text already ends at ${ui.esc(english)}.</strong></div>`; return; }
    const d = engine.diverge(route.steps, code);
    const need = d.path[d.index];
    const step = route.steps[d.index];
    const seq = engine.testOf(need.station).join(', ');
    const text = panel.text();
    let msg;
    if (need.answer) {
      msg = `${english} needs ${need.answer && seq.includes(',') ? 'one of ' : ''}${seq} at step ${d.index + 1}. Your text has none. Add one and the route turns towards ${english}.`;
    } else {
      const h = step.hits[0];
      msg = `Your text contains ${h.seq} (${where(text, h.start)}) ×${step.count}, and ${english}’s route needs N at step ${d.index + 1}. Take out every ${seq.replace(/, (?=[^,]*$)/, ' and ')} to follow it.`;
    }
    whyOut.innerHTML = `<div class="note note-info"><strong>Why not ${ui.esc(english)}?</strong><span>${ui.esc(msg)}</span></div>`;
    focusStep(d.index);
  }
  whyIn.addEventListener('input', () => { runWhy(); whyOut.scrollIntoView({ block: 'nearest' }); });
  whyIn.addEventListener('change', () => { runWhy(); whyOut.scrollIntoView({ block: 'nearest' }); });

  list.addEventListener('click', (e) => { const b = e.target.closest('.step'); if (b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('pointerover', (e) => { const b = e.target.closest('.step'); if (b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('focusin', (e) => { const b = e.target.closest('.step'); if (b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('pointerleave', () => focusStep(-1));
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) focusStep(-1); });
  title.addEventListener('click', (e) => { if (e.target.closest('[data-card]') && route?.leaf) ui.showCard(route.leaf); });

  function onHover(id) {
    if (!active || !route?.leaf) return;
    focusStep(id ? route.steps.findIndex((s) => s.station === id) : -1);
  }

  return {
    enter() {
      active = true;
      board.setPanMode(true); board.setFog(null); board.setFollow(false);
      panel.setEditable(true);
      board.on.hover = onHover;
      board.on.station = (id) => { const i = route?.steps.findIndex((s) => s.station === id) ?? -1; if (i >= 0) focusStep(i); };
      board.on.leaf = (code) => ui.showCard(code);
      board.on.swipe = null;
      const ids = new Set(route?.steps.map((s) => s.station) ?? []);
      board.setTabbable(ids);
      if (!panel.text().trim() && !ctx.isUrl(panel.text())) ctx.loadRandomSample();
      else onText(panel.text(), {});
    },
    exit() {
      active = false; token++;
      board.cancelMove(); board.clearRoute(); board.setExtra(0); panel.clearAll(); focusStep(-1);
      ui.clearNotice('scripts'); ui.clearNotice('live'); ui.clearNotice('empty');
      prevSteps = null;
    },
    onText,
    key(e) {
      if (e.key === 'Enter' && route?.leaf) { play(0, 4); return true; }
      return false;
    },
    rerun() { prevSteps = null; if (route?.leaf) play(0, 4); },
    get route() { return route; },
  };
}
