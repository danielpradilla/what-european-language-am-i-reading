// Language model: Naive Bayes over in-word character 1-4-grams, and the yes/no questions that narrow it down (SPEC 6.4, 16.3).
// Feature extraction must stay identical to grams() in tools/build_model.py.
// Python's str.isdigit(): Nd plus the superscript, subscript and circled digits.
const WORD_GRAM = /[\p{L}\p{N}_]/u, DIGIT = /[\p{Nd}\u00B2\u00B3\u00B9\u1369-\u1371\u19DA\u2070\u2074-\u2079\u2080-\u2089\u2460-\u2468\u2474-\u247C\u2488-\u2490\u24EA\u24F5-\u24FD\u24FF\u2776-\u277E\u2780-\u2788\u278A-\u2792\u{10A40}-\u{10A43}\u{10E60}-\u{10E68}\u{11052}-\u{1105A}\u{1F100}-\u{1F10A}]/u;
const SOFTMAX = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };

export const MAX_QUESTIONS = 12, STOP_AT = 0.97, RULED_OUT = 0.01;

/** Readable form of a gram: spaces are word edges. */
// Name the script when a gram is not Latin, so «а» (Cyrillic) is not read as the Latin «a».
const SCRIPTS = [['Greek', /\p{Script=Greek}/u], ['Cyrillic', /\p{Script=Cyrillic}/u], ['Armenian', /\p{Script=Armenian}/u], ['Georgian', /\p{Script=Georgian}/u], ['Hebrew', /\p{Script=Hebrew}/u]];
export function describe(g) {
  const core = g.trim();
  const script = SCRIPTS.find(([, re]) => re.test(core))?.[0];
  const q = script ? `${script} «${core}»` : `«${core}»`;
  const a = g.startsWith(' '), b = g.endsWith(' ');
  if (a && b) return `the word ${q}`;
  if (a) return `a word starting with ${q}`;
  if (b) return `a word ending in ${q}`;
  return `${q} inside a word`;
}

/** Hits of a gram in the original text (UTF-16 offsets): case-insensitive, word edges are whitespace or the text's ends. */
export function occurrences(text, gram) {
  const core = gram.trim();
  if (!core) return [];
  const esc = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${gram.startsWith(' ') ? '(?<!\\S)' : ''}(?=(${esc})${gram.endsWith(' ') ? '(?!\\S)' : ''})`, 'giu');
  const out = [];
  for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[1].length }); // lookahead: overlapping hits count, as in the model
  return out;
}

export function createModel(m) {
  const { langs, grams: gramList, lo, hi } = m;
  const L = langs.length, F = gramList.length, W = F + 1;
  const w8 = Uint8Array.from(atob(m.weights), (c) => c.charCodeAt(0));
  const logt = new Float32Array(L * W);
  for (let i = 0; i < logt.length; i++) logt[i] = lo + (w8[i] / 255) * (hi - lo);
  const index = new Map(gramList.map((g, i) => [g, i]));

  /** Counts of the list's grams (v), of every other kept gram (other), and their total (grams). */
  function featurize(text) {
    const v = new Int32Array(F);
    let other = 0, grams = 0;
    for (const w of text.toLowerCase().normalize('NFC').split(/\s+/)) {
      if (!w) continue;
      const cps = [...` ${w} `];
      for (let n = 1; n <= 4; n++) {
        for (let i = 0; i + n <= cps.length; i++) {
          const g = cps.slice(i, i + n).join('');
          if (g.trim() === '' || !WORD_GRAM.test(g) || DIGIT.test(g)) continue;
          grams++;
          const k = index.get(g);
          if (k === undefined) other++; else v[k]++;
        }
      }
    }
    return { v, other, grams };
  }

  const scoreOf = ({ v, other }) => {
    const s = new Array(L);
    for (let l = 0; l < L; l++) {
      const row = l * W;
      let t = other * logt[row + F];
      for (let f = 0; f < F; f++) if (v[f]) t += v[f] * logt[row + f];
      s[l] = t;
    }
    return s;
  };

  /** Full verdict: every language with its posterior, best first. */
  function verdict(text) {
    const x = featurize(text);
    if (!x.grams) return { ranking: [], grams: 0 };
    const score = scoreOf(x);
    const p = SOFTMAX(score);
    const ranking = langs.map((lang, i) => ({ lang, p: p[i], score: score[i] })).sort((a, b) => b.p - a.p);
    return { ranking, grams: x.grams };
  }

  const H = (p) => { let h = 0; for (const x of p) { const c = Math.min(Math.max(x, 1e-12), 1); h -= c * Math.log(c); } return h; };

  /** The yes/no questions the model would ask about this text, one step each. */
  function questions(text) {
    const x = featurize(text);
    const N = x.grams;
    if (!N) return [];
    // P(gram present | language, N grams), stored gram-major so one gram's languages sit together
    const pp = new Float32Array(F * L);
    for (let l = 0; l < L; l++) for (let f = 0; f < F; f++) pp[f * L + l] = 1 - Math.pow(1 - Math.min(Math.exp(logt[l * W + f]), 0.999), N);
    let post = new Array(L).fill(1 / L);
    const asked = [], askedSet = new Set(), steps = [];
    const py = new Float64Array(L), pn = new Float64Array(L);
    for (let q = 0; q < MAX_QUESTIONS; q++) {
      if (Math.max(...post) >= STOP_AT) break;
      const h0 = H(post);
      let best = -1, bestGain = -Infinity;
      for (let f = 0; f < F; f++) {
        if (askedSet.has(f)) continue;
        let sy = 0, sn = 0;
        for (let l = 0; l < L; l++) { const p = pp[f * L + l]; py[l] = post[l] * p; pn[l] = post[l] * (1 - p); sy += py[l]; sn += pn[l]; }
        let hy = 0, hn = 0;
        const dy = Math.max(sy, 1e-12), dn = Math.max(sn, 1e-12);
        for (let l = 0; l < L; l++) {
          const a = Math.min(Math.max(py[l] / dy, 1e-12), 1), b = Math.min(Math.max(pn[l] / dn, 1e-12), 1);
          hy -= a * Math.log(a); hn -= b * Math.log(b);
        }
        const gain = h0 - (sy * hy + sn * hn);
        if (gain > bestGain) { bestGain = gain; best = f; }
      }
      asked.push(best); askedSet.add(best);
      // posterior = Naive Bayes on the asked grams' counts plus one "everything else" bucket
      let seen = 0;
      for (const f of asked) seen += x.v[f];
      const lp = new Array(L);
      for (let l = 0; l < L; l++) {
        let mass = 0, t = 0;
        for (const f of asked) { const lt = logt[l * W + f]; mass += Math.exp(lt); t += x.v[f] * lt; }
        lp[l] = t + Math.log(Math.max(1 - mass, 1e-12)) * (N - seen);
      }
      post = SOFTMAX(lp);
      // Guess Who: a language that has been ruled out stays out, so the count of languages left only goes down.
      const prev = steps.at(-1)?.alive;
      const alive = new Set();
      let top = 0;
      post.forEach((p, l) => { if (p >= RULED_OUT && (!prev || prev.has(langs[l]))) alive.add(langs[l]); if (p > post[top]) top = l; });
      if (!alive.size) alive.add(langs[top]);
      steps.push({ gram: gramList[best], count: x.v[best], alive, left: alive.size, top: { lang: langs[top], p: post[top] } });
    }
    return steps;
  }

  return { langs, grams: () => gramList, featurize, verdict, questions, occurrences, describe };
}

export async function loadModel(url) {
  return createModel(await fetch(url).then((r) => r.json()));
}
