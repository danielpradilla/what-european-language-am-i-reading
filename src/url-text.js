// Fetch a page through api/fetch.php and extract readable text from its HTML (SPEC 4.2).
const DROP = 'script,style,noscript,template,nav,header,footer,aside,form,svg,sup.reference,.mw-editsection,.navbox,.printfooter';
const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'TABLE', 'PRE', 'DT', 'DD', 'FIGCAPTION', 'BR', 'HR']);

/** True when the trimmed text is a single http(s) URL with no whitespace. */
export const isUrl = (text) => /^https?:\/\/\S+$/i.test(text.trim());

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(DROP).forEach((el) => el.remove());
  const root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
  let out = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.nodeValue.replace(/\s+/g, ' '); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const block = BLOCK.has(node.tagName);
    if (block) out += '\n';
    node.childNodes.forEach(walk);
    if (block) out += '\n';
  };
  walk(root);
  const text = out.split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, lang: doc.documentElement.getAttribute('lang') || '' };
}

/** Resolves to { text, lang, finalUrl }; rejects with an Error whose message is shown to the player. */
export async function fetchText(url) {
  let res;
  try {
    res = await fetch(`api/fetch.php?url=${encodeURIComponent(url.trim())}`);
  } catch {
    throw new Error('Could not reach the fetch service. Check your connection.');
  }
  let data;
  try { data = await res.json(); } catch { throw new Error(`The fetch service answered with an error (${res.status}).`); }
  if (data.error || !res.ok) throw new Error(data.error || `The page answered with an error (${res.status}).`);
  const { text, lang } = htmlToText(data.html);
  if (!text) throw new Error('That page has no readable text.');
  return { text, lang, finalUrl: data.finalUrl };
}
