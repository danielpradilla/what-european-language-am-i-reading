// Europe line map: scenery, lines, stations with flags, labels, camera and minimap (SPEC 16).
// The camera is a CSS transform on an HTML layer holding the world-sized SVG, so panning never relayouts or repaints it.
const NS = 'http://www.w3.org/2000/svg';
export const U = 36; // world units per grid unit
const X0 = -2, Y0 = -2, X1 = 56, Y1 = 43; // grid window drawn
export const WORLD = { w: (X1 - X0) * U, h: (Y1 - Y0) * U };
const FLAG = 26, HALF = FLAG / 2, FS = 11.5;
const FB = 22, HB = FB / 2; // a bus stop is a smaller, rounded flag in a ring of its route's colour
const SEAS = [ // scenery names, grid positions
  ['Atlantic Ocean', 0, 19, -8], ['North Sea', 14.5, 9.2, 0], ['Baltic Sea', 26.5, 12.4, 0], ['Mediterranean Sea', 15.5, 37.8, 0],
  ['Black Sea', 38, 32.6, 0], ['Caspian Sea', 52.4, 29.5, -70], ['Norwegian Sea', 15.5, 1.2, 0],
];

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};
const P = ([gx, gy]) => [(gx - X0) * U, (gy - Y0) * U];
const f1 = (n) => Math.round(n * 10) / 10;
const polyD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('');
const ink = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#1c1510' : '#fffaee'; };

