import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeLabels, wrapLabel, hit } from '../src/europe/layout.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const europe = read('../src/data/europe.json');
const chart = read('../src/data/chart.json');
const flags = read('../assets/flags/flags.json');
const samples = read('../data/samples.json');
const extra = read('../src/data/extra.json').leaves;
const existsSync = (p) => { try { readFileSync(new URL(p, import.meta.url)); return true; } catch { return false; } };
const euSamples = existsSync('../data/europe-samples.json') ? read('../data/europe-samples.json') : [];

const metro = Object.entries(europe.stations).filter(([, s]) => !s.bus).map(([c]) => c);

test('every chart language is a metro station with a flag, and every metro station is on a line or single', () => {
  assert.deepEqual(metro.sort(), Object.keys(chart.leaves).sort());
  for (const c of metro) {
    const s = europe.stations[c];
    assert.ok(flags.leaves[c], c);
    assert.ok(s.line === null || europe.lines[s.line], c);
  }
  for (const s of samples) assert.ok(europe.stations[s.lang], s.lang);
});

test('every regional language is a bus stop on a route that starts at a metro station', () => {
  assert.deepEqual(Object.keys(extra).sort(), Object.keys(europe.stations).filter((c) => europe.stations[c].bus).sort());
  for (const [c, l] of Object.entries(extra)) {
    const s = europe.stations[c];
    assert.ok(!chart.leaves[c] && flags.leaves[c], c);
    assert.ok(europe.buses[s.bus], c);
    assert.equal(s.line, undefined, c);
    assert.ok(s.latlon && s.at, c);
    assert.ok(europe.stations[l.parent] && !europe.stations[l.parent].bus, `${c}: parent ${l.parent}`);
  }
  for (const [id, b] of Object.entries(europe.buses)) {
    assert.ok(europe.lines[b.line], id);
    const stops = new Set(b.segments.flatMap((g) => [g.from, g.to]));
    for (const g of b.segments) assert.deepEqual([g.pts[0], g.pts.at(-1)], [europe.stations[g.from].at, europe.stations[g.to].at], `${id} ${g.from}-${g.to} runs between its stops`);
    const ends = [...stops].filter((c) => !europe.stations[c].bus);
    assert.ok(ends.length >= 1 && ends.length <= 2, id);
    for (const c of stops) if (europe.stations[c].bus) assert.equal(europe.stations[c].bus, id, c);
    // every bus stop is reached from a metro station along the route
    const seen = new Set([ends[0]]);
    for (let grew = true; grew;) { grew = false; for (const g of b.segments) for (const [a, z] of [[g.from, g.to], [g.to, g.from]]) if (seen.has(a) && !seen.has(z)) { seen.add(z); grew = true; } }
    assert.equal(seen.size, stops.size, id);
  }
  const at = Object.values(europe.stations).map((s) => s.at.join());
  assert.equal(new Set(at).size, at.length, 'two stations on one grid point');
});

test('every Europe sample is a station, and every bus language has one', () => {
  for (const s of euSamples) assert.ok(europe.stations[s.lang], s.lang);
  assert.deepEqual([...new Set(euSamples.map((s) => s.lang))].sort(), Object.keys(extra).sort());
  assert.ok(euSamples.every((s) => s.text.length >= 150 && s.text.length <= 400 && s.source && s.license), 'sample shape');
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
