import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeLabels, wrapLabel, hit } from '../src/europe/layout.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const europe = read('../src/data/europe.json');
const chart = read('../src/data/chart.json');
const flags = read('../assets/flags/flags.json');
const samples = read('../data/samples.json');

test('every chart language is a station with a flag, and every station is on a line or single', () => {
  assert.deepEqual(Object.keys(europe.stations).sort(), Object.keys(chart.leaves).sort());
  for (const [c, s] of Object.entries(europe.stations)) {
    assert.ok(flags.leaves[c], c);
    assert.ok(s.line === null || europe.lines[s.line], c);
  }
  for (const s of samples) assert.ok(europe.stations[s.lang], s.lang);
});

test('segments join stations of one line; transfers join different lines or singles', () => {
  for (const s of europe.segments) {
    assert.equal(europe.stations[s.from].line, s.line);
    assert.equal(europe.stations[s.to].line, s.line);
  }
  for (const [a, b] of europe.transfers) assert.notEqual(europe.stations[a].line ?? a, europe.stations[b].line ?? b);
});

test('wrapLabel breaks long labels', () => {
  assert.deepEqual(wrapLabel('bosanski/hrvatski/srpski/crnogorski'), ['bosanski/hrvatski/', 'srpski/crnogorski']);
  assert.deepEqual(wrapLabel('česky'), ['česky']);
});

test('placeLabels keeps two crowded labels apart', () => {
  const items = [{ id: 'a', cx: 100, cy: 100, w: 60, h: 13 }, { id: 'b', cx: 150, cy: 100, w: 60, h: 13 }];
  const fixed = items.map((i) => ({ x: i.cx - 15, y: i.cy - 15, w: 30, h: 30 }));
  const p = placeLabels({ items, fixed, pts: [], bounds: { w: 400, h: 300 }, half: 13 });
  assert.ok(!hit(p.a, p.b));
  assert.ok(!p.a.overlaps && !p.b.overlaps);
});
