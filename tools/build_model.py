"""Build the browser language model: multinomial Naive Bayes over in-word character 1-4-grams.
Usage: python tools/build_model.py eval   CORPUS_DIR  -> 70/30 split, reports accuracy (float and quantized)
       python tools/build_model.py export CORPUS_DIR  -> trains on everything and writes src/data/model.json
CORPUS_DIR holds one LANG.txt per language (LANG = chart leaf code), one article or text per line.
Needs numpy. The feature extraction in grams() must stay identical to featurize() in src/model.js."""
import os, re, sys, json, base64, math, random, unicodedata
from collections import Counter
import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PER_LANG, GLOBAL = 40, 4000   # clues kept per language; size of the shared gram list
LO, HI = -16.0, 0.0           # log-probability range of the uint8 weights
SPLIT = re.compile(r'(?<=[.!?։])\s+')
LETTER = re.compile(r'\w', re.U)

random.seed(1)

def grams(text, nmax=4):
    """Counter of the 1..4-grams inside words; each word is padded with one space on both sides."""
    t = unicodedata.normalize('NFC', text.lower())
    out = Counter()
    for w in t.split():
        cps = list(f' {w} ')
        for n in range(1, nmax + 1):
            for i in range(len(cps) - n + 1):
                g = ''.join(cps[i:i + n])
                if g.strip() and LETTER.search(g) and not any(ch.isdigit() for ch in g): out[g] += 1
    return out

def snippets(texts, lo, hi, n):
    """Up to n test snippets of lo..1.5*hi characters made of whole sentences."""
    sents = [s for t in texts for s in SPLIT.split(t) if len(s) >= 20]
    out, i = [], 0
    while i < len(sents) and len(out) < n:
        s, j = '', i
        while j < len(sents) and len(s) < lo: s = (s + ' ' + sents[j]).strip(); j += 1
        if lo <= len(s) <= hi * 1.5: out.append(s)
        i = j
    return out

def read_corpus(c):
    return {f[:-4]: [l for l in open(f'{c}/{f}', encoding='utf-8').read().split('\n') if l.strip()]
            for f in sorted(os.listdir(c)) if f.endswith('.txt')}

def split_corpus(c):
    train, test = {}, {}
    for lang, arts in read_corpus(c).items():
        random.shuffle(arts)
        k = max(1, int(len(arts) * 0.7))
        train[lang], test[lang] = arts[:k], arts[k:] or arts[:1]
    return train, test

def featurize(text, vi):
    v = np.zeros(len(vi) + 1)
    for g, k in grams(text).items():
        v[vi[g] if g in vi else -1] += k
    return v

def counts_of(train):
    out = {}
    for l, arts in train.items():
        c = Counter()
        for t in arts: c.update(grams(t))
        out[l] = c
    return out

def fit(counts):
    langs = sorted(counts)
    tot = Counter()
    for l in langs: tot.update(counts[l])
    T = sum(tot.values())
    score = {}
    per = []
    for l in langs:
        n = sum(counts[l].values()) or 1
        best = []
        for g, c in counts[l].most_common(3000):
            p = c / n
            q = (tot[g] - c + 1) / (T - n + 1)
            s = p * math.log(p / q)
            score[g] = max(score.get(g, -1e9), s)
            best.append((s, g))
        per += [g for _, g in sorted(best, reverse=True)[:PER_LANG]]  # every language keeps its own clues
    vocab = list(dict.fromkeys(per))
    for g, _ in sorted(score.items(), key=lambda kv: -kv[1]):
        if len(vocab) >= GLOBAL: break
        if g not in vocab: vocab.append(g)
    vi = {g: i for i, g in enumerate(vocab)}
    logt = np.zeros((len(langs), len(vocab) + 1))
    for a, l in enumerate(langs):
        n = sum(counts[l].values())
        row = np.array([counts[l][g] for g in vocab], float) + 0.05
        other = max(n - (row - 0.05).sum(), 0) + 0.05
        t = np.append(row, other); t /= t.sum()
        logt[a] = np.log(t)
    return langs, vocab, vi, logt

def quantize(logt):
    q = np.clip(np.round((np.clip(logt, LO, HI) - LO) / (HI - LO) * 255), 0, 255).astype(np.uint8)
    return q, q.astype(float) / 255 * (HI - LO) + LO

def evaluate(langs, vi, logt, test, label):
    for name, (lo, hi) in {'sentence': (40, 140), 'paragraph': (250, 450)}.items():
        ok = n = 0; per = Counter(); pern = Counter()
        for l in langs:
            for s in snippets(test[l], lo, hi, 15):
                v = featurize(s, vi); p = langs[int(np.argmax(logt @ v))]
                ok += p == l; n += 1; per[l] += p == l; pern[l] += 1
        worst = sorted(((per[l] / pern[l], l) for l in pern), key=lambda x: x[0])[:12]
        print(f'{label} {name}: {100*ok/n:.1f}% of {n}; weakest:', ' '.join(f'{l}:{100*a:.0f}%' for a, l in worst), flush=True)

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('eval', 'export'): sys.exit(__doc__)
    cmd, corpus = sys.argv[1:]
    if cmd == 'eval':
        train, test = split_corpus(corpus)
        langs, vocab, vi, logt = fit(counts_of(train))
        print('langs', len(langs), 'vocab', len(vocab))
        evaluate(langs, vi, logt, test, 'float')
        evaluate(langs, vi, quantize(logt)[1], test, 'uint8')
    else:
        langs, vocab, vi, logt = fit(counts_of(read_corpus(corpus)))
        q, _ = quantize(logt)
        out = {'about': 'Multinomial Naive Bayes over in-word character 1-4-grams (lowercase, NFC, each word padded with spaces; grams with a digit or no letter are skipped). Weights: log probabilities, uint8-quantised over [lo, hi], row-major langs x (grams + 1); the last column is every gram not in the list.',
               'lo': LO, 'hi': HI, 'langs': langs, 'grams': vocab,
               'weights': base64.b64encode(q.tobytes()).decode()}
        dest = f'{REPO}/src/data/model.json'
        json.dump(out, open(dest, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('langs', len(langs), 'grams', len(vocab), 'bytes', os.path.getsize(dest))