export function createEuropeMap({ svg, mini, wrap, europe, leaves, flags, aspect, drawFlag, layout, store }) {
  const { stations: S, lines: L, segments, transfers, coast, buses = {} } = europe;
  const codes = Object.keys(S);
  const on = { station: null, hover: null, line: null };
  const reduced = () => store.settings.reduced;
  const pos = Object.fromEntries(codes.map((c) => [c, P(S[c].at)]));
  const labelOf = (c) => leaves[c].label.split(' / ')[0];
  const lineOf = (c) => S[c].line ?? (S[c].bus ? `bus:${S[c].bus}` : undefined); // a bus stop highlights its route
  const colourOf = (c) => (S[c].line ? L[S[c].line].colour : S[c].bus ? L[buses[S[c].bus].line].colour : '#1c1510');

  // ---------- adjacency for keyboard travel: along lines, then walkways ----------
  const adj = Object.fromEntries(codes.map((c) => [c, new Set()]));
  for (const s of segments) { adj[s.from].add(s.to); adj[s.to].add(s.from); }
  for (const [a, b] of transfers) { adj[a].add(b); adj[b].add(a); }
  for (const b of Object.values(buses)) for (const s of b.segments) { adj[s.from].add(s.to); adj[s.to].add(s.from); }

  // ---------- scenery ----------
  svg.textContent = '';
  const layer = document.createElement('div');
  layer.className = 'cam';
  layer.style.width = `${WORLD.w}px`; layer.style.height = `${WORLD.h}px`;
  svg.append(layer);
  const gCam = el('svg', { viewBox: `0 0 ${WORLD.w} ${WORLD.h}` }, layer);
  const defs = el('defs', {}, gCam);
  el('clipPath', { id: 'eu-clip' }, defs).append(el('rect', { width: WORLD.w, height: WORLD.h }));
  const dots = el('pattern', { id: 'eu-dots', width: 9, height: 9, patternUnits: 'userSpaceOnUse' }, defs);
  el('clipPath', { id: 'eu-bus-clip' }, defs).append(el('rect', { x: -HB, y: -HB, width: FB, height: FB, rx: 6 }));
  el('circle', { cx: 2.5, cy: 2.5, r: 1.15, fill: '#7fbdd0', opacity: 0.55 }, dots);
  el('circle', { cx: 7, cy: 7, r: 1.15, fill: '#7fbdd0', opacity: 0.55 }, dots);
  const hatch = el('pattern', { id: 'eu-fog', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 6, height: 6, fill: '#ead8ad' }, hatch);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#8a7863', 'stroke-width': 1.6 }, hatch);

  const gScene = el('g', { 'clip-path': 'url(#eu-clip)', class: 'eu-scene' }, gCam);
  el('rect', { width: WORLD.w, height: WORLD.h, class: 'eu-sea' }, gScene);
  el('rect', { width: WORLD.w, height: WORLD.h, fill: 'url(#eu-dots)' }, gScene);
  const poly = (k) => coast.filter((c) => c.kind === k).map((c) => `${polyD(c.pts.map(P))}Z`).join('');
  const landD = poly('land');
  el('path', { d: landD, class: 'eu-land' }, gScene);
  el('path', { d: poly('water'), class: 'eu-lake' }, gScene);
  for (const [text, gx, gy, rot] of SEAS) {
    const [x, y] = P([gx, gy]);
    el('text', { x, y, class: 'eu-sea-name', 'text-anchor': 'middle', transform: rot ? `rotate(${rot} ${x} ${y})` : null }, gScene).textContent = text;
  }
  const gWalk = el('g', { class: 'eu-walks' }, gCam);
  const gBus = el('g', { class: 'eu-buses' }, gCam);
  const gLines = el('g', { class: 'eu-lines' }, gCam);
  const gRing = el('g', { class: 'eu-ring' }, gCam);
  const gTags = el('g', { class: 'eu-tags' }, gCam);
  const gSt = el('g', { class: 'eu-stations' }, gCam);
  const gLbl = el('g', { class: 'eu-labels' }, gCam);
  const gMark = el('g', { class: 'eu-marks' }, gCam);

  // ---------- lines ----------
  const byLine = {}; // lineId -> elements to light up together
  const segsOf = {};
  for (const s of segments) (segsOf[s.line] ??= []).push(s);
  const segEls = []; // { s, g }
  for (const [id, line] of Object.entries(L)) {
    const g = el('g', { class: 'eu-line', 'data-line': id }, gLines);
    (byLine[id] ??= []).push(g);
    for (const s of segsOf[id] ?? []) {
      const sg = el('g', { class: 'eu-seg' }, g);
      const d = polyD(s.pts.map(P));
      el('path', { d, class: 'eu-line-ink' }, sg);
      el('path', { d, class: 'eu-line-fill', stroke: line.colour }, sg);
      segEls.push({ s, g: sg });
    }
  }

  // ---------- bus routes: under the metro lines, one thin solid line in the family colour, no ink casing ----------
  for (const [id, b] of Object.entries(buses)) {
    const g = el('g', { class: 'eu-bus', 'data-line': `bus:${id}` }, gBus);
    byLine[`bus:${id}`] = [g];
    for (const s of b.segments) {
      const sg = el('g', { class: 'eu-seg' }, g);
      const d = polyD(s.pts.map(P));
      el('path', { d, class: 'eu-bus-fill', stroke: L[b.line].colour }, sg);
      segEls.push({ s, g: sg });
    }
  }

  for (const [a, b] of transfers) {
    const [ax, ay] = pos[a], [bx, by] = pos[b];
    const d = `M${f1(ax)} ${f1(ay)}L${f1(bx)} ${f1(by)}`;
    el('path', { d, class: 'eu-walk-ink' }, gWalk);
    el('path', { d, class: 'eu-walk' }, gWalk);
  }

  // ---------- stations ----------
  const stEls = {};
  for (const c of codes) {
    const [x, y] = pos[c];
    const lf = leaves[c], bus = S[c].bus, F = bus ? FB : FLAG, H = F / 2, rx = bus ? 6 : 0;
    const g = el('g', { class: bus ? 'eu-st eu-st-bus' : 'eu-st', transform: `translate(${f1(x)} ${f1(y)})`, 'data-st': c, 'data-line': lineOf(c) ?? 'none', tabindex: -1, role: 'button' }, gSt);
    const lineName = bus ? `Bus stop, ${buses[bus].name} route` : lineOf(c) ? `${L[lineOf(c)].name} line, ${S[c].branch}` : (S[c].branch === 'Constructed' ? 'no homeland' : `${S[c].branch}, on its own`);
    g.setAttribute('aria-label', `${lf.label.split(' / ')[0]}, ${lf.english}. ${lineName}.`);
    const body = el('g', { class: 'eu-body' }, g);
    el('rect', { x: -H + 2.2, y: -H + 2.2, width: F, height: F, rx, class: 'eu-shadow' }, body);
    el('rect', { x: -H - 4, y: -H - 4, width: F + 8, height: F + 8, rx: rx ? 9 : 0, class: 'eu-glow' }, body);
    if (bus) el('rect', { x: -H - 3, y: -H - 3, width: F + 6, height: F + 6, rx: 9, class: 'eu-bus-ring', fill: colourOf(c) }, body);
    const info = flags.leaves[c] ?? { files: [], layout: 'single' };
    drawFlag(bus ? el('g', { 'clip-path': 'url(#eu-bus-clip)' }, body) : body, info, F, aspect);
    el('rect', { x: -H, y: -H, width: F, height: F, rx, class: 'eu-fog' }, body);
    el('rect', { x: -H, y: -H, width: F, height: F, rx, class: 'eu-frame' }, body);
    el('rect', { x: -H - 3, y: -H - 3, width: F + 6, height: F + 6, class: 'eu-hit' }, g);
    stEls[c] = { g, label: null };
    (byLine[lineOf(c) ?? 'none'] ??= []).push(g);
  }

  // Esperanto: a station without a homeland, in a dashed ring
  const [ex, ey] = pos.epo;
  const RING = 31;
  el('circle', { cx: ex, cy: ey, r: RING, class: 'eu-ring-c' }, gRing);

  // ---------- labels, line-end badges and branch tags ----------
  const flagBoxes = codes.map((c) => (S[c].bus
    ? { x: pos[c][0] - HB - 4, y: pos[c][1] - HB - 4, w: FB + 8, h: FB + 14 }
    : { x: pos[c][0] - HALF - 2, y: pos[c][1] - HALF - 2, w: FLAG + 4, h: FLAG + 4 }));
  flagBoxes[codes.indexOf('epo')] = { x: ex - RING, y: ey - RING, w: RING * 2, h: RING * 2 };
  const lineSegs = [...segments, ...Object.values(buses).flatMap((b) => b.segments)].map((s) => s.pts.map(P));
  const pts = layout.samplePoints(lineSegs);
  const bounds = WORLD;
  const taken = [];

  // badges at both ends of every line
  const badgeBoxes = [];
  for (const [id, line] of Object.entries(L)) {
    const deg = {};
    for (const s of segsOf[id]) { deg[s.from] = (deg[s.from] ?? 0) + 1; deg[s.to] = (deg[s.to] ?? 0) + 1; }
    const ends = Object.keys(deg).filter((c) => deg[c] === 1);
    let pair = [ends[0], ends[1] ?? ends[0]], far = -1;
    for (const a of ends) for (const b of ends) { const d = Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]); if (d > far) { far = d; pair = [a, b]; } }
    const name = line.name.toUpperCase();
    const w = name.length * 6.6 + 12, h = 16;
    for (const end of new Set(pair)) {
      const [cx, cy] = pos[end];
      const seg = segsOf[id].find((s) => s.from === end || s.to === end);
      const p = seg.from === end ? seg.pts : [...seg.pts].reverse();
      const [nx, ny] = P(p[1]);
      let dx = cx - nx, dy = cy - ny; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      const out = { x: cx + dx * (HALF + 6 + (Math.abs(dx) * w) / 2) - w / 2 + (dx ? 0 : 0), y: cy + dy * (HALF + 6 + (Math.abs(dy) * h) / 2) - h / 2, w, h, pen: -1, side: 'out' };
      const cands = [out, ...layout.candidates(cx, cy, HALF, w, h, 5)];
      const box = layout.placeOptional(cands, { fixed: flagBoxes, taken, bounds, pts }) ?? { ...out };
      taken.push(box);
      badgeBoxes.push({ id, name, box, colour: line.colour });
    }
  }
  for (const b of badgeBoxes) {
    const g = el('g', { class: 'eu-badge', 'data-line': b.id }, gTags);
    el('rect', { x: b.box.x, y: b.box.y, width: b.box.w, height: b.box.h, rx: 4, fill: b.colour, class: 'eu-badge-r' }, g);
    el('text', { x: b.box.x + b.box.w / 2, y: b.box.y + b.box.h / 2 + 3.6, 'text-anchor': 'middle', fill: ink(b.colour), class: 'eu-badge-t' }, g).textContent = b.name;
    (byLine[b.id] ??= []).push(g);
  }

  // station labels
  const items = codes.map((c) => {
    const lines = layout.wrapLabel(labelOf(c));
    const w = Math.max(...lines.map((l) => [...l].length)) * FS * 0.58 + 2;
    const h = lines.length * FS * 1.12;
    return { id: c, cx: pos[c][0], cy: pos[c][1], w, h, lines, half: c === 'epo' ? RING : S[c].bus ? HB + 3 : HALF };
  });
  const ringText = { x: ex - 52, y: ey - RING - 17, w: 104, h: 13 };
  const placed = layout.placeLabels({ items, fixed: [...flagBoxes, ringText, ...taken], pts, bounds, half: HALF });
  for (const it of items) {
    const p = placed[it.id];
    const anchor = { r: 'start', tr: 'start', br: 'start', l: 'end', tl: 'end', bl: 'end' }[p.side] ?? 'middle';
    const tx = anchor === 'start' ? p.x : anchor === 'end' ? p.x + p.w : p.x + p.w / 2;
    const t = el('text', { class: S[it.id].bus ? 'eu-lbl eu-lbl-bus' : 'eu-lbl', 'text-anchor': anchor, 'data-st': it.id, 'data-line': lineOf(it.id) ?? 'none', 'font-size': FS }, gLbl);
    it.lines.forEach((l, i) => { el('tspan', { x: f1(tx), y: f1(p.y + FS * 0.92 + i * FS * 1.12) }, t).textContent = l; });
    stEls[it.id].label = t;
    (byLine[lineOf(it.id) ?? 'none'] ??= []).push(t);
  }
  taken.push(...items.map((it) => ({ x: placed[it.id].x, y: placed[it.id].y, w: placed[it.id].w, h: placed[it.id].h })));
  el('text', { x: ex, y: ey - RING - 5, class: 'eu-ring-t', 'text-anchor': 'middle' }, gRing).textContent = 'spoken everywhere';

  // branch tags (only where there is free paper)
  for (const [id, line] of Object.entries(L)) {
    const branches = {};
    for (const c of codes.filter((k) => lineOf(k) === id)) (branches[S[c].branch] ??= []).push(c);
    if (Object.keys(branches).length < 2) continue;
    for (const [br, members] of Object.entries(branches)) {
      if (members.length < 2) continue;
      const w = br.length * 5.2 + 14, h = 13;
      const boxes = [];
      for (const s of segsOf[id].filter((k) => members.includes(k.from) && members.includes(k.to))) {
        const a = P(s.pts[0]), b = P(s.pts.at(-1));
        for (const t of [0.5, 0.35, 0.65]) {
          const mx = a[0] + (b[0] - a[0]) * t, my = a[1] + (b[1] - a[1]) * t;
          const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
          if (horizontal) boxes.push({ x: mx - w / 2, y: my - 8 - h, w, h, pen: 0 }, { x: mx - w / 2, y: my + 8, w, h, pen: 0.2 });
          else boxes.push({ x: mx + 8, y: my - h / 2, w, h, pen: 0 }, { x: mx - 8 - w, y: my - h / 2, w, h, pen: 0.2 });
        }
      }
      const box = layout.placeOptional(boxes, { fixed: [...flagBoxes, ...taken], taken: [], bounds, pts });
      if (!box) continue;
      taken.push(box);
      const g = el('g', { class: 'eu-tag', 'data-line': id }, gTags);
      el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 3, class: 'eu-tag-r', stroke: line.colour }, g);
      el('text', { x: box.x + box.w / 2, y: box.y + box.h / 2 + 3.2, 'text-anchor': 'middle', class: 'eu-tag-t' }, g).textContent = br;
      (byLine[id] ??= []).push(g);
    }
  }

  // ---------- minimap ----------
  mini.textContent = '';
  mini.setAttribute('viewBox', `0 0 ${WORLD.w} ${WORLD.h}`);
  mini.style.aspectRatio = `${WORLD.w} / ${WORLD.h}`;
  el('rect', { width: WORLD.w, height: WORLD.h, class: 'mm-sea' }, mini);
  const mmClip = el('clipPath', { id: 'mm-clip' }, mini);
  mmClip.append(el('rect', { width: WORLD.w, height: WORLD.h }));
  el('path', { d: landD, class: 'mm-land', 'clip-path': 'url(#mm-clip)' }, mini);
  for (const c of codes) el('circle', { cx: pos[c][0], cy: pos[c][1], r: S[c].bus ? 11 : 15, fill: colourOf(c), class: S[c].bus ? 'mm-dot mm-bus' : 'mm-dot' }, mini);
  const mView = el('rect', { class: 'mm-view' }, mini);

  // ---------- camera ----------
  let W = 800, H = 600, dirty = true, raf = 0, willOn = false, settleT = 0, rasterZ = 0;
  const wake = () => { clearTimeout(settleT); if (!raf) raf = requestAnimationFrame(tick); };
  const touch = () => { dirty = true; wake(); };
  const cam = { x: WORLD.w / 2, y: WORLD.h / 2, z: 0.5, tx: WORLD.w / 2, ty: WORLD.h / 2, tz: 0.5 };
  const fitZoom = () => Math.min(W / WORLD.w, H / WORLD.h) * 0.98;
  const clampZ = (z) => Math.min(5, Math.max(fitZoom() * 0.95, z));
  const snapIfReduced = () => { if (reduced()) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz }); touch(); };
  new ResizeObserver(() => {
    W = wrap.clientWidth; H = wrap.clientHeight;
    if (!cam.sized) { cam.sized = true; home(true); return; } // the first real size: start on central Europe
    if (cam.tz <= fitZoom() * 1.02) overview(true); else { cam.tz = clampZ(cam.tz); touch(); }
  }).observe(wrap);
  function overview(snap) {
    cam.tx = WORLD.w / 2; cam.ty = WORLD.h / 2; cam.tz = fitZoom();
    if (snap) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz }); else snapIfReduced();
    touch();
  }
  /** Start view: central Europe, from the Netherlands to Belarus and from Kashubia to the Balkans, readable on a phone. */
  function home(snap) {
    frame(['nld', 'bel', 'csb', 'cnr', 'bul'].map((c) => pos[c]), { pad: U * 0.45, maxZ: 2 });
    if (snap) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz });
    touch();
  }
  function frame(points, { pad = 120, maxZ = 1.6 } = {}) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs) + pad * 2, bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    cam.tz = Math.min(maxZ, Math.max(fitZoom(), Math.min(W / bw, H / bh)));
    cam.tx = (Math.max(...xs) + Math.min(...xs)) / 2; cam.ty = (Math.max(...ys) + Math.min(...ys)) / 2;
    snapIfReduced();
  }
  function zoomBy(f, px = W / 2, py = H / 2) {
    const nz = clampZ(cam.tz * f);
    const wx = cam.tx + (px - W / 2) / cam.tz, wy = cam.ty + (py - H / 2) / cam.tz;
    cam.tz = nz; cam.tx = wx - (px - W / 2) / nz; cam.ty = wy - (py - H / 2) / nz;
    snapIfReduced();
  }
  const centerOn = (c, z) => { cam.tx = pos[c][0]; cam.ty = pos[c][1]; cam.tz = clampZ(z ?? Math.max(cam.tz, 1)); snapIfReduced(); };
  /** Pan just enough to bring a station into view (keyboard travel). */
  function reveal(c) {
    const m = 60 / cam.tz;
    const l = cam.tx - W / 2 / cam.tz, r = cam.tx + W / 2 / cam.tz, t = cam.ty - H / 2 / cam.tz, b = cam.ty + H / 2 / cam.tz;
    const [x, y] = pos[c];
    if (x < l + m) cam.tx -= l + m - x; else if (x > r - m) cam.tx += x - (r - m);
    if (y < t + m) cam.ty -= t + m - y; else if (y > b - m) cam.ty += y - (b - m);
    snapIfReduced();
  }
  function tick() {
    raf = 0;
    const k = reduced() ? 1 : 0.2;
    cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k;
    const done = Math.abs(cam.tx - cam.x) < 0.3 && Math.abs(cam.ty - cam.y) < 0.3 && Math.abs(cam.tz - cam.z) < 0.0005;
    if (done) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz });
    // The layer stays promoted so a pan or the start of a gesture never repaints the whole map (WebKit took 300-600 ms).
    // After a zoom settles it is dropped for two frames, so the browser repaints it crisp at the new scale.
    if (!willOn) { layer.style.willChange = 'transform'; willOn = true; }
    layer.style.transform = `translate(${(W / 2 - cam.x * cam.z).toFixed(2)}px,${(H / 2 - cam.y * cam.z).toFixed(2)}px) scale(${cam.z.toFixed(4)})`;
    gCam.classList.toggle('z-lo', cam.z < 0.62);
    mView.setAttribute('x', cam.x - W / 2 / cam.z); mView.setAttribute('y', cam.y - H / 2 / cam.z);
    mView.setAttribute('width', W / cam.z); mView.setAttribute('height', H / cam.z);
    if (done) { dirty = false; if (Math.abs(cam.z - rasterZ) > 1e-4) settleT = setTimeout(reraster, 150); } else raf = requestAnimationFrame(tick);
  }
  function reraster() {
    rasterZ = cam.z;
    layer.style.willChange = ''; willOn = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!willOn) { layer.style.willChange = 'transform'; willOn = true; } }));
  }
  wake();

  // ---------- pointer input ----------
  const ptrs = new Map();
  let pinch0 = 0, moved = 0;
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) {
      // Direct manipulation: zoom about the fingers' midpoint and pan with it, without the camera's easing.
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svg.getBoundingClientRect();
      cam.tx -= dx / 2 / cam.tz; cam.ty -= dy / 2 / cam.tz;
      if (pinch0) zoomBy(d / pinch0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz }); touch();
      pinch0 = d;
    } else if (ptrs.size === 1 && moved > 4) {
      cam.tx -= dx / cam.z; cam.ty -= dy / cam.z;
      cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; touch();
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) pinch0 = 0; };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', (e) => {
    // Ctrl-wheel is a trackpad pinch; a plain wheel zooms only once the map has focus, so the page still scrolls past it.
    if (!e.ctrlKey && !svg.contains(document.activeElement)) return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1);
    zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    if (e.ctrlKey) { Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz }); touch(); } // a pinch follows the fingers
  }, { passive: false });
  // Safari on macOS reports a trackpad pinch as gesture events, not ctrl-wheel; without this it zooms the whole page.
  let gScale = 1;
  svg.addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = 1; });
  svg.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    if (ptrs.size) return; // iOS sends these for a touch pinch too; the pointer handler already does that one
    const r = svg.getBoundingClientRect();
    zoomBy(e.scale / gScale, e.clientX - r.left, e.clientY - r.top); gScale = e.scale;
    Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz }); touch();
  });
  svg.addEventListener('gestureend', (e) => e.preventDefault());
  svg.addEventListener('click', (e) => {
    if (moved > 12) return; // a drag, not a tap
    const st = e.target.closest?.('[data-st]'), ln = e.target.closest?.('.eu-line, .eu-bus, .eu-badge, .eu-tag');
    if (st) on.station?.(st.dataset.st);
    else if (ln) on.line?.(ln.dataset.line);
    else on.station?.(null);
  });
  svg.addEventListener('keydown', (e) => {
    const st = e.target.closest?.('[data-st]');
    if (st && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); on.station?.(st.dataset.st); }
  });
  const hov = (e) => {
    if (e.pointerType === 'touch') return; // a finger crossing lines while panning is not a hover
    const st = e.target.closest?.('[data-st]');
    const ln = e.target.closest?.('.eu-line, .eu-bus, .eu-badge, .eu-tag');
    on.hover?.(st ? { code: st.dataset.st, line: lineOf(st.dataset.st) } : ln ? { line: ln.dataset.line } : null);
  };
  svg.addEventListener('pointerover', hov);
  svg.addEventListener('pointerout', () => on.hover?.(null));
  svg.addEventListener('focusin', (e) => { const st = e.target.closest?.('[data-st]'); if (st) on.hover?.({ code: st.dataset.st, line: lineOf(st.dataset.st), focus: true }); });
  svg.addEventListener('focusout', () => on.hover?.(null));
  mini.addEventListener('click', (e) => {
    const r = mini.getBoundingClientRect();
    cam.tx = ((e.clientX - r.left) / r.width) * WORLD.w; cam.ty = ((e.clientY - r.top) / r.height) * WORLD.h;
    snapIfReduced();
  });

  // ---------- state helpers used by the modes ----------
  let hlLine = null;
  function highlightLine(id) {
    if (hlLine === id) return;
    for (const e of byLine[hlLine] ?? []) e.classList.remove('on');
    hlLine = id;
    gCam.classList.toggle('hl', !!id);
    for (const e of byLine[id] ?? []) e.classList.add('on');
  }
  const mark = (c, cls, onOff = true) => {
    const { g, label } = stEls[c];
    g.classList.toggle(cls, onOff);
    if (onOff && (cls === 'lit' || cls === 'ans' || cls === 'sel' || cls === 'bad')) gSt.append(g);
    label?.classList.toggle(cls, onOff);
  };
  const clearMarks = (...cls) => { for (const c of codes) for (const k of cls) mark(c, k, false); };
  /** Fade every station not in `keep` (a Set), and the line pieces that join only faded stations. null = show all. */
  function setOut(keep) {
    for (const c of codes) mark(c, 'out', !!keep && !keep.has(c));
    for (const { s, g } of segEls) g.classList.toggle('out', !!keep && !keep.has(s.from) && !keep.has(s.to));
  }
  function setTabStop(c) { for (const k of codes) stEls[k].g.setAttribute('tabindex', k === c ? '0' : '-1'); }
  const focusStation = (c) => { setTabStop(c); stEls[c].g.focus({ preventScroll: true }); reveal(c); };

  /** Next station in a direction ('l','r','u','d'): neighbours along lines and walkways first, then anything in that half-plane. */
  function neighbour(c, dir) {
    const v = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }[dir];
    const [x, y] = pos[c];
    const score = (k, narrow) => {
      const dx = pos[k][0] - x, dy = pos[k][1] - y, n = Math.hypot(dx, dy);
      const cos = (dx * v[0] + dy * v[1]) / n;
      return cos > (narrow ? 0.3 : 0.5) ? n * (2 - cos) : Infinity;
    };
    const pick = (list, narrow) => list.map((k) => [score(k, narrow), k]).filter((a) => a[0] < Infinity).sort((a, b) => a[0] - b[0])[0]?.[1];
    return pick([...adj[c]], true) ?? pick(codes.filter((k) => k !== c), false) ?? null;
  }

  return {
    on, pos, stEls, codes, adj, WORLD,
    overview, home, frame, zoomBy, centerOn, reveal, highlightLine, mark, clearMarks, setOut, setTabStop, focusStation, neighbour,
    get zoom() { return cam.tz; },
    get fit() { return fitZoom(); },
    refresh: touch,
    setScenery(on) { wrap.classList.toggle('map-off', !on); },
  };
}
