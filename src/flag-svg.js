// A flag drawn into an SVG <g> centred on (0,0): one tile, 2x2 tiles, three regional flags, or the Yiddish chai.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.append(e);
  return e;
};

/** info: flags.json leaf { files, layout }; s: side length; aspect: width/height per flag file. */
export function drawFlag(g, info, s, aspect) {
  const h = s / 2;
  const tile = (file, tx, ty, tw, th) => {
    const n = el('svg', { x: tx, y: ty, width: tw, height: th, class: 'flag-img' }, g);
    const a = aspect[file] || 1.5;
    const iw = a > tw / th ? th * a : tw, ih = a > tw / th ? th : tw / a;
    el('image', { href: `assets/flags/${file}`, x: (tw - iw) / 2, y: (th - ih) / 2, width: iw, height: ih, preserveAspectRatio: 'none' }, n);
  };
  if (info.layout === 'chai') {
    el('rect', { x: -h, y: -h, width: s, height: s, fill: '#fffaee' }, g);
    el('text', { x: 0, y: 0, class: 'chai', 'text-anchor': 'middle', 'font-size': s * 0.6, 'dominant-baseline': 'central' }, g).textContent = 'חי';
  } else if (info.layout === '2x2') {
    info.files.forEach((f, i) => tile(f, -h + (i % 2) * h, -h + Math.floor(i / 2) * h, h, h));
  } else if (info.layout === '3up') {
    info.files.forEach((f, i) => tile(f, -h + (i * s) / 3, -h, s / 3, s));
  } else {
    tile(info.files[0], -h, -h, s, s);
  }
}
