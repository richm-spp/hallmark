/**
 * A minimal CSS reader — enough structure for the gate checks, no dependencies.
 *
 * Regex over raw CSS gets the easy cases and lies about the rest: it can't tell
 * a declaration inside `@media (prefers-reduced-motion)` from one outside it,
 * and that distinction is the whole point of several gates. So we parse into
 * rules carrying their at-rule context.
 */

/** Blank out comments while preserving newlines, so line numbers stay honest. */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Byte offset → 1-indexed line, precomputed so lookups stay O(log n). */
function lineIndexer(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Split on a separator that appears at paren-depth zero. */
function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === sep && depth === 0) {
      out.push([start, text.slice(start, i)]);
      start = i + 1;
    }
  }
  if (start < text.length) out.push([start, text.slice(start)]);
  return out;
}

function parseDecls(body, bodyStart, lineOf) {
  const decls = [];
  for (const [offset, chunk] of splitTopLevel(body, ';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1) continue;
    const prop = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();
    if (!prop || prop.startsWith('@') || !value) continue;
    decls.push({ prop, value, line: lineOf(bodyStart + offset + chunk.indexOf(chunk.trimStart())) });
  }
  return decls;
}

/**
 * @returns {Array<{selectors: string[], decls: Array<{prop,value,line}>, at: string[], line: number}>}
 *   `at` is the stack of enclosing at-rule preludes, outermost first.
 */
export function parseCss(css) {
  const src = stripComments(css.replace(/\r\n/g, '\n'));
  const lineOf = lineIndexer(src);
  const rules = [];
  const atStack = [];
  let buf = '';
  let bufStart = 0;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '{') {
      const prelude = buf.trim();
      if (prelude.startsWith('@')) {
        // Conditional group rule (@media, @supports, @layer): descend into it.
        atStack.push(prelude.replace(/\s+/g, ' '));
        buf = '';
        bufStart = i + 1;
        i++;
        continue;
      }
      // Ordinary rule: consume to its matching close brace.
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const body = src.slice(i + 1, j - 1);
      rules.push({
        selectors: splitTopLevel(prelude, ',').map(([, s]) => s.trim()).filter(Boolean),
        decls: parseDecls(body, i + 1, lineOf),
        at: [...atStack],
        line: lineOf(i),
      });
      buf = '';
      bufStart = j;
      i = j;
      continue;
    }

    if (ch === '}') {
      atStack.pop();
      buf = '';
      bufStart = i + 1;
      i++;
      continue;
    }

    if (buf === '') bufStart = i;
    buf += ch;
    i++;
  }

  return rules;
}

/** Pull `<style>` bodies out of an HTML document, with their line offsets. */
export function extractStyleBlocks(html) {
  const src = html.replace(/\r\n/g, '\n');
  const lineOf = lineIndexer(src);
  const blocks = [];
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    blocks.push({ css: m[1], startLine: lineOf(m.index) });
  }
  return blocks;
}

/** Parse an OKLCH / hex / rgb colour far enough to read its chroma. */
export function oklchChroma(value) {
  const m = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  return m ? Number(m[2]) : null;
}

/**
 * WCAG 2.x relative luminance for a #hex or oklch() colour, or null when the
 * value isn't a parseable single colour. OKLCH goes through OKLab → linear
 * sRGB (Björn Ottosson's matrices); hex through the sRGB transfer function.
 */
export function relativeLuminance(value) {
  const v = String(value).trim();

  const hex = v.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const [r, g, b] = hex.match(/../g).map((x) => lin(parseInt(x, 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const ok = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i);
  if (ok) {
    const L = Number(ok[1]) / (ok[2] ? 100 : 1);
    const C = Number(ok[3]);
    const H = (Number(ok[4]) * Math.PI) / 180;
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const clamp = (x) => Math.min(1, Math.max(0, x));
    const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    const bb = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  }

  return null;
}

/** WCAG contrast ratio between two colours, or null if either doesn't parse. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
