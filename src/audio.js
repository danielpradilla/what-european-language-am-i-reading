// WebAudio square-wave sounds, generated in code. Starts only after the first user gesture.
export function createAudio(store) {
  let ctx = null;
  let master = null;
  const unlock = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.06;
    master.connect(ctx.destination);
  };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { passive: true });

  /** notes: [[hz, ms], ...] played back to back */
  function play(notes, { type = 'square', gap = 0 } = {}) {
    if (!ctx || !store.settings.sound) return;
    let t = ctx.currentTime;
    for (const [hz, ms] of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = hz;
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + ms / 1000 + 0.02);
      t += ms / 1000 + gap;
    }
  }

  return {
    tick: () => play([[740, 18]]),
    good: () => play([[523, 70], [659, 70], [784, 110]]),
    bad: () => play([[110, 120], [82, 200]], { type: 'sawtooth' }),
    fanfare: () => play([[523, 90], [523, 90], [523, 90], [659, 140], [587, 90], [659, 90], [784, 260]], { gap: 0.01 }),
    level: () => play([[392, 80], [523, 80], [659, 80], [784, 80], [1046, 200]]),
    over: () => play([[392, 160], [330, 160], [262, 160], [196, 420]]),
    click: () => play([[880, 30]]),
  };
}
