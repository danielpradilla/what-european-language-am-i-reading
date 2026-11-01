// Explore: station cards with line and branch, line introductions, legend, keyboard travel (SPEC 16.3).
const $ = (s) => document.querySelector(s);

// One short, careful line of background per family. The "poster check" under it is computed from the data.
const BLURB = {
  romance: 'Romance languages are the descendants of the Latin spoken across the Roman Empire. Their accents (ç, ñ, ș, è…) keep most of them close together on the poster.',
  germanic: 'English, German, Dutch and Swedish are cousins, but borrowed words and spelling reforms send them to different corners of the poster.',
  celtic: 'Irish and Scottish Gaelic are Goidelic; Welsh and Breton are Brittonic. Breton came to Brittany with settlers from Britain.',
  slavic: 'Polish and Czech are written with Latin letters, Russian and Bulgarian with Cyrillic, and Serbian with both. Same family, different alphabets.',
  baltic: 'Lithuanian and Latvian are the only two living Baltic languages, neither Slavic nor Germanic. Lithuanian keeps many very old Indo-European features.',
  hellenic: 'Greek has a branch of Indo-European to itself. Tsakonian descends from ancient Doric and survives in a few villages of the Peloponnese.',
  indoiranian: 'Romani came from north-west India about a thousand years ago, so its closest relatives are Hindi and Punjabi. Ossetian, in the Caucasus, is an Iranian language.',
  uralic: 'Finnish, Estonian and Hungarian are related, but the poster puts them far apart because of their letters. Sámi languages and the languages of the Volga and the Urals belong here too.',
  turkic: 'Turkic languages spread west from Central Asia: Turkish, Azerbaijani, Tatar, Chuvash and more. Latin and Cyrillic alphabets share the family out on the poster.',
  kartvelian: 'Georgian, Mingrelian, Laz and Svan form a family of their own with no known relatives. Georgian has its own alphabet.',
  nwcauc: 'Abkhaz, Abaza, Adyghe and Kabardian are famous for very few vowels and a great many consonants.',
  necauc: 'Dagestan alone holds dozens of languages in a tiny area. Many are written in Cyrillic with the letter ӏ (palochka), which the poster treats as one of its own.',
};
const SINGLES = {
  sqi: 'Albanian is a branch of Indo-European by itself.',
  hye: 'Armenian also stands alone in Indo-European, with its own alphabet.',
  mlt: 'Maltese is a Semitic language, related to Arabic, written in Latin letters with many Italian and English words.',
  xal: 'Kalmyk is a Mongolic language: the only one spoken in Europe, west of the Volga.',
  eus: 'Basque is a language isolate: no relatives are known.',
  epo: 'Esperanto was created by L. L. Zamenhof in 1887. It has no homeland, so it sits in a ring of its own.',
};
const SCRIPTS = { Cyrillic: /\p{Script=Cyrillic}/u, Greek: /\p{Script=Greek}/u, Georgian: /\p{Script=Georgian}/u, Armenian: /\p{Script=Armenian}/u, Hebrew: /\p{Script=Hebrew}/u };

