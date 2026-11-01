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
  let provisional = false, confirmTimer = 0; // see waitConfirm()
  // The trained model only speaks once the chart's route is confirmed (SPEC 6.2, "Detour").
  const V = new URL(import.meta.url).searchParams.get('v') ?? '';
  const SHORT_LETTERS = 15, SURE = 0.6;
  const readOut = $('#read-out');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sure = (p) => (p > 0.995 ? 'over 99%' : `${Math.round(p * 100)}%`);
  let modelP = null; // loaded on first use, not at page load
  const getModel = () => (modelP ??= import(`../model.js?v=${V}`).then((m) => m.loadModel(new URL(`../data/model.json?v=${V}`, import.meta.url))).catch((e) => { modelP = null; throw e; }));
  let extraP = null; // names of the Europe map's bus languages, only needed when the reading is one of them
  const getExtra = () => (extraP ??= fetch(new URL(`../data/extra.json?v=${V}`, import.meta.url)).then((r) => r.json()).catch((e) => { extraP = null; throw e; }));
  let seq = 0; // bumped whenever a pending reading goes stale
  let reading = null; // { win } while a detour is shown
  const lc = (text, off) => lineCol(text, off);
  const only = new Set(Object.keys(chart.leaves)); // the model also knows the Europe map's bus languages; the poster must not detour to them
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
    if (reading) {
      const li = document.createElement('li');
      li.className = 'step-shortcut';
      li.innerHTML = `<span class="step-n">&#8631;</span><span>Shortcut &rarr; ${ui.esc(chart.leaves[reading.win].english)} (my reading)</span>`;
      list.append(li);
    }
    const end = reading?.win ?? route.leaf, lf = chart.leaves[end];
    const said = reading ? ` &mdash; the chart said ${ui.esc(chart.leaves[route.leaf].english)}` : '';
    title.innerHTML = provisional
      ? `<span class="found-line">${ui.flagHtml(route.leaf)}<span>Heading to <b>${ui.esc(lf.english)}</b> <span class="muted">· keep typing</span></span><button type="button" class="btn btn-small btn-primary" data-finish>Finish</button></span>`
      : `<span class="found-line">${ui.flagHtml(end)}<span>Ends at <b>${ui.esc(lf.english)}</b> <span class="muted">· ${ui.esc(lf.label)}${said}</span></span><button type="button" class="btn btn-small" data-card>Card</button></span>`;
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
    seq++; clearReading();
    board.cancelMove();
    const steps = route.steps;
    board.here(null);
    board.showRoute(steps, null, from); // the trail so far stays lit; the rest lights up as the snake passes
    board.setExtra(board.growthFor(steps.slice(0, from)));
    const before = steps.slice(0, from).flatMap((s) => board.graph.edges[`${s.station}|${s.answer ? 'y' : 'n'}`].points);
    board.teleport(...board.nodePos(steps[Math.min(from, steps.length - 1)].station), before);
    for (let i = from; i < steps.length; i++) {
      const e = board.graph.edges[`${steps[i].station}|${steps[i].answer ? 'y' : 'n'}`];
      board.lightStep(steps[i], i);
      board.grow(steps[i].answer);
      audio.tick();
      if (!(await board.moveAlong(e.points, { speed })) || my !== token) return;
    }
    board.here(null);
    if (my === token) (provisional ? waitConfirm() : arrived());
  }
  function clearReading() {
    reading = null; readOut.innerHTML = ''; panel.clearHighlight('hl-clue'); board.clearShortcut();
    if (route?.leaf) board.mark(route.leaf, 'was', false);
  }
  function finish(code, celebrate, extra = '') {
    board.mark(code, 'on', true);
    if (!celebrate) return;
    audio.fanfare();
    board.flash('good');
    ui.burst('Found!', chart.leaves[code].english);
    ui.found(code);
    ui.announce(`Route ends at ${chart.leaves[code].english}, ${chart.leaves[code].label}.${extra}`);
  }

  /** The chart's flag is reached: say what the model reads, and take a detour if it disagrees with confidence. */
  async function arrived(celebrate = true) {
    const my = ++seq, text = panel.text(), chartCode = route.leaf, name = (c) => chart.leaves[c].english;
    clearReading();
    board.mark(chartCode, 'on', true);
    const enough = letters(text) >= SHORT_LETTERS;
    let m = null;
    if (enough) { try { m = await getModel(); } catch { /* offline: the chart's answer stands */ } }
    if (my !== seq || !active) return;
    const say = (html) => { readOut.innerHTML = `<div class="note note-info">${html}</div>`; };
    const top = m?.verdict(text, { only }).ranking[0];
    if (!enough) say('<strong>Too short for me to check.</strong>');
    if (!top) return finish(chartCode, celebrate);
    // The full model may read a regional language the poster leaves out: name it and point to the Europe map, no detour.
    const full = m.verdict(text).ranking[0];
    if (!only.has(full.lang) && full.p >= SURE) {
      const x = (await getExtra().catch(() => null))?.leaves[full.lang];
      if (my !== seq || !active) return;
      if (x) {
        say(`<strong>The chart says ${ui.esc(name(chartCode))}. My reading: ${ui.esc(x.english)} (${ui.esc(x.label)}, ${sure(full.p)} sure), a regional language that is not on this poster.</strong> It is a bus stop on the <a href="europe.html#lang=${encodeURIComponent(full.lang)}">Europe map</a>.`);
        return finish(chartCode, celebrate);
      }
    }
    if (top.lang === chartCode) {
      say(`<strong>The chart and my reading agree: ${ui.esc(name(chartCode))} (${sure(top.p)} sure)</strong>`);
      return finish(chartCode, celebrate);
    }
    if (top.p < SURE) {
      const [a, b] = m.verdict(text, { only }).ranking;
      say(`<strong>The chart says ${ui.esc(name(chartCode))}. My reading is unsure: ${ui.esc(name(a.lang))} ${Math.round(a.p * 100)}%, ${ui.esc(name(b.lang))} ${Math.round(b.p * 100)}%.</strong>`);
      return finish(chartCode, celebrate);
    }
    // Detour: the chart's route stands, the snake explains where it parted from the reading, then takes a shortcut.
    const win = top.lang;
    const d = engine.diverge(route.steps, win), need = d?.path[d.index], step = route.steps[d.index];
    const code = (s) => `<code>${ui.esc(s)}</code>`;
    let why = `The chart sends this to <b>${ui.esc(name(chartCode))}</b>.`;
    if (need && step) {
      const seqs = engine.testOf(need.station).join(', '), n = d.index + 1;
      why = need.answer
        ? `The chart sends this to <b>${ui.esc(name(chartCode))}</b>: it has no ${code(seqs)}, so it turned at step ${n}. ${ui.esc(name(win))} needs ${code(seqs)} at step ${n}; your text has none.`
        : `The chart sends this to <b>${ui.esc(name(chartCode))}</b>: your text has ${code(step.hits[0].seq)}, which sends it the other way at step ${n}. ${ui.esc(name(win))} needs N there.`;
    }
    const clues = m.clues(text, win, chartCode);
    const list_ = clues.map((c) => ui.esc(m.describe(c.gram))).join(', ');
    const read = clues.length ? `But I read clues for <b>${ui.esc(name(win))}</b>: ${list_} (${sure(top.p)} sure).` : `But I read <b>${ui.esc(name(win))}</b> (${sure(top.p)} sure).`;
    reading = { win };
    say(`<strong>My reading differs from the chart</strong><span>${why}</span><span>${read}</span>`);
    panel.setHighlight('hl-clue', clues.flatMap((c) => m.occurrences(text, c.gram)));
    const pts = board.shortcut(chartCode, win);
    if (celebrate) {
      board.frame(board.bboxOf(pts), { pad: 140, maxZ: 1.6 });
      if (!store.settings.reduced) await sleep(900);
      if (my !== seq || !active) return;
      if (!(await board.moveAlong(pts, { speed: 6 })) || my !== seq) return;
    } else board.teleport(...pts[1]);
    board.mark(chartCode, 'on', false); board.mark(chartCode, 'was', true);
    renderList();
    finish(win, celebrate, ` The chart said ${name(chartCode)}.`);
  }

  // While the player types, the route is only provisional: no "Found!" until they pause with enough text to be fair.
  const MIN_LETTERS = 30, PAUSE_MS = 2000;
  const letters = (t) => (t.match(/\p{L}/gu) ?? []).length;
  function waitConfirm() {
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      if (!active || !route?.leaf || !provisional) return;
      const n = letters(panel.text());
      if (n < MIN_LETTERS) {
        ui.notice('typing', 'info', 'Keep typing', `So far the snake is heading to ${chart.leaves[route.leaf].english}. Short texts take odd routes, so the chart needs at least ${MIN_LETTERS} letters to be fair: ${n} so far. Press Finish to stop here.`);
        return;
      }
      confirm();
    }, PAUSE_MS);
  }
  function confirm() {
    clearTimeout(confirmTimer);
    provisional = false;
    ui.clearNotice('typing');
    renderList();
    if (!board.moving) arrived(); // otherwise play() calls arrived() when the snake gets there
  }

  /** Called whenever the text changes. */
  function onText(text, info = {}) {
    if (!active) return;
    seq++; clearReading();
    const prev = prevSteps;
    ctx.urlRowUpdate?.(text);
    if (ctx.isUrl(text)) { route = null; prevSteps = null; board.clearRoute(); renderList(); paintText(); ui.notice('empty', 'info', 'That looks like a web address', 'Press Enter or the button to fetch its text.'); return; }
    ui.clearNotice('empty');
    clearTimeout(confirmTimer);
    const typing = !!info.user && !/^insertFrom(Paste|Drop)/.test(info.inputType ?? '');
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
    // first changed step: the snake reruns from there
    let k = 0;
    if (prev) while (k < prev.length && k < route.steps.length && prev[k].station === route.steps[k].station && prev[k].answer === route.steps[k].answer) k++;
    const same = prev && k === prev.length && k === route.steps.length;
    provisional = same ? provisional && typing : typing; // a confirmed route stays confirmed while it does not change
    ui.clearNotice('typing'); // a pause brings it back with the current count
    renderList(); paintText(); focusStep(-1); runWhy();
    const box = board.bboxOf([board.nodePos(chart.root), ...route.steps.flatMap((s) => board.graph.edges[`${s.station}|${s.answer ? 'y' : 'n'}`].points), board.nodePos(`L:${route.leaf}`)]);
    board.frame(box, { pad: 60, maxZ: 2.4 });
    prevSteps = route.steps.map((s) => ({ station: s.station, answer: s.answer }));
    if (same) { board.here(null); if (provisional && !board.moving) waitConfirm(); else if (!provisional && !board.moving) arrived(false); return; }
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
  title.addEventListener('click', (e) => {
    if (!route?.leaf) return;
    if (e.target.closest('[data-card]')) ui.showCard(reading?.win ?? route.leaf);
    else if (e.target.closest('[data-finish]')) confirm();
  });

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
      // Detect waits for the player: a sample another mode loaded on its own is not carried over.
      if (ctx.autoSampleText && panel.text() === ctx.autoSampleText) { ctx.autoSampleText = null; panel.setText(''); }
      else onText(panel.text(), {});
    },
    exit() {
      active = false; token++; seq++; clearReading();
      ui.clearNotice('scripts'); ui.clearNotice('live'); ui.clearNotice('empty'); ui.clearNotice('typing');
      clearTimeout(confirmTimer); provisional = false;
      prevSteps = null;
    },
    onText,
    key(e) {
      if (e.key === 'Enter' && route?.leaf) { if (provisional) confirm(); else play(0, 4); return true; }
      return false;
    },
    rerun() { prevSteps = null; if (route?.leaf) play(0, 4); },
    get route() { return route; },
  };
}
