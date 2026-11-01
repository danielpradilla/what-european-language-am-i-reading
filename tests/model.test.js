import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createModel, occurrences, describe } from '../src/model.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const model = createModel(read('../src/data/model.json'));
const fixture = read('./model-fixture.json');
const samples = read('../data/samples.json');
const euSamples = read('../data/europe-samples.json');

test('JS features and scores match the Python model on the fixture', () => {
  assert.equal(fixture.length, 30);
  for (const f of fixture) {
    const v = model.verdict(f.text);
    assert.equal(v.grams, f.grams, f.text);
    assert.equal(v.ranking[0].lang, f.top, f.text);
    assert.ok(Math.abs(v.ranking[0].score - f.score) <= 0.01, `${f.text}: ${v.ranking[0].score} vs ${f.score}`);
  }
});

test('at least 90 of the 97 samples are identified', () => {
  const ok = samples.filter((s) => model.verdict(s.text).ranking[0].lang === s.lang).length;
  console.log(`samples identified: ${ok}/${samples.length}`);
  assert.equal(samples.length, 97);
  assert.ok(ok >= 90, String(ok));
});

test('every Europe sample (regional languages) is identified as its own language', () => {
  assert.equal(euSamples.length, 32);
  for (const s of euSamples) assert.equal(model.verdict(s.text).ranking[0].lang, s.lang, s.lang);
});

test('verdict `only` restricts the ranking to the allowed languages and renormalises', () => {
  const text = 'el gat es a la casa i no vol menjar res perquè no té gana';
  const only = new Set(['spa', 'ita', 'fra', 'por']);
  const all = model.verdict(text), some = model.verdict(text, { only });
  assert.equal(some.grams, all.grams);
  assert.equal(some.ranking.length, 4);
  assert.ok(some.ranking.every((r) => only.has(r.lang)));
  assert.ok(Math.abs(some.ranking.reduce((a, r) => a + r.p, 0) - 1) < 1e-9);
  assert.ok(some.ranking.every((r, i) => i === 0 || some.ranking[i - 1].p >= r.p));
  assert.deepEqual(model.verdict('123 !!', { only }).ranking, []);
});

test('questions narrow the languages down and the asked grams are real', () => {
  const text = '¿hola cómo estás? yo estoy bien ¿y tú? bien espero que sí y que todo vaya bien';
  const steps = model.questions(text);
  assert.ok(steps.length > 0 && steps.length <= 12);
  const grams = new Set(model.grams());
  for (const s of steps) {
    assert.ok(grams.has(s.gram));
    assert.equal(s.left, s.alive.size);
    if (!s.gram.includes(' ')) assert.equal(occurrences(text, s.gram).length >= 1, s.count > 0, s.gram);
  }
  assert.equal(steps.at(-1).top.lang, 'spa');
  assert.deepEqual(model.questions(''), []);
  assert.deepEqual(model.verdict('123 !!').ranking, []);
});

test('clues favour the winner over the chart language and occur in the text', () => {
  const text = '¿hola cómo estás? yo estoy bien ¿y tú? bien espero que sí y que todo vaya bien';
  const cl = model.clues(text, 'spa', 'ita');
  assert.ok(cl.length > 0 && cl.length <= 5);
  assert.ok(cl.every((c, i) => c.weight > 0 && (i === 0 || cl[i - 1].weight >= c.weight)));
  assert.ok(cl.some((c) => occurrences(text, c.gram).length > 0));
  assert.deepEqual(model.clues(text, 'spa', 'zzz'), []);
});

test('occurrences respect word edges and ignore case', () => {
  assert.deepEqual(occurrences('El gato. el perro, EL', ' el '), [{ start: 0, end: 2 }, { start: 9, end: 11 }, { start: 19, end: 21 }]);
  assert.deepEqual(occurrences('quien aqui', ' qu'), [{ start: 0, end: 2 }]);
  assert.deepEqual(occurrences('nación acción', 'ión '), [{ start: 3, end: 6 }, { start: 10, end: 13 }]);
  assert.equal(occurrences('aaa', 'aa').length, 2);
  assert.equal(describe(' el '), 'the word «el»');
  assert.equal(describe(' qu'), 'a word starting with «qu»');
  assert.equal(describe('ión '), 'a word ending in «ión»');
});
