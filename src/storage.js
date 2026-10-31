// localStorage wrapper: collection, settings, high scores. Never throws (private mode, full disk).
const K = { coll: 'wela.collection', set: 'wela.settings', hi: 'wela.scores' };

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep playing */ }
};

export function createStore() {
  let collection = read(K.coll, {});
  const settings = {
    sound: true,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    shake: true,
    ...read(K.set, {}),
  };
  let scores = read(K.hi, []);
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f());

  return {
    settings,
    onChange: (f) => listeners.add(f),
    set(key, value) { settings[key] = value; write(K.set, settings); emit(); },

    collection: () => collection,
    count: () => Object.keys(collection).length,
    /** Returns true when the language is new to the collection. */
    collect(code) {
      if (collection[code]) return false;
      collection[code] = new Date().toISOString().slice(0, 10);
      write(K.coll, collection);
      emit();
      return true;
    },
    resetCollection() { collection = {}; write(K.coll, collection); emit(); },

    scores: () => scores,
    qualifies: (score) => score > 0 && (scores.length < 10 || score > scores[scores.length - 1].score),
    /** Insert a score and return its rank index in the top 10 (or -1). */
    addScore(entry) {
      scores = [...scores, entry].sort((a, b) => b.score - a.score).slice(0, 10);
      write(K.hi, scores);
      return scores.indexOf(entry);
    },
  };
}
