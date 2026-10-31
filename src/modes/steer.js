// Steer: the player finds the route for a text by moving the snake. Arcade reuses it through `arcade` hooks (SPEC 6.3).
const $ = (s) => document.querySelector(s);
const DIR_WORD = { l: 'left', r: 'right', u: 'up', d: 'down' };
const KEYDIR = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd' };

export function createSteer(ctx) {
  const { engine, chart, board, panel, ui, audio, lineCol } = ctx;
  const bubble = $('#bubble-text');
  const result = $('#steer-result');
  const btnNext = $('#btn-next'), btnRetry = $('#btn-retry'), btnHint = $('#btn-hint');
  let active = false;
  let r = null; // current round
  let arc = null; // arcade hooks
  const st = { get round() { return r; } };

  const say = (html) => { bubble.innerHTML = html; };
  const lc = (text, off) => { const p = lineCol(text, off); return { ...p, text: `line ${p.line}, column ${p.col}` }; };
  const seqText = (id) => engine.testOf(id).join(' ');
  const codePointIndex = (text, off) => [...text.slice(0, off)].length + 1;
  const E = (s) => ui.esc(s);

  function clearEvidence() {
    panel.clearHighlight('hl-err'); panel.clearHighlight('hl-focus');
    panel.setBadges([]);
    ui.clearNotice('steer');
    board.clearMarks();
  }

  function promptStation() {
    const s = r.route.steps[r.i];
    const o = board.graph.out[s.station];
    board.here(s.station);
    board.setTabbable(new Set([s.station, o.y.to, o.n.to].filter((k) => !k.startsWith('L:'))));
    say(`Does the text contain <b class="seq-inline">${E(seqText(s.station))}</b>? <span class="muted">Y goes ${DIR_WORD[o.y.dir]}, N goes ${DIR_WORD[o.n.dir]}.</span>`);
    ui.announce(`Station ${seqText(s.station)}. Does the text contain ${seqText(s.station)}? Y goes ${DIR_WORD[o.y.dir]}, N goes ${DIR_WORD[o.n.dir]}.`);
    r.busy = false;
    arc?.onStation?.();
  }

  /** Start a round on `text`. */
  function start(text, meta = {}) {
    result.innerHTML = '';
    btnNext.hidden = true; btnRetry.hidden = true; btnHint.hidden = false;
    ui.clearNotice('steer'); ui.clearNotice('empty'); ui.clearNotice('scripts');
    board.clearRoute(); board.clearMarks();
    panel.clearAll();
    const route = engine.route(text);
    if (!route.leaf) {
      r = null;
      say('Paste or type some text first, or press <b>Try a sample</b>. Then steer me through the chart.');
      board.teleport(...board.nodePos(chart.root)); board.here(chart.root);
      return false;
    }
    if (!route.european) ui.notice('scripts', 'warning', 'This chart only covers European alphabets.', 'The route ends at Bulgarian.');
    r = { text, route, i: 0, errors: 0, hints: 0, blocked: new Map(), moves: [], t0: performance.now(), done: false, busy: false, hadError: false, meta, ys: [] };
    if (!meta.keepSnake) board.setExtra(0);
    board.teleport(...board.nodePos(chart.root));
    board.setPanMode(false);
    board.setFollow(true);
    promptStation();
    return true;
  }

  const blockedSet = () => { if (!r.blocked.has(r.i)) r.blocked.set(r.i, new Set()); return r.blocked.get(r.i); };

  async function choose(ans, via = 'key') {
    if (!r || r.done || r.busy || !active) return;
    const step = r.route.steps[r.i];
    const o = board.graph.out[step.station];
    const edge = ans ? o.y : o.n;
    const tried = blockedSet();
    if (tried.has(ans)) {
      audio.bad(); board.bump(edge.dir);
      say(`That line is blocked, remember? Take the <b>${ans ? 'N' : 'Y'}</b> line instead.`);
      return;
    }
    if (ans === step.answer) return correct(step, edge, ans);
    wrong(step, edge, ans);
  }

  async function correct(step, edge, ans) {
    r.busy = true;
    r.moves.push({ i: r.i, station: step.station, ok: true, ans });
    arc?.onCorrect?.(step);
    clearEvidence();
    audio.good();
    ui.announce(`${ans ? 'Yes' : 'No'}. Correct.`);
    if (ans) {
      r.ys.push(...step.hits);
      panel.setHighlight('hl-y', r.ys);
      panel.scrollTo(step.hits[0].start);
      const rects = step.hits.slice(0, 12).map((h) => ({ text: h.seq, rect: panel.rectOf(h.start, h.end) }));
      ui.flyLetters(rects, board.headScreen());
    }
    setTimeout(() => board.grow(ans), ans ? 380 : 0); // every station passed lengthens the snake; eaten letters land first
    board.flash('good');
    board.showRoute(r.route.steps.slice(0, r.i + 1), null);
    const speed = arc?.speed?.() ?? 1;
    const ok = await board.moveAlong(edge.points, { speed });
    if (!ok || !active || !r) return;
    r.i++;
    if (r.i >= r.route.steps.length) finish(); else promptStation();
  }

  function evidence(step, why) {
    const text = r.text;
    if (step.answer) {
      const h = step.hits[0];
      const p = lc(text, h.start);
      panel.setHighlight('hl-err', step.hits);
      panel.scrollTo(h.start);
      panel.setBadges([{ n: 0, offset: h.start, label: `${h.seq} · ${p.text}`, tone: 'err' }]);
      const body = `${h.seq}, character ${codePointIndex(text, h.start)} (${p.text}).${step.count > 1 ? ` It appears ${step.count} times.` : ''}`;
      ui.notice('steer', 'error', why, `The text has ${body}`);
      return { html: `The text <b>does</b> contain <b class="seq-inline">${E(h.seq)}</b>: character ${codePointIndex(text, h.start)} (${p.text}). That was a <b>Y</b>.`, body: `The text has ${body}` };
    }
    board.strike(step.station, true);
    const none = `None of ${seqText(step.station)} appear in the text.`;
    ui.notice('steer', 'error', none, 'That station answers N.');
    return { html: `<b>${E(none)}</b> That station answers <b>N</b>.`, body: none };
  }

  function wrong(step, edge, ans) {
    r.busy = true;
    r.errors++; r.hadError = true;
    r.moves.push({ i: r.i, station: step.station, ok: false, ans });
    blockedSet().add(ans);
    audio.bad();
    board.bump(edge.dir);
    board.block(edge.id, true);
    const ev = evidence(step, 'Wrong line.');
    say(`Ouch! ${ev.html}`);
    ui.announce(`Wrong line. ${ev.body}`);
    arc?.onWrong?.(step, false);
    setTimeout(() => { if (r && !r.done) r.busy = false; }, 350);
  }

  /** Arcade countdown ran out: counts as a wrong choice without blocking a line. */
  function timeout() {
    if (!r || r.done || r.busy) return;
    const step = r.route.steps[r.i];
    r.busy = true; r.errors++; r.hadError = true;
    r.moves.push({ i: r.i, station: step.station, ok: false, ans: null });
    audio.bad(); board.bump(board.graph.out[step.station][step.answer ? 'y' : 'n'].dir);
    const ev = evidence(step, 'Time is up.');
    say(`Too slow! ${ev.html}`);
    ui.announce(`Time is up. ${ev.body}`);
    arc?.onWrong?.(step, true);
    setTimeout(() => { if (r && !r.done) r.busy = false; }, 350);
  }

  function hint() {
    if (!r || r.done || !active) return;
    const step = r.route.steps[r.i];
    r.hints++;
    arc?.onHint?.();
    if (step.answer) {
      const h = step.hits[0], p = lc(r.text, h.start);
      panel.setHighlight('hl-focus', step.hits);
      panel.scrollTo(h.start);
      panel.setBadges([{ n: 0, offset: h.start, label: `${h.seq} · ${p.text}`, tone: 'hint' }]);
      say(`Hint: <b class="seq-inline">${E(h.seq)}</b> is in the text (${p.text})${step.count > 1 ? `, ${step.count} times` : ''}. Take <b>Y</b>.`);
    } else {
      say(`Hint: none of <b class="seq-inline">${E(seqText(step.station))}</b> appear in the text. Take <b>N</b>.`);
      ui.notice('steer', 'info', 'None found', `The text has no ${seqText(step.station)}.`);
    }
    ui.announce('Hint shown.');
  }

  function finish() {
    r.done = true; r.busy = true;
    const code = r.route.leaf, lf = chart.leaves[code];
    const secs = Math.round((performance.now() - r.t0) / 100) / 10;
    board.here(null);
    audio.fanfare();
    board.flash('good');
    ui.burst('Found!', lf.english);
    ui.found(code);
    btnHint.hidden = true;
    ui.announce(`Found it: ${lf.english}, ${lf.label}. ${r.errors} errors, ${secs} seconds.`);
    const wrongBy = new Map();
    for (const m of r.moves) if (!m.ok) wrongBy.set(m.i, (wrongBy.get(m.i) ?? 0) + 1);
    const items = r.route.steps.map((s, i) => `<li><span class="step-n">${i + 1}</span><span class="seq">${E(seqText(s.station))}</span><b class="ans ${s.answer ? 'y' : 'n'}">${s.answer ? 'Y' : 'N'}</b>${wrongBy.has(i) ? `<span class="meta bad">missed ×${wrongBy.get(i)}</span>` : '<span class="meta">clean</span>'}</li>`).join('');
    result.innerHTML = `<div class="note"><strong>${E(lf.english)} · ${E(lf.label)}</strong><span>${r.errors} wrong ${r.errors === 1 ? 'turn' : 'turns'}, ${r.hints} ${r.hints === 1 ? 'hint' : 'hints'}, ${secs} s.</span></div>
      <details class="replay"><summary>Your moves</summary><ol class="route plain">${items}</ol></details>
      <div class="row"><button type="button" class="btn btn-small" id="btn-replay">Replay correct route</button><button type="button" class="btn btn-small" id="btn-card">Language card</button></div>`;
    $('#btn-card').onclick = () => ui.showCard(code);
    $('#btn-replay').onclick = replay;
    say(`Found it: <b>${E(lf.english)}</b>! ${r.errors ? `${r.errors} wrong ${r.errors === 1 ? 'turn' : 'turns'} on the way.` : 'Not one wrong turn.'}`);
    if (!arc) { btnNext.hidden = false; btnNext.firstChild.textContent = 'Another sample '; }
    arc?.onTerminal?.(r);
  }

  async function replay() {
    if (!r?.done) return;
    const steps = r.route.steps;
    const box = board.bboxOf(steps.flatMap((s) => board.graph.edges[`${s.station}|${s.answer ? 'y' : 'n'}`].points));
    board.showRoute(steps, r.route.leaf);
    board.frame(box, { pad: 60, maxZ: 2.4 });
    board.teleport(...board.nodePos(chart.root));
    board.setExtra(0);
    for (const s of steps) { audio.tick(); board.grow(s.answer); if (!(await board.moveAlong(board.graph.edges[`${s.station}|${s.answer ? 'y' : 'n'}`].points, { speed: 3 }))) return; }
  }

  function chooseDir(dir) {
    if (!r || r.done || r.busy) return;
    const o = board.graph.out[r.route.steps[r.i].station];
    if (o.y.dir === dir) choose(true); else if (o.n.dir === dir) choose(false);
    else { say(`No line leaves ${DIR_WORD[dir]} from here. <span class="muted">Y goes ${DIR_WORD[o.y.dir]}, N goes ${DIR_WORD[o.n.dir]}.</span>`); }
  }

  const onTarget = (key) => {
    if (!r || r.done || r.busy) return;
    const o = board.graph.out[r.route.steps[r.i].station];
    if (o.y.to === key) choose(true); else if (o.n.to === key) choose(false);
  };

  return Object.assign(st, {
    start, choose, hint, timeout, replay, clearEvidence,
    setArcade(v) { arc = v; },
    enter() {
      active = true;
      board.on.station = onTarget;
      board.on.leaf = (code) => onTarget(`L:${code}`);
      board.on.hover = null;
      board.on.swipe = (d) => chooseDir(d);
      board.setFog(null);
      btnHint.hidden = false;
      if (!arc) {
        panel.setEditable(true);
        if (!panel.text().trim() || ctx.isUrl(panel.text())) ctx.loadRandomSample(); else start(panel.text());
      }
    },
    exit() {
      active = false;
      board.cancelMove(); board.clearRoute(); board.clearMarks(); board.setExtra(0); board.here(null);
      panel.clearAll(); ui.clearNotice('steer'); ui.clearNotice('scripts'); ui.clearNotice('empty');
      r = null;
    },
    onText(text) { if (active && !arc) start(text); },
    key(e) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYDIR[k]) { chooseDir(KEYDIR[k]); return true; }
      if (k === 'y') { choose(true); return true; }
      if (k === 'n') { choose(false); return true; }
      if (k === 'h') { hint(); return true; }
      if (k === 'Enter' && r?.done && !arc) { ctx.loadRandomSample(); return true; }
      return false;
    },
  });
}
