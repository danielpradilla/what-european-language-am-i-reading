import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, lineCol } from '../src/engine.js';

const chart = JSON.parse(readFileSync(new URL('../src/data/chart.json', import.meta.url)));
const samples = JSON.parse(readFileSync(new URL('../data/samples.json', import.meta.url)));
const E = createEngine(chart);
const leafOf = (t) => E.route(t).leaf;

test('chart is a tree rooted at F G R with 106 terminals; only rmy has two parents', () => {
  const ids = Object.keys(chart.stations);
  assert.equal(ids.length, 106);
  assert.equal(Object.keys(chart.leaves).length, 106);
  for (const id of ids) {
    if (id === 'fgr') assert.equal(E.parents[id], undefined);
    else assert.equal(E.parents[id]?.length, 1, id);
  }
  for (const code of Object.keys(chart.leaves)) {
    assert.equal(E.parents[`L:${code}`].length, code === 'rmy' ? 2 : 1, code);
  }
});

test('every edge path starts at its station and ends at its target', () => {
  for (const e of chart.edges) {
    const from = chart.stations[e.from].at;
    const to = e.to.startsWith('L:') ? chart.leaves[e.to.slice(2)].at : chart.stations[e.to].at;
    const [a, b] = [e.path[0], e.path.at(-1)];
    assert.ok(Math.hypot(a[0] - from[0], a[1] - from[1]) < 30, `${e.from} start`);
    assert.ok(Math.hypot(b[0] - to[0], b[1] - to[1]) < 40, `${e.from}->${e.to} end`);
    for (let i = 1; i < e.path.length; i++) {
      const [p, q] = [e.path[i - 1], e.path[i]];
      assert.ok(p[0] === q[0] || p[1] === q[1], `${e.from} segment ${i} is not orthogonal`);
    }
  }
});

test('every terminal is reachable from its minimal text', () => {
  for (const code of Object.keys(chart.leaves)) assert.equal(leafOf(E.minimalText(code)), code, code);
});

test('both routes to Romani (other spellings) work', () => {
  assert.equal(leafOf('r ćh'), 'rmy');
  assert.equal(leafOf('r chh'), 'rmy');
});

test('matching follows the strict rules', () => {
  // Decomposed input matches; r does not match a decomposed ř.
  assert.equal(leafOf('Příliš'.normalize('NFD') + ' g'), leafOf('Příliš g'));
  assert.equal(E.route('ř'.normalize('NFD')).steps[0].answer, false);
  // ş (cedilla) is not ș (comma below).
  assert.equal(leafOf('r ç ș'), 'fur');
  assert.equal(leafOf('r ç ş'), 'gag');
  // Latin i is not Cyrillic і.
  assert.notEqual(leafOf('бi'), 'kpv');
  assert.equal(leafOf('бі'), 'kpv');
  // Variants: apostrophes in c'h, middle dot forms, both palochka code points.
  for (const v of ["c'h", 'c’h', 'cʼh']) assert.equal(leafOf(`r ${v}`), 'bre', v);
  for (const v of ['l·l', 'l‧l', 'ŀl']) assert.equal(leafOf(`r ç é ${v}`), 'cat', v);
  assert.equal(leafOf('гӏ яь оь'), 'che');
  assert.equal(leafOf('гӀ яь оь'), 'che');
  // Case-insensitive.
  assert.equal(leafOf('R Č'), leafOf('r č'));
});

test('text without letters has no route; non-European scripts end at Bulgarian with a flag', () => {
  assert.deepEqual(E.route('123 !?').steps, []);
  const r = E.route('今日はいい天気ですね');
  assert.equal(r.leaf, 'bul');
  assert.equal(r.european, false);
});

test('hit offsets are UTF-16 offsets into the original text', () => {
  const text = '😀 Grip\n😀 čeřeka';
  const steps = E.route(text).steps;
  assert.deepEqual(steps[0].hits.map((h) => text.slice(h.start, h.end)), ['G', 'r']);
  const caron = steps.find((s) => s.station === 'c_caron');
  assert.equal(text.slice(caron.hits[0].start, caron.hits[0].end), 'č');
  assert.deepEqual(lineCol(text, caron.hits[0].start), { line: 2, col: 3 });
});

test('Greek letters followed by ι still match (no /i flag folding of combining marks)', () => {
  assert.equal(E.route('μισακό').steps[1].answer, true);
});

test('diverge finds the first disagreement with a language route', () => {
  const { steps } = E.route('r č ě ř'); // ends at Lower Sorbian (no ů)
  const d = E.diverge(steps, 'ces');
  assert.equal(steps[d.index].station, 'u_ring');
  assert.equal(d.path[d.index].answer, true);
});

test('every sample routes to its language', () => {
  for (const s of samples) assert.equal(leafOf(s.text), s.lang, s.lang);
});
