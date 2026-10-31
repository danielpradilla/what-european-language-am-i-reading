// Text panel: contenteditable plaintext, CSS Custom Highlight API ranges, step badges (SPEC 4.1, 5.2).
export const MAX_CHARS = 200000;

export function createTextPanel({ edit, badgesEl, onInput }) {
  let timer = 0;
  let nodes = [];
  let badgeList = [];
  let lastText = null;

  const text = () => edit.textContent;

  /** Text nodes with their UTF-16 start offsets. */
  function index() {
    nodes = [];
    const w = document.createTreeWalker(edit, NodeFilter.SHOW_TEXT);
    let pos = 0;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      nodes.push({ node: n, start: pos });
      pos += n.nodeValue.length;
    }
    return pos;
  }
  function locate(offset) {
    let lo = 0, hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start <= offset) lo = mid; else hi = mid - 1;
    }
    const e = nodes[lo];
    return e ? [e.node, Math.min(offset - e.start, e.node.nodeValue.length)] : null;
  }
  function range(start, end) {
    const a = locate(start), b = locate(end);
    if (!a || !b) return null;
    const r = new Range();
    r.setStart(...a);
    r.setEnd(...b);
    return r;
  }

  const hl = {};
  function setHighlight(name, hits) {
    index();
    const ranges = [];
    for (const h of hits) { const r = range(h.start, h.end); if (r) ranges.push(r); }
    if (!ranges.length) { CSS.highlights.delete(name); return; }
    hl[name] = new Highlight(...ranges);
    CSS.highlights.set(name, hl[name]);
  }
  const clearHighlight = (name) => CSS.highlights.delete(name);

  function scrollTo(offset) {
    index();
    const r = range(offset, offset + 1);
    if (!r) return;
    const box = r.getBoundingClientRect();
    const host = edit.getBoundingClientRect();
    if (box.top < host.top + 8 || box.bottom > host.bottom - 8) {
      edit.scrollTop += box.top - host.top - host.height / 3;
    }
    placeBadges();
  }

  /** Badges: [{ n, offset, label?, tone? }] drawn at the start of the character at offset. */
  function setBadges(list) { badgeList = list; index(); placeBadges(); }
  function placeBadges() {
    badgesEl.textContent = '';
    const host = edit.getBoundingClientRect();
    for (const b of badgeList) {
      const r = range(b.offset, b.offset + 1);
      if (!r) continue;
      const box = r.getBoundingClientRect();
      if (box.bottom < host.top || box.top > host.bottom) continue;
      const el = document.createElement('span');
      el.className = `tp-badge${b.tone ? ` is-${b.tone}` : ''}${b.label ? ' is-label' : ''}`;
      el.textContent = b.label ?? b.n;
      el.style.left = `${Math.max(0, box.left - host.left)}px`;
      el.style.top = `${box.top - host.top - 14}px`;
      badgesEl.append(el);
    }
  }
  edit.addEventListener('scroll', placeBadges, { passive: true });
  new ResizeObserver(placeBadges).observe(edit);

  function clearAll() {
    for (const n of ['hl-y', 'hl-focus', 'hl-err', 'hl-new']) CSS.highlights.delete(n);
    setBadges([]);
  }

  function emit(user, inputType) {
    let t = text();
    let truncated = false;
    if (t.length > MAX_CHARS) { t = t.slice(0, MAX_CHARS); edit.textContent = t; truncated = true; }
    const prev = lastText;
    lastText = t;
    onInput(t, { user, prev, truncated, inputType });
  }
  edit.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => emit(true, e.inputType), 120);
  });

  return {
    edit,
    text,
    /** Replace the content; fires onInput at once (not as a user edit). */
    setText(t) { clearTimeout(timer); edit.textContent = t; edit.scrollTop = 0; emit(false); },
    setEditable(on) { edit.contentEditable = on ? 'plaintext-only' : 'false'; },
    setHighlight, clearHighlight, clearAll, scrollTo, setBadges, placeBadges,
    /** Client rect of the first character of a hit, or null. */
    rectOf(offset, end = offset + 1) { index(); return range(offset, end)?.getBoundingClientRect() ?? null; },
    flush() { clearTimeout(timer); emit(true); },
    focus: () => edit.focus(),
  };
}
