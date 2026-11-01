// Detect on the Europe map: "Guess Who" with the language model. The model picks yes/no questions for this text,
// the snake answers them by looking at the text, and the ruled-out languages fade until one is left (SPEC 16.3).
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_LETTERS = 30, SHORT_LETTERS = 15, PAUSE_MS = 2000, CLOSE = 0.1;
const letters = (t) => (t.match(/\p{L}/gu) ?? []).length;
const times = (k) => (k === 1 ? 'once' : k === 2 ? 'twice' : `${k} times`);

export function createDetect(ctx, replay) {
  const { engine, leaves, busInfo, europe, model, map, panel, ui, store, audio } = ctx;
  const list = $('#route-list'), title = $('#result-title'), chip = $('#eu-chip'), btn = $('#btn-replay'), poster = $('#poster-line');
  const all = new Set(map.codes);
  const name = (c) => leaves[c].english;
  const lineName = (c) => europe.lines[europe.stations[c].line]?.name;
  let active = false, token = 0, timer = 0;
  let r = null; // { text, steps, hits, win, p, runner, posterLeaf, back }
  let provisional = false, confirmedLang = null;

  const sure = (p) => (p > 0.995 ? 'over 99%' : `${Math.round(p * 100)}%`);
  const left = (i) => (i < 0 ? all.size : r.steps[i].left);
  const keepAt = (i) => (i < 0 ? all : r.steps[i].alive);
  const finalKeep = () => new Set([r.win, ...(r.runner ? [r.runner.lang] : [])]);

  function paintText(upTo = -1) {
    panel.clearAll();
    if (!r) return;
    const yes = r.steps.map((s, i) => (i <= upTo && s.count ? i : -1)).filter((i) => i >= 0);
    panel.setHighlight('hl-y', yes.flatMap((i) => r.hits[i]));
    panel.setBadges(yes.map((i) => ({ n: i + 1, offset: r.hits[i][0].start })));
  }
  function focusStep(i) {
    list.querySelectorAll('.step').forEach((b) => b.classList.toggle('is-focus', Number(b.dataset.i) === i));
    const h = r?.hits[i];
    if (h?.length) { panel.setHighlight('hl-focus', h); panel.scrollTo(h[0].start); } else panel.clearHighlight('hl-focus');
  }

  function renderList() {
    list.innerHTML = '';
    if (!r) return;
    r.steps.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="step" data-i="${i}"><span class="step-n">${i + 1}</span><span class="seq q-text">${ui.esc(model.describe(s.gram))}</span><b class="ans ${s.count ? 'y' : 'n'}">${s.count ? `Yes ×${s.count}` : 'No'}</b><span class="meta">${s.left} left</span></button>`;
      list.append(li);
    });
  }

  function foundLine() {
    const run = r.runner ? ` <span class="muted">· or ${ui.esc(name(r.runner.lang))} (${sure(r.runner.p)})</span>` : '';
    return `${ui.flagHtml(r.win)}<span>${provisional ? 'Leaning to' : 'Found'} <b>${ui.esc(name(r.win))}</b> <span class="muted">· ${sure(r.p)} sure${busInfo(r.win) ? ` (${ui.esc(busInfo(r.win).stop)})` : ''}</span>${run}${provisional ? '<br><span class="hint">Keep typing, or press Finish.</span>' : ''}</span>${provisional ? '<button type="button" class="btn btn-small" data-finish>Finish</button>' : '<button type="button" class="btn btn-small" data-card>Card</button>'}`;
  }
  function setTitle() { title.innerHTML = r ? `<span class="found-line">${foundLine()}</span>` : 'Questions'; }

  /** The map and the side panel after answering question i (-1 = before the first). end: the full verdict; rest: reading the rest. */
  function show(i, { end = false, rest = false } = {}) {
    if (!r) return;
    map.clearMarks('lit');
    paintText(i);
    list.querySelectorAll('.step').forEach((b) => b.classList.toggle('is-now', !end && Number(b.dataset.i) === i));
    chip.hidden = false;
    if (end) {
      map.setOut(finalKeep());
      map.mark(r.win, 'lit', true);
      const lf = leaves[r.win], bi = busInfo(r.win);
      chip.innerHTML = `<span class="eu-found">${ui.flagHtml(r.win)}<span><b>${ui.esc(lf.english)}</b> · ${sure(r.p)} sure<br><span class="hint">${ui.esc(lf.label.split(' / ')[0])}${bi ? ` · ${ui.esc(bi.stop)}` : ''}</span></span></span>`;
      return;
    }
    map.setOut(i < 0 ? null : keepAt(i));
    if (rest) chip.innerHTML = `<span class="eu-q">Now the snake reads the rest of the text…</span>`;
    else if (i < 0) chip.innerHTML = `<span class="eu-n"><b>${all.size}</b> languages in play</span>`;
    else {
      const s = r.steps[i], n = s.left, lead = lineName(s.top.lang) ?? name(s.top.lang);
      chip.innerHTML = `<span class="eu-q">Has <b class="seq-inline">${ui.esc(model.describe(s.gram))}</b>?</span> <span class="eu-a ${s.count ? 'y' : 'n'}">${s.count ? `Yes, ${times(s.count)}.` : 'No.'}</span> <span class="eu-n">${ui.esc(lead)} ${s.count ? 'languages light up' : 'still leads'}; <b>${n}</b> left.</span>`;
    }
  }

  function done(celebrate) {
    if (celebrate) {
      confirmedLang = r.win;
      audio.fanfare();
      ui.burst('Found!', name(r.win));
      ui.found(r.win);
    }
    if (r.back) ui.notice('back', 'info', `The rest of the text pointed back to ${name(r.win)}`, 'The questions had ruled it out, but reading every letter group put it first again.');
    ui.announce(`${name(r.win)}, ${sure(r.p)} sure${r.runner ? `, or maybe ${name(r.runner.lang)}` : ''}.`);
  }

  async function play({ celebrate = true } = {}) {
    if (!r) return;
    const my = ++token, n = r.steps.length;
    ui.clearNotice('back');
    if (store.settings.reduced) { show(n - 1, { end: true }); setTitle(); done(celebrate); return; }
    show(-1);
    await sleep(600);
    for (let i = 0; i < n; i++) {
      if (my !== token) return;
      show(i);
      audio.tick();
      await sleep(900);
    }
    if (my !== token) return;
    show(n - 1, { rest: true });
    await sleep(900);
    if (my !== token) return;
    show(n - 1, { end: true });
    setTitle();
    done(celebrate);
  }

  function finish() {
    clearTimeout(timer);
    if (!r || !provisional) return;
    provisional = false; ui.clearNotice('typing');
    token++; show(r.steps.length - 1, { end: true }); setTitle(); done(true);
  }
  function waitConfirm() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!active || !r || !provisional) return;
      const n = letters(panel.text());
      if (n < MIN_LETTERS) ui.notice('typing', 'info', 'Keep typing', `So far the model leans to ${name(r.win)}. It needs at least ${MIN_LETTERS} letters to be fair: ${n} so far. Press Finish to stop here.`);
      else finish();
    }, PAUSE_MS);
  }

  function reset(heading = 'Questions') {
    clearTimeout(timer); token++; r = null; provisional = false;
    replay.reset(); // clears the map marks, chip and list
    title.textContent = heading; poster.hidden = true;
    panel.clearAll();
    ui.clearNotice('typing'); ui.clearNotice('back');
  }

  list.addEventListener('click', (e) => { const b = e.target.closest('.step'); if (active && b && r) { token++; show(Number(b.dataset.i)); focusStep(Number(b.dataset.i)); } });
  list.addEventListener('pointerover', (e) => { const b = e.target.closest('.step'); if (active && b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('focusin', (e) => { const b = e.target.closest('.step'); if (active && b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('pointerleave', () => active && focusStep(-1));
  title.addEventListener('click', (e) => {
    if (!active || !r) return;
    if (e.target.closest('[data-card]')) ctx.openCard(r.win);
    else if (e.target.closest('[data-finish]')) finish();
  });
  btn.addEventListener('click', () => { if (active && r && !provisional) play({ celebrate: false }); });

  function onText(text, info = {}) {
    if (!active) return;
    ui.clearNotice('empty'); ui.clearNotice('scripts');
    clearTimeout(timer);
    if (ctx.isUrl(text)) { reset(); ui.notice('empty', 'info', 'That looks like a web address', 'Press Enter or the button to fetch its text.'); return; }
    const n = letters(text);
    if (!n) {
      reset();
      if (text.trim()) ui.notice('empty', 'info', 'No letters to read', 'Digits and punctuation do not say anything about a language.');
      else ui.notice('empty', 'info', 'Nothing to read yet', 'Type, paste text or a web address, or try a sample.');
      return;
    }
    if (n < SHORT_LETTERS) { reset(); ui.notice('empty', 'info', 'Too short to tell yet', `The snake needs at least ${SHORT_LETTERS} letters to ask anything useful: ${n} so far.`); return; }
    const v = model.verdict(text);
    const steps = model.questions(text);
    const win = v.ranking[0].lang, second = v.ranking[1];
    const lastAlive = steps.at(-1)?.alive;
    const route = engine.route(text);
    if (!route.european) ui.notice('scripts', 'warning', 'This map only covers European alphabets.', 'The model names the closest language it knows anyway.');
    replay.reset();
    r = {
      text, steps, win, p: v.ranking[0].p, hits: steps.map((s) => model.occurrences(text, s.gram)),
      runner: second.p > CLOSE ? second : null, back: !!lastAlive && !lastAlive.has(win),
    };
    poster.hidden = !route.leaf;
    if (route.leaf) poster.innerHTML = `The poster's chart would say: <b>${ui.esc(name(route.leaf))}</b>${route.leaf === win ? ', the same' : ''}.`;
    renderList(); btn.hidden = false; ui.clearNotice('back');
    const typing = !!info.user && !/^insertFrom(Paste|Drop)/.test(info.inputType ?? '');
    if (typing) {
      // a confirmed answer stays confirmed while the typing does not change it
      provisional = !(confirmedLang && confirmedLang === win);
      token++; show(steps.length - 1, { end: true }); setTitle();
      if (provisional) waitConfirm(); else if (r.back) done(false);
    } else { provisional = false; confirmedLang = null; title.textContent = 'Questions'; play(); }
  }

  return {
    enter() {
      active = true;
      panel.setEditable(true);
      title.textContent = 'Questions';
      // Detect waits for the player: a sample another mode loaded on its own is not carried over.
      if (ctx.autoSampleText && panel.text() === ctx.autoSampleText) { ctx.autoSampleText = null; panel.setText(''); }
      else onText(panel.text(), {});
    },
    exit() {
      active = false; confirmedLang = null;
      reset();
      ui.clearNotice('scripts'); ui.clearNotice('empty');
    },
    onText,
    key(e) {
      if (e.key !== 'Enter' || !r) return false;
      if (provisional) finish(); else play({ celebrate: false });
      return true;
    },
    onStation(c) { if (c) ctx.openCard(c); },
  };
}
