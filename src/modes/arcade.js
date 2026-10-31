// Arcade: Steer with samples, a station clock, lives, score, levels and a local top 10 (SPEC 6.4).
const $ = (s) => document.querySelector(s);
const MAX_LIVES = 3;
const icon = (id, style = '') => `<svg class="icon" aria-hidden="true" ${style ? `style="${style}"` : ''}><use href="#${id}"/></svg>`;

export function createArcade(ctx, steer) {
  const { chart, samples, board, panel, ui, audio, store } = ctx;
  const hud = $('#hud');
  const bubble = $('#bubble-text');
  const btnNext = $('#btn-next'), btnRetry = $('#btn-retry'), btnHint = $('#btn-hint');
  const dlgOver = $('#dlg-over'), dlgMenu = $('#dlg-menu');
  const total = Object.keys(chart.leaves).length;
  let active = false;
  let run = null;
  let paused = false;
  let left = 8, limit = 8;
  let timerId = 0, autoId = 0, lastTick = 0;

  const limitFor = (level) => Math.max(3, 8 - 0.5 * (level - 1));
  const mult = () => 1 + Math.floor(run.streak / 5);

  function drawHud() {
    if (!run) { hud.innerHTML = ''; return; }
    const hearts = Array.from({ length: MAX_LIVES }, (_, i) => icon('i-heart', '') .replace('class="icon"', `class="icon${i < run.lives ? '' : ' is-empty'}"`)).join('');
    const pct = Math.max(0, Math.min(100, (left / limit) * 100));
    hud.innerHTML = `
      <div class="hud-chip" aria-label="Lives: ${run.lives} of ${MAX_LIVES}"><span class="hearts">${hearts}</span></div>
      <div class="hud-chip" aria-label="Score">${icon('i-coin')}<span class="num">${String(run.score).padStart(5, '0')}</span></div>
      <div class="hud-chip" aria-label="Streak multiplier">${icon('i-bolt')}<span class="num">×${mult()}</span></div>
      <div class="hud-chip" aria-label="Level">${icon('i-star', 'color: var(--marigold)')}<span class="label">Lv</span><span class="num">${run.level}</span></div>
      <div class="hud-chip" aria-label="Languages found this run">${icon('i-person', 'color: var(--pink)')}<span class="num">${run.found.size}/${total}</span></div>
      <div class="meter${pct < 25 ? ' is-low' : ''}" style="--pct: ${pct}%">${icon('i-clock')}<div class="meter-track" role="meter" aria-label="Station countdown" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${Math.ceil(left)}"><div class="meter-fill" style="--tone: var(--teal)"></div></div><span class="num">${Math.ceil(left)}s</span></div>`;
  }

  function pop(text) {
    if (store.settings.reduced) return;
    const p = board.headScreen(), host = $('#board-wrap').getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'score-pop';
    s.textContent = text;
    s.style.left = `${p.x - host.left}px`; s.style.top = `${p.y - host.top - 18}px`;
    $('#fx').append(s);
    setTimeout(() => s.remove(), 900);
  }

  // ---------- clock ----------
  function startClock() {
    stopClock();
    lastTick = performance.now();
    timerId = setInterval(() => {
      const now = performance.now(), dt = (now - lastTick) / 1000;
      lastTick = now;
      const r = steer.round;
      if (!run || paused || !r || r.done || r.busy) return;
      left -= dt;
      if (left <= 0) { left = limit; steer.timeout(); }
      drawHud();
    }, 100);
  }
  const stopClock = () => { clearInterval(timerId); timerId = 0; };

  // ---------- run flow ----------
  function idleScreen() {
    run = null; stopClock(); clearTimeout(autoId);
    drawHud();
    bubble.innerHTML = 'Ready? You get <b>3 lives</b> and a clock on every station. Each right turn scores; a wrong turn costs a life and shortens me. Press <b>Enter</b> to start.';
    btnNext.hidden = true; btnHint.hidden = true;
    btnRetry.hidden = false; btnRetry.firstChild.textContent = 'Start run ';
    $('#steer-result').innerHTML = '';
    ui.clearNotice('steer');
    board.clearRoute(); board.clearMarks(); board.setExtra(0);
    board.teleport(...board.nodePos(chart.root)); board.here(chart.root); board.setFollow(true);
    panel.clearAll(); panel.setEditable(false);
  }

  function startRun() {
    run = { lives: MAX_LIVES, score: 0, streak: 0, level: 1, rounds: 0, correct: 0, wrong: 0, clean: 0, found: new Set(), used: new Set(), over: false };
    limit = limitFor(1);
    board.setExtra(0);
    btnRetry.hidden = true;
    nextRound();
    startClock();
  }

  function pickSample() {
    let pool = samples.filter((s) => !run.used.has(s.lang));
    if (!pool.length) { run.used.clear(); pool = samples; }
    const s = pool[Math.floor(Math.random() * pool.length)];
    run.used.add(s.lang);
    return s;
  }

  function nextRound() {
    clearTimeout(autoId);
    if (!run || run.over) return;
    btnNext.hidden = true;
    const s = pickSample();
    ctx.autoSampleText = s.text; // picked by the game, so Detect will not reuse it
    panel.setText(s.text);
    steer.start(s.text, { keepSnake: true });
    btnHint.hidden = false;
    limit = limitFor(run.level); left = limit;
    drawHud();
  }

  const hooks = {
    speed: () => 1 + 0.2 * ((run?.level ?? 1) - 1),
    onStation() { left = limit; drawHud(); },
    onCorrect() {
      const gain = 10 * mult() + 2 * Math.floor(left);
      run.score += gain; run.streak++; run.correct++;
      pop(`+${gain}`);
      drawHud();
    },
    onWrong(_step, timedOut) {
      run.lives--; run.streak = 0; run.wrong++; run.clean = 0;
      board.setExtra(board.extra - 3);
      left = limit;
      drawHud();
      if (run.lives <= 0) { run.over = true; setTimeout(gameOver, timedOut ? 900 : 1500); }
    },
    onHint() { run.score = Math.max(0, run.score - 5); pop('−5'); drawHud(); },
    onTerminal(round) {
      run.score += 50; run.rounds++;
      run.found.add(round.route.leaf);
      pop('+50');
      if (!round.hadError) {
        run.clean++;
        if (run.clean % 5 === 0 && run.lives < MAX_LIVES) { run.lives++; ui.toast('Extra life', 'Five clean rounds in a row.'); }
      }
      const lvl = 1 + Math.floor(run.rounds / 3);
      if (lvl > run.level) {
        run.level = lvl;
        ui.burst(`Level ${lvl}`, 'Faster!', 'burst-gold');
        audio.level();
        ui.announce(`Level ${lvl}. Faster.`);
      }
      drawHud();
      btnNext.hidden = false; btnNext.firstChild.textContent = 'Next round ';
      autoId = setTimeout(() => { if (!paused && active) nextRound(); }, 4200);
    },
  };

  // ---------- game over ----------
  const rowsHtml = (hi, mark) => hi.map((s, i) => `<tr${i === mark ? ' aria-current="true"' : ''}><td><span class="rank${i < 3 ? ` rank-${i + 1}` : ''}">${i + 1}</span></td><td>${ui.esc(s.name)}</td><td class="is-num">${s.rounds}</td><td class="is-num">${s.score.toLocaleString('en')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No scores yet.</td></tr>';
  function gameOver() {
    if (!run) return;
    stopClock(); clearTimeout(autoId);
    audio.over();
    const acc = run.correct + run.wrong ? Math.round((100 * run.correct) / (run.correct + run.wrong)) : 0;
    const qualifies = store.qualifies(run.score);
    const flagsHtml = [...run.found].slice(0, 30).map((c) => `<span class="mini-flag" title="${ui.esc(chart.leaves[c].english)}">${ui.flagHtml(c)}</span>`).join('');
    dlgOver.innerHTML = `
      <h2 class="title-card" id="over-title">Game over</h2>
      <div class="hud over-stats">
        <div class="hud-chip">${icon('i-coin')}<span class="label">Score</span><span class="num">${run.score.toLocaleString('en')}</span></div>
        <div class="hud-chip"><span class="label">Rounds</span><span class="num">${run.rounds}</span></div>
        <div class="hud-chip"><span class="label">Accuracy</span><span class="num">${acc}%</span></div>
        <div class="hud-chip"><span class="label">Found</span><span class="num">${run.found.size}/${total}</span></div>
      </div>
      <div class="over-flags">${flagsHtml}</div>
      ${qualifies ? `<form id="over-form" class="over-form"><label class="field"><span class="label">Your initials (3 letters)</span><input class="input initials" name="ini" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AAA" required></label><button class="btn btn-primary" type="submit">Save score</button></form>` : '<p class="muted">Not in the top 10 this time.</p>'}
      <div class="table-shell"><table class="table" id="over-table"><thead><tr><th>Rank</th><th>Player</th><th class="is-num">Rounds</th><th class="is-num">Score</th></tr></thead><tbody>${rowsHtml(store.scores(), -1)}</tbody></table></div>
      <div class="row"><button class="btn btn-primary" type="button" id="over-again">Play again</button><button class="btn btn-quiet" type="button" id="over-close">Close</button></div>`;
    const summary = { score: run.score, rounds: run.rounds };
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
    $('#over-again').onclick = () => { dlgOver.close(); idleScreen(); startRun(); };
    $('#over-close').onclick = () => dlgOver.close();
    ui.open(dlgOver);
    (form ? form.elements.ini : $('#over-again')).focus();
  }
  dlgOver.addEventListener('close', () => { if (active && run?.over) idleScreen(); });

  // ---------- pause ----------
  function pause() {
    if (!run || run.over || paused || dlgMenu.open) return;
    paused = true;
    ui.openMenu('pause', () => { paused = false; lastTick = performance.now(); });
  }
  for (const b of document.querySelectorAll('[data-menu]')) {
    b.addEventListener('click', () => {
      const act = b.dataset.menu;
      if (act === 'resume') dlgMenu.close();
      else if (act === 'options') { ctx.menuReturn = true; $('#menu-pause').hidden = true; $('#menu-options').hidden = false; $('#opt-sound').focus(); }
      else if (act === 'quit') { dlgMenu.close(); quit(); }
    });
  }
  function quit() { if (!run) return; run.over = true; steer.exit(); steer.enter(); idleScreen(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) pause(); });

  btnRetry.addEventListener('click', () => { if (active) startRun(); });
  btnNext.addEventListener('click', () => { if (active && run) nextRound(); });

  return {
    enter() {
      active = true;
      steer.setArcade(hooks);
      steer.enter();
      hud.hidden = false;
      idleScreen();
    },
    exit() {
      active = false; paused = false; stopClock(); clearTimeout(autoId);
      run = null; steer.exit(); steer.setArcade(null);
      hud.hidden = true; hud.innerHTML = '';
      panel.setEditable(true);
    },
    onText() {},
    key(e) {
      if (e.key === ' ' || e.key === 'Escape') { pause(); return true; }
      if (e.key === 'Enter') {
        if (!run) { startRun(); return true; }
        if (steer.round?.done) { nextRound(); return true; }
      }
      return run ? steer.key(e) : false;
    },
    pause,
    get running() { return !!run && !run.over; },
  };
}
