// Detect on the Europe map: the same text panel, and the poster's route replayed as languages fading out (SPEC 16.3).
export function createDetect(ctx, replay) {
  const { engine, panel, ui } = ctx;
  const $ = (s) => document.querySelector(s);
  const list = $('#route-list');
  let active = false;
  let route = null;

  function paintText() {
    panel.clearAll();
    if (!route?.leaf) return;
    panel.setHighlight('hl-y', route.steps.filter((s) => s.answer).flatMap((s) => s.hits));
    panel.setBadges(route.steps.map((s, i) => (s.answer ? { n: i + 1, offset: s.hits[0].start } : null)).filter(Boolean));
  }
  function focusStep(i) {
    list.querySelectorAll('.step').forEach((b) => b.classList.toggle('is-focus', Number(b.dataset.i) === i));
    const s = route?.steps[i];
    if (s?.answer) { panel.setHighlight('hl-focus', s.hits); panel.scrollTo(s.hits[0].start); } else panel.clearHighlight('hl-focus');
  }
  list.addEventListener('pointerover', (e) => { const b = e.target.closest('.step'); if (active && b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('focusin', (e) => { const b = e.target.closest('.step'); if (active && b) focusStep(Number(b.dataset.i)); });
  list.addEventListener('pointerleave', () => active && focusStep(-1));

  function reset() { route = null; replay.reset(); paintText(); }

  function onText(text, info = {}) {
    if (!active) return;
    ui.clearNotice('empty'); ui.clearNotice('scripts');
    if (ctx.isUrl(text)) { reset(); ui.notice('empty', 'info', 'That looks like a web address', 'Press Enter or the button to fetch its text.'); return; }
    route = engine.route(text);
    if (!route.leaf) {
      reset();
      if (text.trim()) ui.notice('empty', 'info', 'No letters to follow', 'Digits and punctuation do not say anything about a language.');
      else ui.notice('empty', 'info', 'Nothing to read yet', 'Type, paste text or a web address, or try a sample.');
      return;
    }
    if (!route.european) ui.notice('scripts', 'warning', 'This chart only covers European alphabets.', 'The route below is where the chart sends it anyway.');
    replay.renderList(route, text);
    paintText();
    if (info.user) replay.showEnd(); else replay.play();
  }

  return {
    enter() {
      active = true;
      panel.setEditable(true);
      // Detect waits for the player: a sample another mode loaded on its own is not carried over.
      if (ctx.autoSampleText && panel.text() === ctx.autoSampleText) { ctx.autoSampleText = null; panel.setText(''); }
      else onText(panel.text(), {});
    },
    exit() {
      active = false;
      reset(); panel.clearAll();
      ui.clearNotice('scripts'); ui.clearNotice('empty');
    },
    onText,
    key(e) {
      if (e.key === 'Enter' && route?.leaf) { replay.play(); return true; }
      return false;
    },
    onStation(c) { if (c) ctx.openCard(c); },
  };
}
