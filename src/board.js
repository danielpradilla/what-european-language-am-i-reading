// Board: SVG metro map drawn from chart.json, rubber-hose snake, camera, minimap (SPEC 5).
const NS = 'http://www.w3.org/2000/svg';
const CELL = 9.5; // one sub-cell: 4 per station spacing (~38 units)
const SPEED = CELL / 25; // units per ms: one sub-cell per 25 ms tick
const BASE_CELLS = 5;
const DIRS = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
export const DIR_WORD = { l: 'left', r: 'right', u: 'up', d: 'down' };
const OPP = { l: 'r', r: 'l', u: 'd', d: 'u' };

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};
const dirName = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd');
};
const polyD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
export const edgeId = (from, answer) => `${from}|${answer ? 'y' : 'n'}`;

// Hand-drawn look without an SVG filter (filters re-rasterise every camera frame): seeded jitter on the geometry.
const rng = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 2000) / 1000 - 1; }; };
/** Subdivide an orthogonal polyline every ~12 units and nudge the new points sideways by up to 0.7 units. */
function wobblyLine(path, seed) {
  const r = rng(seed), out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i];
    const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / 12);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1), nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1), j = r() * 0.7;
      out.push([+(ax + (bx - ax) * t + nx * j).toFixed(2), +(ay + (by - ay) * t + ny * j).toFixed(2)]);
    }
    out.push(path[i]);
  }
  return out;
}
/** A slightly lumpy circle as a smooth closed path. */
function blobD(x, y, rad, seed) {
  const r = rng(seed), n = 14;
  const p = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, rr = rad * (1 + r() * 0.035); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; });
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${mid(p[n - 1], p[0]).map((v) => v.toFixed(2)).join(' ')}`;
  for (let i = 0; i < n; i++) d += `Q${p[i][0].toFixed(2)} ${p[i][1].toFixed(2)} ${mid(p[i], p[(i + 1) % n]).map((v) => v.toFixed(2)).join(' ')}`;
  return `${d}Z`;
}

export function createBoard({ svg, mini, wrap, chart, flags, aspect, drawFlag, store, codePoints }) {
  const { stations, leaves, board: size } = chart;
  const on = { station: null, leaf: null, hover: null, swipe: null };
  const reduced = () => store.settings.reduced;

  // ---------- graph ----------
  const nodePos = (key) => (key.startsWith('L:') ? leaves[key.slice(2)].at : stations[key].at);
  const edges = {};
  const out = {}; // out[station] = { y: edgeRecord, n: edgeRecord }
  const arrival = {}; // arrival[nodeKey] = [edgeRecord]
  for (const e of chart.edges) {
    const seg = e.path.findIndex((p, i) => i && (p[0] !== e.path[i - 1][0] || p[1] !== e.path[i - 1][1]));
    const dir = dirName(e.path[seg - 1] ?? e.path[0], e.path[seg] ?? e.path[0]);
    const last = e.path.length - 1;
    let l = last;
    while (l > 0 && e.path[l][0] === e.path[l - 1][0] && e.path[l][1] === e.path[l - 1][1]) l--;
    const arrive = dirName(e.path[Math.max(l - 1, 0)], e.path[l]);
    const rec = { ...e, id: edgeId(e.from, e.answer), dir, back: OPP[arrive] };
    // The snake travels station centre -> traced path -> target centre.
    rec.points = [stations[e.from].at, ...e.path, nodePos(e.to)].filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    edges[rec.id] = rec;
    (out[e.from] ??= {})[e.answer ? 'y' : 'n'] = rec;
    (arrival[e.to] ??= []).push(rec);
  }
  const graph = { edges, out, arrival, nodePos };

  // ---------- DOM ----------
  svg.textContent = '';
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'fog-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 6, height: 6, fill: '#ead8ad' }, pat);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#8a7863', 'stroke-width': 1.6 }, pat);
  const dots = el('pattern', { id: 'snake-dots', width: 3.2, height: 3.2, patternUnits: 'userSpaceOnUse' }, defs);
  el('circle', { cx: 1.6, cy: 1.6, r: 0.62, fill: '#1c1510', opacity: 0.32 }, dots);

  const gCam = el('g', { id: 'cam' }, svg);
  const gBack = el('g', { class: 'layer-hl' }, gCam);
  const gWob = el('g', { class: 'layer-wobble' }, gCam);
  const gMark = el('g', { class: 'layer-mark' }, gCam);
  const gText = el('g', { class: 'layer-text' }, gCam);
  const gFlags = el('g', { class: 'layer-flags' }, gCam);
  const gLabels = el('g', { class: 'layer-labels' }, gCam);
  const gSnake = el('g', { class: 'layer-snake' }, gCam);
  const gBadge = el('g', { class: 'layer-badges' }, gCam);
  const gHit = el('g', { class: 'layer-hit' }, gCam);

  // lines
  const edgeEls = {};
  for (const e of Object.values(edges)) {
    const yes = e.answer;
    const d = polyD(wobblyLine(e.path, e.id));
    const hl = el('path', { d, class: 'edge-hl', 'data-edge': e.id }, gBack);
    const g = el('g', { class: `edge ${yes ? 'y' : 'n'}`, 'data-edge': e.id }, gWob);
    el('path', { d, class: 'edge-ink' }, g);
    el('path', { d, class: 'edge-fill' }, g);
    edgeEls[e.id] = { g, hl };
  }
  // station bodies (in the wobble layer so the outlines look drawn)
  const stEls = {};
  for (const [id, s] of Object.entries(stations)) {
    const [x, y] = s.at;
    const body = el('path', { d: blobD(x, y, s.r, id), class: 'st-body' }, gWob);
    const halo = el('circle', { cx: x, cy: y, r: s.r + 4.5, class: 'st-halo' }, gMark);
    const strike = el('path', { d: `M${x - s.r * 0.8} ${y + s.r * 0.55}L${x + s.r * 0.8} ${y - s.r * 0.55}`, class: 'st-strike' }, gMark);
    const lines = s.test.length <= 2 ? [s.test.join(' ')] : [s.test.slice(0, Math.ceil(s.test.length / 2)).join(' '), s.test.slice(Math.ceil(s.test.length / 2)).join(' ')];
    const widest = Math.max(...lines.map((l) => [...l].length));
    const fs = Math.min(s.r * 0.9, (s.r * 2 * 0.84) / (widest * 0.62), (s.r * 2 * 0.8) / (lines.length * 1.12));
    const t = el('text', { x, y, class: 'st-t', 'font-size': fs.toFixed(2), 'text-anchor': 'middle' }, gText);
    lines.forEach((l, i) => {
      const ts = el('tspan', { x, dy: i === 0 ? `${((-(lines.length - 1) / 2) * 1.1 + 0.36).toFixed(2)}em` : '1.1em' }, t);
      ts.textContent = l;
    });
    const hit = el('circle', { cx: x, cy: y, r: s.r + 2, class: 'st-hit', 'data-st': id, tabindex: -1, role: 'button' }, gHit);
    const o = out[id];
    const parts = s.test.map((q) => `${q}, ${codePoints(q)}`).join('; ');
    hit.setAttribute('aria-label', `Station ${parts}. Y line leaves ${DIR_WORD[o.y.dir]}, N line leaves ${DIR_WORD[o.n.dir]}.`);
    stEls[id] = { body, halo, strike, text: t, hit, badge: null };
  }

  // Y / N labels, printed on the line just outside the station
  for (const e of Object.values(edges)) {
    const s = stations[e.from];
    const [p0, p1] = [e.path[0], e.path[e.path.length - 1]];
    const [vx, vy] = DIRS[e.dir];
    const dy = vx ? p0[1] - s.at[1] : p0[0] - s.at[0];
    const reach = Math.sqrt(Math.max(s.r * s.r - dy * dy, 0)) + 6.5;
    const seg = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]);
    const d = Math.min(reach, Math.max(seg / 2, 7));
    const t = el('text', { x: p0[0] + vx * d, y: p0[1] + vy * d + 2.4, class: `yn ${e.answer ? 'y' : 'n'}`, 'text-anchor': 'middle' }, gLabels);
    t.textContent = e.answer ? 'Y' : 'N';
  }

  // flags
  const leafEls = {};
  for (const [code, lf] of Object.entries(leaves)) {
    const [x, y] = lf.at;
    const s = lf.size, h = s / 2;
    const g = el('g', { class: 'leaf', transform: `translate(${x} ${y})`, 'data-lf': code, tabindex: -1, role: 'img' }, gFlags);
    g.setAttribute('aria-label', `${lf.label}, ${lf.english}. Flag of ${lf.flagNote}.`);
    el('rect', { x: -h + 2.6, y: -h + 2.6, width: s, height: s, class: 'flag-shadow' }, g);
    el('rect', { x: -h - 3.5, y: -h - 3.5, width: s + 7, height: s + 7, class: 'leaf-glow' }, g);
    const info = flags.leaves[code] ?? { files: [], layout: 'single' };
    drawFlag(g, info, s, aspect);
    el('rect', { x: -h, y: -h, width: s, height: s, class: 'flag-fog' }, g);
    el('rect', { x: -h, y: -h, width: s, height: s, class: 'flag-frame' }, g);
    leafEls[code] = g;

    const side = lf.labelSide;
    const parts = lf.label.split(' / ');
    const fsz = 7.2;
    const anchor = side === 'l' ? 'end' : side === 'r' ? 'start' : 'middle';
    const lx = side === 'l' ? x - h - 5 : side === 'r' ? x + h + 6 : x;
    const baseY = side === 't' ? y - h - 5 - (parts.length - 1) * fsz * 1.05 : side === 'b' ? y + h + 9 : y - ((parts.length - 1) * fsz * 1.05) / 2 + 2.5;
    const t = el('text', { x: lx, y: baseY, class: 'lf-label', 'text-anchor': anchor, 'font-size': fsz, 'data-lf': code }, gLabels);
    parts.forEach((p, i) => { const ts = el('tspan', { x: lx, dy: i ? `${fsz * 1.05}px` : 0 }, t); ts.textContent = p; });
    leafEls[code].label = t;
  }

  // snake
  const sOut = el('path', { class: 'sn-out' }, gSnake);
  const sBody = el('path', { class: 'sn-body' }, gSnake);
  const sShade = el('path', { class: 'sn-shade' }, gSnake);
  const sScale = el('path', { class: 'sn-scale' }, gSnake);
  const head = el('g', { class: 'sn-head' }, gSnake);
  const hSq = el('g', {}, head);
  el('path', { d: 'M0 0L-0.1 0', class: 'sn-tongue' }, hSq);
  const tongue = hSq.firstChild;
  el('ellipse', { cx: 0, cy: 0, rx: 9.6, ry: 8.4, class: 'sn-head-body' }, hSq);
  el('path', { d: 'M-3 5.2A8.4 8.4 0 0 0 5 4.8', class: 'sn-head-shade' }, hSq);
  const eyes = el('g', {}, hSq);
  for (const ey of [-4.1, 4.1]) {
    el('circle', { cx: 3.4, cy: ey, r: 3, class: 'sn-eye' }, eyes);
    el('circle', { cx: 4.4, cy: ey, r: 1.35, class: 'sn-pupil' }, eyes);
    el('path', { d: `M2.2 ${ey - 1.4}L5.4 ${ey + 1.4}M5.4 ${ey - 1.4}L2.2 ${ey + 1.4}`, class: 'sn-x' }, eyes);
  }

  // minimap
  mini.textContent = '';
  for (const e of Object.values(edges)) el('path', { d: polyD(e.path), class: `mm-edge ${e.answer ? 'y' : 'n'}` }, mini);
  for (const s of Object.values(stations)) el('circle', { cx: s.at[0], cy: s.at[1], r: 6, class: 'mm-st' }, mini);
  const mView = el('rect', { class: 'mm-view' }, mini);
  const mHead = el('circle', { r: 14, class: 'mm-head' }, mini);

  // ---------- camera ----------
  let W = 800, H = 600;
  const cam = { x: size.width / 2, y: size.height / 2, z: 1, tx: size.width / 2, ty: size.height / 2, tz: 1 };
  let follow = false;
  let followZoom = 2.2;
  const fitZoom = () => Math.min(W / size.width, H / size.height) * 0.97;
  const clampZ = (z) => Math.min(6, Math.max(fitZoom() * 0.9, z));
  const ro = new ResizeObserver(() => {
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    cam.tz = clampZ(cam.tz);
    if (!follow && cam.tz <= fitZoom() * 1.001) overview(true);
    dirty = true;
  });
  let dirty = true;
  ro.observe(wrap);

  function overview(snap) {
    follow = false;
    cam.tx = size.width / 2; cam.ty = size.height / 2; cam.tz = fitZoom();
    if (snap || reduced()) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz });
    dirty = true;
  }
  function frame(box, { pad = 40, maxZ = 2.6 } = {}) {
    follow = false;
    const bw = box.x2 - box.x1 + pad * 2, bh = box.y2 - box.y1 + pad * 2;
    cam.tz = Math.min(maxZ, Math.max(fitZoom(), Math.min(W / bw, H / bh)));
    cam.tx = (box.x1 + box.x2) / 2; cam.ty = (box.y1 + box.y2) / 2;
    if (reduced()) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz });
    dirty = true;
  }
  function zoomBy(f, px = W / 2, py = H / 2) {
    const nz = clampZ(cam.tz * f);
    const wx = cam.tx + (px - W / 2) / cam.tz, wy = cam.ty + (py - H / 2) / cam.tz;
    cam.tz = nz;
    if (!follow) { cam.tx = wx - (px - W / 2) / nz; cam.ty = wy - (py - H / 2) / nz; }
    followZoom = nz;
    if (reduced()) Object.assign(cam, { x: cam.tx, y: cam.ty, z: cam.tz });
    dirty = true;
  }
  function setFollow(on, z) {
    follow = on;
    if (on) { followZoom = clampZ(z ?? Math.max(followZoom, 2.0)); cam.tz = followZoom; }
    dirty = true;
  }
  const bboxOf = (pts) => ({
    x1: Math.min(...pts.map((p) => p[0])), x2: Math.max(...pts.map((p) => p[0])),
    y1: Math.min(...pts.map((p) => p[1])), y2: Math.max(...pts.map((p) => p[1])),
  });

  // ---------- snake ----------
  const sn = { x: stations[chart.root].at[0], y: stations[chart.root].at[1], dx: -1, dy: 0, trail: [], trailLen: 0, len: BASE_CELLS * CELL, tlen: BASE_CELLS * CELL, extra: 0, squash: 0, bump: 0, bumpDir: [0, 0], dizzy: 0 };
  sn.trail.push({ x: sn.x, y: sn.y });
  let mv = null;

  const pushTrail = (force) => {
    const last = sn.trail[sn.trail.length - 1];
    const d = Math.hypot(sn.x - last.x, sn.y - last.y);
    if (!force && d < 1.6) return;
    sn.trail.push({ x: sn.x, y: sn.y });
    sn.trailLen += d;
    const max = sn.len + 24;
    while (sn.trail.length > 2 && sn.trailLen - Math.hypot(sn.trail[1].x - sn.trail[0].x, sn.trail[1].y - sn.trail[0].y) > max) {
      sn.trailLen -= Math.hypot(sn.trail[1].x - sn.trail[0].x, sn.trail[1].y - sn.trail[0].y);
      sn.trail.shift();
    }
  };
  function setExtra(n) { sn.extra = Math.max(0, n); sn.tlen = (BASE_CELLS + sn.extra) * CELL; if (reduced()) sn.len = sn.tlen; }
  function teleport(x, y) {
    cancelMove();
    sn.x = x; sn.y = y;
    sn.trail = [{ x, y }]; sn.trailLen = 0;
    if (follow) { cam.tx = x; cam.ty = y; }
    dirty = true;
  }
  function cancelMove() { if (mv) { const r = mv.res; mv = null; r(false); } }

  /** Move the head through points (board units). Resolves true when it arrives, false if cancelled. */
  function moveAlong(points, { speed = 1, onPoint } = {}) {
    cancelMove();
    const pts = points.map((p) => ({ x: p[0], y: p[1] }));
    if (reduced()) {
      for (const p of pts) { sn.x = p.x; sn.y = p.y; pushTrail(true); }
      if (pts.length > 1) { sn.dx = Math.sign(pts.at(-1).x - pts.at(-2).x); sn.dy = sn.dx ? 0 : Math.sign(pts.at(-1).y - pts.at(-2).y); }
      if (follow) { cam.tx = sn.x; cam.ty = sn.y; }
      dirty = true;
      return Promise.resolve(true);
    }
    return new Promise((res) => { mv = { pts, i: 0, res, speed, onPoint }; dirty = true; });
  }
  function advance(dist) {
    while (mv && dist > 0) {
      const t = mv.pts[mv.i];
      const dx = t.x - sn.x, dy = t.y - sn.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const ndx = dx / d, ndy = dy / d;
        if (ndx * sn.dx + ndy * sn.dy < 0.3) sn.squash = 1; // a turn: squash and stretch
        sn.dx = ndx; sn.dy = ndy;
      }
      if (d <= dist) {
        sn.x = t.x; sn.y = t.y; dist -= d; pushTrail(true);
        mv.onPoint?.(mv.i);
        mv.i++;
        if (mv.i >= mv.pts.length) { const r = mv.res; mv = null; r(true); }
      } else {
        sn.x += (dx / d) * dist; sn.y += (dy / d) * dist; dist = 0; pushTrail(false);
      }
    }
  }
  function bump(dir) {
    sn.bump = 1; sn.bumpDir = DIRS[dir] ?? [sn.dx, sn.dy]; sn.dizzy = 1;
    if (!reduced() && store.settings.shake) {
      wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
    }
    flash('bad');
  }
  function flash(kind) {
    wrap.classList.remove('flash-bad', 'flash-good');
    if (reduced()) return;
    void wrap.offsetWidth;
    wrap.classList.add(`flash-${kind}`);
    setTimeout(() => wrap.classList.remove(`flash-${kind}`), 380);
  }

  function drawSnake(now, dt) {
    sn.len += (sn.tlen - sn.len) * Math.min(1, dt / 90);
    if (Math.abs(sn.tlen - sn.len) < 0.05) sn.len = sn.tlen;
    sn.squash = Math.max(0, sn.squash - dt / 180);
    sn.bump = Math.max(0, sn.bump - dt / 260);
    sn.dizzy = Math.max(0, sn.dizzy - dt / 900);
    const bo = Math.sin(sn.bump * Math.PI) * 7;
    const hx = sn.x + sn.bumpDir[0] * bo, hy = sn.y + sn.bumpDir[1] * bo;
    // body: walk the trail backwards for `len` units
    const pts = [[hx, hy]];
    let acc = 0, px = sn.x, py = sn.y;
    for (let i = sn.trail.length - 1; i >= 0 && acc < sn.len; i--) {
      const p = sn.trail[i];
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < 0.01) continue;
      if (acc + d > sn.len) { const f = (sn.len - acc) / d; pts.push([px + (p.x - px) * f, py + (p.y - py) * f]); acc = sn.len; break; }
      pts.push([p.x, p.y]); acc += d; px = p.x; py = p.y;
    }
    if (pts.length < 2) pts.push([hx - sn.dx * 4, hy - sn.dy * 4]);
    const d = polyD(pts);
    sOut.setAttribute('d', d); sBody.setAttribute('d', d); sShade.setAttribute('d', d); sScale.setAttribute('d', d);
    const ang = Math.atan2(sn.dy, sn.dx) * 180 / Math.PI;
    head.setAttribute('transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${ang.toFixed(1)})`);
    const sq = reduced() ? 0 : sn.squash;
    hSq.setAttribute('transform', `scale(${(1 + 0.1 * sq).toFixed(3)} ${(1 - 0.1 * sq).toFixed(3)})`);
    head.classList.toggle('dizzy', sn.dizzy > 0);
    tongue.setAttribute('d', !reduced() && mv && Math.floor(now / 83) % 2 ? 'M8.6 0L14 0M14 0L16.5 -2M14 0L16.5 2' : 'M8.6 0L12 0');
    mHead.setAttribute('cx', sn.x); mHead.setAttribute('cy', sn.y);
  }

  // ---------- frame loop ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    if (mv) advance(SPEED * mv.speed * dt);
    if (follow) { cam.tx = sn.x; cam.ty = sn.y; cam.tz = followZoom; }
    const k = reduced() ? 1 : Math.min(1, dt / (follow ? 110 : 150));
    const nx = cam.x + (cam.tx - cam.x) * k, ny = cam.y + (cam.ty - cam.y) * k, nz = cam.z + (cam.tz - cam.z) * k;
    if (Math.abs(nx - cam.x) + Math.abs(ny - cam.y) + Math.abs(nz - cam.z) > 0.001 || dirty) {
      cam.x = nx; cam.y = ny; cam.z = nz;
      gCam.setAttribute('transform', `translate(${(W / 2 - cam.x * cam.z).toFixed(2)} ${(H / 2 - cam.y * cam.z).toFixed(2)}) scale(${cam.z.toFixed(4)})`);
      mView.setAttribute('x', cam.x - W / (2 * cam.z)); mView.setAttribute('y', cam.y - H / (2 * cam.z));
      mView.setAttribute('width', W / cam.z); mView.setAttribute('height', H / cam.z);
      dirty = false;
    }
    drawSnake(now, dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- marks ----------
  const cls = (e, c, v) => e.classList.toggle(c, !!v);
  const stationMark = {};
  function badgeFor(id) {
    if (stEls[id].badge) return stEls[id].badge;
    const [x, y] = stations[id].at, r = stations[id].r;
    const g = el('g', { class: 'badge', transform: `translate(${x + r * 0.78} ${y - r * 0.78})` }, gBadge);
    el('circle', { r: 5.4 }, g);
    const t = el('text', { 'text-anchor': 'middle', y: 2.2 }, g);
    stEls[id].badge = { g, t };
    return stEls[id].badge;
  }
  function setDim(set) {
    svg.classList.toggle('has-dim', !!set);
    for (const [id, e] of Object.entries(edgeEls)) cls(e.g, 'dim', set && !set.has(id));
  }
  /** route = steps [{station, answer}], leaf code. */
  function showRoute(steps, leaf) {
    clearRoute();
    const set = new Set();
    steps.forEach((s, i) => {
      const eid = edgeId(s.station, s.answer);
      set.add(eid);
      cls(edgeEls[eid].hl, 'on', true);
      cls(stEls[s.station].halo, s.answer ? 'yes' : 'no', true);
      const b = badgeFor(s.station);
      b.t.textContent = i + 1;
      cls(b.g, 'show', true);
    });
    if (leaf) cls(leafEls[leaf], 'on', true);
    setDim(set);
  }
  function clearRoute() {
    for (const e of Object.values(edgeEls)) { e.hl.classList.remove('on', 'focus'); }
    for (const s of Object.values(stEls)) { s.halo.classList.remove('yes', 'no', 'focus'); s.badge?.g.classList.remove('show'); }
    for (const g of Object.values(leafEls)) g.classList.remove('on');
    setDim(null);
  }
  function focusStep(stationId, answer) {
    for (const e of Object.values(edgeEls)) e.hl.classList.remove('focus');
    for (const s of Object.values(stEls)) s.halo.classList.remove('focus');
    if (stationId) {
      cls(stEls[stationId].halo, 'focus', true);
      cls(edgeEls[edgeId(stationId, answer)].hl, 'focus', true);
    }
  }
  function here(id) {
    for (const [k, s] of Object.entries(stEls)) cls(s.body, 'here', k === id);
  }
  const callouts = new Map();
  const strike = (id, v) => {
    cls(stEls[id].strike, 'on', v); cls(stEls[id].text, 'struck', v);
    if (!v) { callouts.get(id)?.remove(); callouts.delete(id); return; }
    if (callouts.has(id)) return;
    const s = stations[id], txt = s.test.join(' '), w = [...txt].length * 6.2 + 12;
    const g = el('g', { class: 'callout', transform: `translate(${s.at[0]} ${s.at[1] - s.r - 13})` }, gBadge);
    el('rect', { x: -w / 2, y: -8, width: w, height: 16, rx: 3 }, g);
    const t = el('text', { 'text-anchor': 'middle', y: 3.4 }, g);
    t.textContent = txt;
    callouts.set(id, g);
  };
  function clearMarks() {
    for (const id of Object.keys(stEls)) { strike(id, false); }
    for (const e of Object.values(edgeEls)) e.g.classList.remove('blocked');
    for (const m of blockMarks.values()) m.remove();
    blockMarks.clear();
  }
  const blockMarks = new Map();
  function block(eid, v) {
    cls(edgeEls[eid].g, 'blocked', v);
    if (v && !blockMarks.has(eid)) {
      const e = edges[eid], p = e.path[0], [vx, vy] = DIRS[e.dir];
      const st = stations[e.from];
      const dd = st.r + 13;
      const g = el('g', { class: 'block-mark', transform: `translate(${p[0] + vx * dd} ${p[1] + vy * dd})` }, gMark);
      el('circle', { r: 5 }, g);
      el('path', { d: 'M-2.6 -2.6L2.6 2.6M2.6 -2.6L-2.6 2.6' }, g);
      blockMarks.set(eid, g);
    }
    if (!v) { blockMarks.get(eid)?.remove(); blockMarks.delete(eid); }
  }
  function setFog(set) {
    for (const [code, g] of Object.entries(leafEls)) cls(g, 'fog', set && !set.has(code));
  }
  function mark(code, c, v) { cls(leafEls[code], c, v); }
  /** Which stations can take keyboard focus (others stay reachable by pointer). */
  function setTabbable(ids) {
    for (const [id, s] of Object.entries(stEls)) s.hit.setAttribute('tabindex', ids.has(id) ? 0 : -1);
  }

  const toScreen = (x, y) => {
    const r = svg.getBoundingClientRect();
    return { x: r.left + W / 2 + (x - cam.x) * cam.z, y: r.top + H / 2 + (y - cam.y) * cam.z };
  };

  // ---------- pointer input ----------
  let panMode = true;
  const ptrs = new Map();
  let pinch0 = 0, moved = 0, downAt = 0, startPt = null;
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startPt = { x: e.clientX, y: e.clientY };
    downAt = performance.now(); moved = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) { const r = svg.getBoundingClientRect(); zoomBy(d / pinch0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
      pinch0 = d;
    } else if (ptrs.size === 1 && panMode) {
      follow = false;
      cam.tx -= dx / cam.z; cam.ty -= dy / cam.z;
      cam.x = cam.tx; cam.y = cam.ty; dirty = true;
    }
  });
  const up = (e) => {
    const multi = ptrs.size > 1;
    ptrs.delete(e.pointerId);
    if (!panMode && !multi && startPt && performance.now() - downAt < 700) {
      const dx = e.clientX - startPt.x, dy = e.clientY - startPt.y;
      if (Math.hypot(dx, dy) > 28) on.swipe?.(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd'));
    }
    if (!ptrs.size) pinch0 = 0;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  svg.addEventListener('click', (e) => {
    if (moved > 12) return; // a drag or swipe, not a tap
    const st = e.target.closest?.('[data-st]'), lf = e.target.closest?.('[data-lf]');
    if (st) on.station?.(st.dataset.st);
    else if (lf) on.leaf?.(lf.dataset.lf);
  });
  svg.addEventListener('keydown', (e) => {
    const st = e.target.closest?.('[data-st]');
    if (st && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); on.station?.(st.dataset.st); }
  });
  const hov = (e) => { const st = e.target.closest?.('[data-st]'); on.hover?.(st ? st.dataset.st : null); };
  svg.addEventListener('pointerover', hov);
  svg.addEventListener('pointerout', () => on.hover?.(null));
  svg.addEventListener('focusin', hov);
  svg.addEventListener('focusout', () => on.hover?.(null));

  return {
    on, graph, stationEls: stEls,
    nodePos, bboxOf,
    overview, frame, zoomBy, setFollow, teleport, moveAlong, cancelMove, setExtra, bump, flash,
    get extra() { return sn.extra; },
    get head() { return { x: sn.x, y: sn.y }; },
    get moving() { return !!mv; },
    get zoom() { return cam.tz; },
    get fit() { return fitZoom(); },
    setPanMode(v) { panMode = v; },
    showRoute, clearRoute, focusStep, here, strike, clearMarks, block, setFog, mark, setTabbable, setDim,
    toScreen, headScreen: () => toScreen(sn.x, sn.y),
    refresh() { dirty = true; },
  };
}
