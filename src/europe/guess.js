// Guess the station: ten sample texts, tap where each is spoken (SPEC 16.3).
const $ = (s) => document.querySelector(s);
const ROUNDS = 10;
const EXACT = 100, FAMILY = 40;
const icon = (id, style = '') => `<svg class="icon" aria-hidden="true" ${style ? `style="${style}"` : ''}><use href="#${id}"/></svg>`;

export function createGuess(ctx, replay) {
  const { leaves, europe, samples, map, panel, ui, audio, store, engine } = ctx;
  const { esc } = ui;
  const S = europe.stations, L = europe.lines;
  const hud = $('#hud'), box = $('#guess-panel'), dlgOver = $('#dlg-over');
  const narrow = matchMedia('(max-width: 899px)');
  let active = false;
  let run = null; // { n, score, streak, best, exact, family, picks: [{ lang, pts }] , order, round }

  const lineOf = (c) => S[c].line ?? europe.buses[S[c].bus]?.line; // a bus stop counts as the family of its route
  const nameOf = (c) => leaves[c].english;

  function drawHud() {
    if (!run) { hud.innerHTML = ''; return; }
    hud.innerHTML = `
      <div class="hud-chip" aria-label="Round"><span class="label">Round</span><span class="num">${Math.min(run.n, ROUNDS)}/${ROUNDS}</span></div>
      <div class="hud-chip" aria-label="Score">${icon('i-coin')}<span class="num">${String(run.score).padStart(4, '0')}</span></div>
      <div class="hud-chip" aria-label="Streak of exact answers">${icon('i-bolt')}<span class="num">×${run.streak}</span></div>`;
  }

  function idle() {
    run = null; drawHud();
    replay.reset(); map.clearMarks('ans', 'bad');
    panel.setEditable(false); panel.setText('');
    ctx.setMeta(null);
    ui.clearNotice('empty');
    box.innerHTML = `<div class="note"><strong>Where is it spoken?</strong><span>Ten texts. Read each one and tap its station on the map: <b>${EXACT}</b> points for the exact language, <b>${FAMILY}</b> for another language on the same line (&ldquo;Right family&rdquo;). Then see the poster's route for the text.</span></div>
      <div class="row"><button class="btn btn-primary" type="button" id="guess-start">Start game <kbd>Enter</kbd></button></div>
      ${store.scores().length ? `<p class="hint">Best: ${store.scores()[0].score.toLocaleString('en')} points (${esc(store.scores()[0].name)}).</p>` : ''}`;
    $('#guess-start').onclick = start;
  }

  function start() {
    const pool = [...new Map(samples.map((s) => [s.lang, s])).values()].filter((s) => S[s.lang]);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    run = { n: 0, score: 0, streak: 0, best: 0, exact: 0, family: 0, picks: [], order: pool.slice(0, ROUNDS), round: null };
    next();
  }

  function next() {
    map.clearMarks('ans', 'bad');
    replay.reset();
    ui.clearNotice('empty');
    if (run.n >= ROUNDS) { gameOver(); return; }
    const s = run.order[run.n++];
    run.round = { sample: s, answered: false };
    ctx.setMeta(null);
    panel.setText(s.text);
    map.overview();
    drawHud();
    box.innerHTML = `<div class="note note-info"><strong>Round ${run.n} of ${ROUNDS}: where is this spoken?</strong><span>Tap a station on the map, or move with the arrow keys and press Enter.</span></div>`;
    map.setTabStop('ces');
    $('#board').focus({ preventScroll: true });
    ui.announce(`Round ${run.n} of ${ROUNDS}. Read the text and pick the station where it is spoken.`);
  }

  function answer(code) {
    const r = run?.round;
    if (!r || r.answered) return;
    r.answered = true;
    const right = r.sample.lang;
    const pts = code === right ? EXACT : lineOf(code) && lineOf(code) === lineOf(right) ? FAMILY : 0;
    run.score += pts;
    run.streak = pts === EXACT ? run.streak + 1 : 0;
    run.best = Math.max(run.best, run.streak);
    if (pts === EXACT) run.exact++; else if (pts) run.family++;
    run.picks.push({ lang: right, guess: code, pts });
    drawHud();
    map.mark(right, 'ans', true);
    if (code !== right) map.mark(code, 'bad', true);
    (pts ? audio.good : audio.bad)();
    if (pts === EXACT) ui.burst('Exact!', `+${EXACT}`);
    else if (pts) ui.burst('Right family', `+${FAMILY}`, 'burst-gold');
    else if (store.settings.shake && !store.settings.reduced) { const w = $('#board-wrap'); w.classList.add('shake'); setTimeout(() => w.classList.remove('shake'), 400); }
    if (narrow.matches) map.frame([map.pos[right], map.pos[code]], { pad: 220, maxZ: 1.2 });

    // the poster's route for this text, replayed fast
    const text = panel.text();
    const route = engine.route(text);
    replay.renderList(route, text);
    // the sample's source is shown only now: its title may name the language
    $('#text-meta').innerHTML = ctx.sampleMeta(r.sample).html;
    replay.play({ delay: 450, celebrate: false });

    const tone = pts === EXACT ? 'success' : pts ? 'info' : 'error';
    const head = pts === EXACT ? `Exact! +${EXACT}` : pts ? `Right family +${FAMILY}` : 'Not this time. 0 points';
    const lineName = S[right].bus ? `${ctx.busInfo(right).text}, ${europe.buses[S[right].bus].name} route` : lineOf(right) ? `${L[lineOf(right)].name} line, ${S[right].branch}` : 'on its own';
    const last = run.n >= ROUNDS;
    box.innerHTML = `<div class="note note-${tone}"><strong>${head}</strong>
        <span class="found-line">${ui.flagHtml(right)}<span>It was <b>${esc(nameOf(right))}</b> (${esc(leaves[right].label.split(' / ')[0])}), ${esc(lineName)}.${code !== right ? ` You picked ${esc(nameOf(code))}${S[code].line ? `, ${esc(L[S[code].line].name)} line` : S[code].bus ? ', a bus stop' : ''}.` : ''}</span></span>
        ${route.leaf && route.leaf !== right ? `<span>The poster sends this text to <b>${esc(nameOf(route.leaf))}</b>: its letters decide, not the family.</span>` : route.leaf ? '<span>The poster agrees: the route below ends at the same language.</span>' : ''}</span></div>
      <div class="row"><button class="btn btn-primary" type="button" id="guess-next">${last ? 'See results' : 'Next round'} <kbd>Enter</kbd></button></div>`;
    $('#guess-next').onclick = next;
    $('#guess-next').focus({ preventScroll: true });
    ui.announce(`${head.replace('!', '.')} It was ${nameOf(right)}.`);
  }

  // ---------- results and top 10 ----------
  const rowsHtml = (hi, mark) => hi.map((s, i) => `<tr${i === mark ? ' aria-current="true"' : ''}><td><span class="rank${i < 3 ? ` rank-${i + 1}` : ''}">${i + 1}</span></td><td>${esc(s.name)}</td><td class="is-num">${s.exact}/${ROUNDS}</td><td class="is-num">${s.score.toLocaleString('en')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No scores yet.</td></tr>';
  function gameOver() {
    audio.over();
    run.over = true;
    const qualifies = store.qualifies(run.score);
    const flagsHtml = run.picks.map((p) => `<span class="mini-flag ${p.pts === EXACT ? 'is-ok' : p.pts ? 'is-half' : 'is-miss'}" title="${esc(nameOf(p.lang))}: ${p.pts} points">${ui.flagHtml(p.lang)}</span>`).join('');
    dlgOver.innerHTML = `
      <h2 class="title-card" id="over-title">End of the line</h2>
      <div class="hud over-stats">
        <div class="hud-chip">${icon('i-coin')}<span class="label">Score</span><span class="num">${run.score.toLocaleString('en')}</span></div>
        <div class="hud-chip"><span class="label">Exact</span><span class="num">${run.exact}/${ROUNDS}</span></div>
        <div class="hud-chip"><span class="label">Right family</span><span class="num">${run.family}</span></div>
        <div class="hud-chip">${icon('i-bolt')}<span class="label">Best streak</span><span class="num">${run.best}</span></div>
      </div>
      <div class="over-flags">${flagsHtml}</div>
      ${qualifies ? `<form id="over-form" class="over-form"><label class="field"><span class="label">Your initials (3 letters)</span><input class="input initials" name="ini" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AAA" required></label><button class="btn btn-primary" type="submit">Save score</button></form>` : '<p class="muted">Not in the top 10 this time.</p>'}
      <div class="table-shell"><table class="table" id="over-table"><thead><tr><th>Rank</th><th>Player</th><th class="is-num">Exact</th><th class="is-num">Score</th></tr></thead><tbody>${rowsHtml(store.scores(), -1)}</tbody></table></div>
      <div class="row"><button class="btn btn-primary" type="button" id="over-again">Play again</button><button class="btn btn-quiet" type="button" id="over-close">Close</button></div>`;
    const summary = { score: run.score, exact: run.exact };
    const form = $('#over-form');
    if (form) {
      const input = form.elements.ini;
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = (input.value || 'AAA').toUpperCase().padEnd(3, '-').slice(0, 3);
        const idx = store.addScore({ name, ...summary, date: new Date().toISOString().slice(0, 10) });
        $('#over-table tbody').innerHTML = rowsHtml(store.scores(), idx);
        form.remove();
      });
    }
    $('#over-again').onclick = () => { dlgOver.close(); start(); };
    $('#over-close').onclick = () => dlgOver.close();
    ui.open(dlgOver);
    (form ? form.elements.ini : $('#over-again')).focus();
  }
  dlgOver.addEventListener('close', () => { if (active && run?.over) idle(); });

  return {
    enter() { active = true; hud.hidden = false; idle(); },
    exit() { active = false; run = null; hud.hidden = true; hud.innerHTML = ''; box.innerHTML = ''; replay.reset(); map.clearMarks('ans', 'bad'); panel.setEditable(true); panel.setText(''); ctx.setMeta(null); },
    onText() {},
    onStation(c) {
      if (!c) return;
      if (run?.round && !run.round.answered) answer(c); else if (run) ctx.openCard(c);
    },
    key(e) {
      if (e.key === 'Enter' && !run) { start(); return true; }
      return false;
    },
  };
}
