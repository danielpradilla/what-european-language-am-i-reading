// Label placement for the Europe map. Pure geometry, no DOM: boxes are { x, y, w, h } in world units.

/** Wrap a label on spaces and slashes into lines of at most `max` characters. */
export function wrapLabel(text, max = 18) {
  const tokens = text.split(/(?<=\/)|(?<= )/);
  const lines = [];
  let cur = '';
  for (const t of tokens) {
    if (cur && [...(cur + t).trimEnd()].length > max) { lines.push(cur.trimEnd()); cur = t; } else cur += t;
  }
  if (cur) lines.push(cur.trimEnd());
  return lines;
}

export const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const outside = (c, bounds) => c.x < 0 || c.y < 0 || c.x + c.w > bounds.w || c.y + c.h > bounds.h;

/** The 8 places around a flag centred on (cx, cy) with half size `half`, for a box of w x h. Order = preference. */
export function candidates(cx, cy, half, w, h, gap = 3) {
  const r = cx + half + gap, l = cx - half - gap - w, b = cy + half + gap, t = cy - half - gap - h;
  return [
    { side: 'r', x: r, y: cy - h / 2, pen: 0 },
    { side: 'b', x: cx - w / 2, y: b, pen: 0.4 },
    { side: 'l', x: l, y: cy - h / 2, pen: 0.8 },
    { side: 't', x: cx - w / 2, y: t, pen: 1 },
    { side: 'br', x: cx + half * 0.6, y: b, pen: 1.6 },
    { side: 'bl', x: cx - half * 0.6 - w, y: b, pen: 1.8 },
    { side: 'tr', x: cx + half * 0.6, y: t, pen: 2 },
    { side: 'tl', x: cx - half * 0.6 - w, y: t, pen: 2.2 },
  ].map((c) => ({ ...c, w, h }));
}

/** Sample points along polylines, one every ~6 units. */
export function samplePoints(lines) {
  const pts = [];
  for (const pl of lines) {
    for (let i = 1; i < pl.length; i++) {
      const [ax, ay] = pl[i - 1], [bx, by] = pl[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
      for (let k = 0; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
  }
  return pts;
}

/**
 * Greedy placement of station labels, then a few relaxation passes.
 * items: [{ id, cx, cy, w, h, half? }]; fixed: boxes labels must stay clear of (flags, line badges);
 * pts: samplePoints() of the lines, which labels prefer not to cross; bounds: { w, h }.
 * Returns { id: { side, x, y, w, h, overlaps } }.
 */
export function placeLabels({ items, fixed, pts, bounds, half }) {
  const placed = {};
  const cost = (c, id) => {
    let v = c.pen;
    if (outside(c, bounds)) v += 500;
    for (const f of fixed) if (hit(c, f)) v += 1000 + area(c, f);
    for (const [k, p] of Object.entries(placed)) if (k !== id && hit(c, p)) v += 1000 + area(c, p);
    for (const [x, y] of pts) if (x > c.x - 3 && x < c.x + c.w + 3 && y > c.y - 3 && y < c.y + c.h + 3) v += 1;
    return v;
  };
  const pick = (it) => {
    let best = null;
    for (const c of candidates(it.cx, it.cy, it.half ?? half, it.w, it.h)) {
      const v = cost(c, it.id);
      if (!best || v < best.v) best = { ...c, v };
    }
    return best;
  };
  // most crowded first
  const crowd = (it) => items.reduce((n, o) => n + (o !== it && Math.hypot(o.cx - it.cx, o.cy - it.cy) < half * 5 ? 1 : 0), 0);
  const order = [...items].sort((a, b) => crowd(b) - crowd(a));
  for (const it of order) placed[it.id] = pick(it);
  for (let pass = 0; pass < 4; pass++) for (const it of order) placed[it.id] = pick(it);
  for (const [id, p] of Object.entries(placed)) p.overlaps = cost(p, id) >= 1000;
  return placed;
}

/** Best free box among candidate boxes for an optional item (tag, badge); null when none is free. */
export function placeOptional(boxes, { fixed, taken, bounds, pts }) {
  let best = null;
  for (const b of boxes) {
    if (outside(b, bounds) || fixed.some((f) => hit(b, f)) || taken.some((f) => hit(b, f))) continue;
    const v = (b.pen ?? 0) + (pts ? pts.filter(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h).length : 0);
    if (!best || v < best.v) best = { ...b, v };
  }
  return best;
}