export function createExplore(ctx) {
  const { chart, europe, map, ui, store, leaves, busInfo } = ctx;
  const { esc } = ui;
  const S = europe.stations, L = europe.lines, B = europe.buses;
  const intro = $('#line-intro');
  const seen = new Set();
  let introTimer = 0;
  let selected = null;
  let active = false;

  const scriptOf = (c) => {
    const native = leaves[c].label.split(' / ')[1] ?? leaves[c].label;
    return Object.entries(SCRIPTS).find(([, re]) => re.test(native))?.[0] ?? 'Latin';
  };
  const cd = (a, b) => Math.hypot(chart.leaves[a].at[0] - chart.leaves[b].at[0], chart.leaves[a].at[1] - chart.leaves[b].at[1]);
  const metro = map.codes.filter((k) => !S[k].bus); // the poster's 106; bus stops have no place on it
  const posterNeighbour = (c) => metro.filter((k) => k !== c).sort((a, b) => cd(c, a) - cd(c, b))[0];
  const members = (id) => map.codes.filter((c) => S[c].line === id);

  /** Where the letter chart and the family map agree or disagree for one line. */
  function posterCheck(id) {
    const m = members(id);
    const near = m.filter((c) => S[posterNeighbour(c)].line === id).length;
    const scripts = [...new Set(m.map(scriptOf))];
    const parts = [];
    parts.push(near / m.length >= 0.7
      ? `The letter chart mostly keeps this family together: ${near} of ${m.length} languages sit next to a relative on the poster.`
      : `The letter chart pulls this family apart: only ${near} of ${m.length} languages sit next to a relative on the poster.`);
    if (scripts.length > 1) parts.push(`It uses ${scripts.length} alphabets (${scripts.join(', ')}), and the poster sorts by alphabet first.`);
    return parts.join(' ');
  }

  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  const stopsOf = (bid) => [...new Set(B[bid].segments.flatMap((s) => [s.from, s.to]).filter((k) => S[k].bus))];
  const busIntroHtml = (bid) => {
    const b = B[bid], stops = stopsOf(bid), info = busInfo(stops[0]);
    return `<div class="li-head"><span class="swatch swatch-bus" style="--c:${L[b.line].colour}"></span><b>${esc(b.name)} bus</b><span class="muted">${esc(cap(info.text))} · ${stops.length} regional ${stops.length === 1 ? 'language' : 'languages'}</span><button type="button" class="btn btn-small btn-quiet li-x" aria-label="Close">Close</button></div>
      <p>${stops.map((c) => esc(leaves[c].english)).join(', ')}.</p>
      <p class="hint">Metro: the poster's 106 languages. Bus: regional languages that are not on the poster. A bus between two stations marks a language that sits between two main ones; it does not mean it comes from either.</p>`;
  };
  function lineIntroHtml(id) {
    if (id.startsWith('bus:')) return busIntroHtml(id.slice(4));
    const line = L[id];
    const branches = [...new Set(members(id).map((c) => S[c].branch))];
    return `<div class="li-head"><span class="swatch" style="--c:${line.colour}"></span><b>${esc(line.name)}</b><span class="muted">${esc(line.family)} · ${members(id).length} languages</span><button type="button" class="btn btn-small btn-quiet li-x" aria-label="Close">Close</button></div>
      <p>${esc(BLURB[id])}</p>
      <p class="li-check"><b>Poster check.</b> ${esc(posterCheck(id))}</p>
      ${branches.length > 1 ? `<p class="hint">Branches: ${branches.map(esc).join(', ')}</p>` : ''}`;
  }
  function showIntro(id, hold = 9000) {
    intro.innerHTML = lineIntroHtml(id);
    intro.hidden = false;
    clearTimeout(introTimer);
    introTimer = setTimeout(hideIntro, hold);
  }
  function hideIntro() { clearTimeout(introTimer); intro.hidden = true; }
  intro.addEventListener('click', (e) => { if (e.target.closest('.li-x')) hideIntro(); });

  // ---------- legend ----------
  const legend = $('#legend');
  legend.innerHTML = `${Object.entries(L).map(([id, l]) => {
    const m = members(id);
    const branches = [...new Set(m.map((c) => S[c].branch))];
    return `<div class="lg-row" data-line="${id}"><button type="button" class="lg-main" data-line="${id}"><span class="swatch" style="--c:${l.colour}"></span><span class="lg-name">${esc(l.name)}</span><span class="lg-n num">${m.length}</span></button><span class="lg-fam">${esc(l.family)}${branches.length > 1 ? ` · ${branches.map(esc).join(', ')}` : ''}</span></div>`;
  }).join('')}<div class="lg-row"><span class="lg-main lg-single"><span class="swatch swatch-none"></span><span class="lg-name">On their own</span><span class="lg-n num">6</span></span><span class="lg-fam">${['sqi', 'hye', 'mlt', 'xal', 'eus', 'epo'].map((c) => `<button type="button" class="lg-chip" data-st="${c}">${esc(leaves[c].english)}</button>`).join(' ')}</span></div>
    <p class="label lg-head">Bus routes</p><p class="hint">Regional languages that are not on the poster. A route that starts at one station and ends at another passes between two main languages; a short route starts at one.</p>${Object.entries(B).map(([id, b]) => {
      const stops = stopsOf(id);
      return `<div class="lg-row" data-line="bus:${id}"><button type="button" class="lg-main" data-line="bus:${id}"><span class="swatch swatch-bus" style="--c:${L[b.line].colour}"></span><span class="lg-name">${esc(b.name)}</span><span class="lg-n num">${stops.length}</span></button><span class="lg-fam">${esc(cap(busInfo(stops[0]).text))}: ${stops.map((c) => `<button type="button" class="lg-chip" data-st="${c}">${esc(leaves[c].english)}</button>`).join(' ')}</span></div>`;
    }).join('')}
    <p class="hint">Dashed walkways join neighbours that share a border or a city, such as Basque with Spanish and French. They show contact, not kinship.</p>`;
  const lineBtn = (e) => e.target.closest('[data-line].lg-main');
  legend.addEventListener('click', (e) => {
    const b = lineBtn(e);
    if (b) { map.highlightLine(b.dataset.line); showIntro(b.dataset.line, 14000); return; }
    const chip = e.target.closest('.lg-chip');
    if (chip) select(chip.dataset.st, true);
  });
  legend.addEventListener('pointerover', (e) => { const b = lineBtn(e); if (b && e.pointerType === 'mouse') map.highlightLine(b.dataset.line); });
  legend.addEventListener('pointerout', (e) => { if (lineBtn(e) && e.pointerType === 'mouse') map.highlightLine(null); });
  legend.addEventListener('focusin', (e) => { const b = lineBtn(e); if (b) map.highlightLine(b.dataset.line); });
  legend.addEventListener('focusout', () => map.highlightLine(null));

  // ---------- cards ----------
  const coord = ([lat, lon]) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  function cardExtra(c) {
    const st = S[c], line = st.line ? L[st.line] : null;
    if (st.bus) {
      const info = busInfo(c), b = info.route;
      return `<div class="card-line">
        <p><span class="swatch swatch-bus" style="--c:${L[b.line].colour}"></span> <b>${esc(b.name)} bus</b> · ${esc(cap(info.text))}</p>
        <p class="hint">Metro: the poster's 106 languages. Bus: regional languages that are not on the poster. The route shows where it sits on the map, not that it comes from the stations it joins.</p>
        <p class="hint">Placed at the approximate centre of the area where it is spoken: ${coord(st.latlon)}.</p>
      </div>`;
    }
    const where = c === 'epo' ? 'No homeland: Esperanto is spoken everywhere.' : `Coordinates in Glottolog: ${coord(st.latlon)} (<a href="https://glottolog.org" target="_blank" rel="noopener">Glottolog</a>, CC BY 4.0). The map moves it onto the grid.`;
    const nb = posterNeighbour(c), same = S[nb].line && S[nb].line === st.line;
    return `<div class="card-line">
        <p>${line ? `<span class="swatch" style="--c:${line.colour}"></span> <b>${esc(line.name)} line</b> · ${esc(st.branch)} · ${esc(line.family)}` : `<span class="swatch swatch-none"></span> <b>On its own</b> · ${esc(st.branch)}${st.family ? ` · ${esc(st.family)}` : ''}`}</p>
        ${SINGLES[c] ? `<p>${esc(SINGLES[c])}</p>` : ''}
        <p class="hint">${where}</p>
        <p class="hint">On the poster its nearest neighbour is <b>${esc(leaves[nb].english)}</b>${same ? ', a relative on the same line.' : `, ${S[nb].line ? `a ${esc(L[S[nb].line].name)} language` : 'a language on its own'}${line ? ': the letters, not the family, decide.' : '.'}`}</p>
        <p><a class="btn btn-small btn-primary" href="index.html#lang=${encodeURIComponent(c)}">Open on the poster</a></p>
      </div>`;
  }
  function select(c, openCard = true) {
    if (selected) map.mark(selected, 'sel', false);
    selected = c;
    if (!c) { $('#eu-selected').innerHTML = ''; return; }
    map.mark(c, 'sel', true);
    map.setTabStop(c);
    const lf = leaves[c];
    $('#eu-selected').innerHTML = `<div class="found-line">${ui.flagHtml(c)}<span><b>${esc(lf.english)}</b> <span class="muted">· ${esc(lf.label.split(' / ')[0])}</span><br><span class="hint">${S[c].bus ? `${esc(cap(busInfo(c).text))} · ${esc(busInfo(c).route.name)} bus` : S[c].line ? `${esc(L[S[c].line].name)} line · ${esc(S[c].branch)}` : 'On its own'}</span></span><button type="button" class="btn btn-small" data-card>Card</button></div>`;
    if (openCard) ui.showCard(c, cardExtra(c));
  }
  $('#eu-selected').addEventListener('click', (e) => { if (e.target.closest('[data-card]') && selected) ui.showCard(selected, cardExtra(selected)); });

  return {
    cardExtra, scriptOf, select, hideIntro,
    enter() { active = true; $('#legend-box').open = true; },
    exit() { active = false; select(null); hideIntro(); map.highlightLine(null); },
    onStation(c) { select(c, !!c); },
    onHover(h) {
      map.highlightLine(h?.line ?? null);
      if (active && h?.line && (L[h.line] || h.line.startsWith('bus:')) && !seen.has(h.line)) { seen.add(h.line); showIntro(h.line); }
    },
    onLine(id) { if (active && (L[id] || id?.startsWith('bus:'))) showIntro(id, 12000); },
    key(e) {
      const dir = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd' }[e.key];
      if (!dir) return false;
      const cur = document.activeElement?.closest?.('[data-st]')?.dataset.st ?? selected ?? 'ces';
      const next = map.neighbour(cur, dir);
      if (next) { map.focusStation(next); ui.announce(`${leaves[next].english}, ${S[next].bus ? `bus stop, ${B[S[next].bus].name} route` : S[next].line ? `${L[S[next].line].name} line` : 'on its own'}.`); }
      return true;
    },
  };
}
