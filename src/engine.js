// Rule engine for the "Which European language am I reading?" chart (SPEC.md section 3).
// Pure module: no DOM. Works in browsers and in Node (tests).

// The only folding the app allows (SPEC 3.3): apostrophe variants, the Catalan middle dot,
// and both palochka code points.
const VARIANTS = { "c'h": "[cC]['’ʼ][hH]", 'l·l': '[lL][·‧][lL]|[ŀĿ][lL]' };
const PALOCHKA = '[ӏӀ]';
const MAX_HITS = 5000; // per step; more is never shown and slows highlighting

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function charClass(ch) {
  if (ch === 'ӏ') return PALOCHKA;
  const forms = new Set([ch, ch.toLowerCase(), ch.toUpperCase()].filter((f) => [...f].length === 1));
  if (ch === 'ß') forms.add('ẞ');
  return forms.size === 1 ? escape(ch) : `[${[...forms].map(escape).join('')}]`;
}

function sequencePattern(seq) {
  // Whole letters only: a match must not be followed by a combining mark, so `r` never matches the base of a decomposed `ř`.
  // Case is expanded per character instead of using the `i` flag: under /iu, \p{M} also matches ι (U+0345 folds to it),
  // which would reject every Greek letter followed by ι.
  if (VARIANTS[seq]) return `(?:${VARIANTS[seq]})(?!\\p{M})`;
  const forms = new Set([seq.normalize('NFC'), seq.normalize('NFD')]);
  const alts = [...forms].map((f) => [...f].map(charClass).join(''));
  return `(?:${alts.join('|')})(?!\\p{M})`;
}

const HAS_LETTER = /\p{L}/u;
const EUROPEAN_SCRIPT = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Hebrew}]/u;

export function createEngine(chart) {
  const { stations, leaves, root } = chart;
  const regex = {};
  for (const [id, s] of Object.entries(stations)) {
    regex[id] = new RegExp(s.test.map(sequencePattern).join('|'), 'gu');
  }

  // parents[target] = [{ station, answer }]; `rmy` has two.
  const parents = {};
  for (const [id, s] of Object.entries(stations)) {
    for (const [answer, target] of [[true, s.yes], [false, s.no]]) {
      (parents[target] ??= []).push({ station: id, answer });
    }
  }

  const testOf = (id) => stations[id].test;

  function hitsFor(id, text) {
    const re = regex[id];
    re.lastIndex = 0;
    const hits = [];
    let count = 0;
    for (const m of text.matchAll(re)) {
      count++;
      if (hits.length < MAX_HITS) hits.push({ start: m.index, end: m.index + m[0].length, seq: m[0] });
    }
    return { hits, count };
  }

  /** Route a text through the chart. leaf is null for text without letters. */
  function route(text) {
    if (!HAS_LETTER.test(text)) return { steps: [], leaf: null, european: false };
    const steps = [];
    let id = root;
    while (!id.startsWith('L:')) {
      const { hits, count } = hitsFor(id, text);
      const answer = count > 0;
      steps.push({ station: id, answer, hits, count });
      id = answer ? stations[id].yes : stations[id].no;
    }
    return { steps, leaf: id.slice(2), european: EUROPEAN_SCRIPT.test(text) };
  }

  /** Every route from the root to a node key (station id, or `L:<code>` for a terminal): arrays of { station, answer }. */
  function pathsToNode(key) {
    if (key === root) return [[]];
    return (parents[key] ?? []).flatMap(({ station, answer }) =>
      pathsToNode(station).map((p) => [...p, { station, answer }]));
  }
  // Leaf codes and station ids overlap (`eng` is English and the ŋ station), so terminals are always prefixed.
  const pathsTo = (leaf) => pathsToNode(`L:${leaf}`);

  /** Index of the first step where `steps` leaves the route to `leaf` (closest route if two), and that route. */
  function diverge(steps, leaf) {
    let best = null;
    for (const path of pathsTo(leaf)) {
      let i = 0;
      while (i < path.length && i < steps.length && path[i].station === steps[i].station && path[i].answer === steps[i].answer) i++;
      if (!best || i > best.index) best = { index: i, path };
    }
    return best;
  }

  /** Shortest text that reaches a leaf: the first sequence of every Y station on its route. */
  function minimalText(leaf) {
    const path = pathsTo(leaf)[0];
    const parts = path.filter((p) => p.answer).map((p) => testOf(p.station)[0]);
    if (!path[0].answer) parts.push('б'); // N at F G R: needs a letter that is not f, g or r
    return parts.join(' ');
  }

  /** Leaves reachable below a station (memoised). */
  const reachCache = {};
  function reachable(target) {
    if (target.startsWith('L:')) return [target.slice(2)];
    if (reachCache[target]) return reachCache[target];
    const s = stations[target];
    return (reachCache[target] = [...new Set([...reachable(s.yes), ...reachable(s.no)])]);
  }

  return { route, pathsTo, diverge, minimalText, reachable, testOf, stations, leaves, root, parents };
}

/** "U+010D" style code points for a sequence. */
export const codePoints = (s) => [...s].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');

/** 1-based line and column of a UTF-16 offset. */
export function lineCol(text, offset) {
  let line = 1, last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) { line++; last = i; }
  return { line, col: [...text.slice(last + 1, offset)].length + 1 };
}
