/**
 * Low-level building blocks for the terminal-style SVG cards.
 *
 * Plain string templating: no DOM, no dependencies. GitHub serves README
 * images through <img>, which strips scripts and external resources, so every
 * SVG must be fully self-contained (inline CSS, system fonts only).
 */

export const THEMES = {
  dark: {
    name: 'dark',
    bg: '#0d1117',
    chrome: '#161b22',
    border: '#30363d',
    text: '#e6edf3',
    muted: '#8b949e',
    accent: '#39d353',
    link: '#58a6ff',
    warn: '#d29922',
    heat: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    ansi: ['#484f58', '#ff7b72', '#3fb950', '#d29922', '#58a6ff', '#bc8cff', '#39c5cf', '#b1bac4'],
  },
  light: {
    name: 'light',
    bg: '#ffffff',
    chrome: '#f6f8fa',
    border: '#d0d7de',
    text: '#1f2328',
    muted: '#59636e',
    accent: '#1a7f37',
    link: '#0969da',
    warn: '#9a6700',
    heat: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    ansi: ['#24292f', '#cf222e', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#1b7c83', '#6e7781'],
  },
};

// Advance width of one monospace glyph as a fraction of the font size.
// SF Mono, Menlo, Consolas and DejaVu Sans Mono sit between 0.55 and 0.60,
// so 0.61 keeps the layout maths on the safe side: text can only end up
// slightly shorter than planned, never wider than its window.
const ADVANCE = 0.61;

function layout(name, width, fs, small, pad) {
  return {
    name,
    width,
    fs,
    small,
    pad,
    cw: fs * ADVANCE, // character cell width
    scw: small * ADVANCE, // character cell width of the small font
    lh: Math.round(fs * 1.6), // line height
    base: Math.round(fs * 1.15), // baseline offset inside a line
  };
}

/** `wide` targets the desktop README column, `narrow` phones (≤ 600 px). */
export const LAYOUTS = {
  wide: layout('wide', 840, 14, 11, 22),
  narrow: layout('narrow', 420, 13, 10, 16),
};

export const TITLE_H = 34;
const DOTS = ['#ff5f57', '#febc2e', '#28c840'];
const FONT =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace";

/** Rounds to 2 decimals to keep the markup small and deterministic. */
export const r = (n) => Math.round(n * 100) / 100;

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const fmt = (n) => n.toLocaleString('en-US');

/** Width in character cells; astral code points (emoji) take two cells. */
export function textWidth(s) {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0) > 0xffff ? 2 : 1;
  return w;
}

/**
 * Word-wraps coloured segments ([[cls, text], ...]) to `cols` cells.
 * Segment boundaries inside a word (e.g. "Veldor Time" followed by ",") are
 * kept glued together, so colours never cause a bad break.
 */
export function wrapSegs(segs, cols) {
  // 1. Split into words; a word is a list of [cls, text] tokens.
  const words = [];
  let glue = false; // true while the next token continues the current word
  for (const [cls, text] of segs) {
    for (const part of text.split(/( +)/)) {
      if (part === '') continue;
      if (part.trim() === '') {
        glue = false;
        continue;
      }
      if (glue) words.at(-1).push([cls, part]);
      else words.push([[cls, part]]);
      glue = true;
    }
  }

  // 2. Greedy line filling (a single word longer than a line gets hard-split).
  const lines = [];
  let line = [];
  let used = 0;
  const flush = () => {
    if (line.length) lines.push(line);
    line = [];
    used = 0;
  };
  for (let word of words) {
    let w = word.reduce((n, [, t]) => n + textWidth(t), 0);
    if (w > cols) {
      const [cls, text] = [word[0][0], word.map(([, t]) => t).join('')];
      flush();
      for (let i = 0; i < text.length; i += cols) lines.push([[[cls, text.slice(i, i + cols)]]]);
      continue;
    }
    if (used && used + 1 + w > cols) flush();
    if (used) line.push([[word[0][0], ' ']]);
    line.push(word);
    used += (used ? 1 : 0) + w;
  }
  flush();

  // 3. Merge consecutive tokens of the same class back into segments.
  return lines.map((ws) => {
    const out = [];
    for (const [cls, text] of ws.flat()) {
      if (out.length && out.at(-1)[0] === cls) out.at(-1)[1] += text;
      else out.push([cls, text]);
    }
    return out;
  });
}

/** Schedules the typing animation: each line starts when the previous ends. */
export class Typewriter {
  constructor({ start = 0.6, speed = 0.028, pause = 0.15 } = {}) {
    Object.assign(this, { t: start, speed, pause });
  }
  next(chars) {
    const delay = r(this.t);
    const dur = r(Math.max(chars, 1) * this.speed);
    this.t += dur + this.pause;
    return { delay, dur };
  }
}

/**
 * The text area of one terminal window. Lines are stacked top to bottom and
 * every line is checked against the window width, so an overflowing layout
 * fails the build instead of silently clipping on GitHub.
 */
export class Screen {
  constructor(L, width, id = 's') {
    this.L = L;
    this.id = id;
    this.inner = width - 2 * L.pad;
    this.cols = Math.floor(this.inner / L.cw);
    this.y = 0;
    this.parts = [];
    this.css = [];
    this.n = 0;
  }

  x(col) {
    return r(col * this.L.cw);
  }

  /**
   * One line of segments: [[cls, text, col?], ...]. Returns the end column.
   * `fit` stretches the line to exactly its planned width (textLength), so
   * anything positioned after it (cursors) lines up whatever the real font.
   */
  line(segs, { type, fit = Boolean(type) } = {}) {
    let col = 0;
    let plain = '';
    let spans = '';
    for (const [cls, text, at] of segs) {
      if (at !== undefined) {
        if (at < col) throw new Error(`[${this.id}] segment overlaps at col ${at}: "${plain}${text}"`);
        col = at;
      }
      const pos = at !== undefined ? ` x="${this.x(at)}"` : '';
      spans += `<tspan${pos} class="${cls}">${esc(text)}</tspan>`;
      col += textWidth(text);
      plain += text;
    }
    this.assertFits(col, plain);
    const len = fit ? ` textLength="${this.x(col)}" lengthAdjust="spacing"` : '';
    this.parts.push(`<text y="${r(this.y + this.L.base)}"${len}>${spans}</text>`);
    if (type) this.typewriter(col, type);
    this.y += this.L.lh;
    return col;
  }

  /**
   * A wrapped paragraph. `lead` is drawn on the first line only (e.g. a log
   * tag) and every line of the text starts at column `indent`.
   */
  para(segs, { indent = 0, lead = [] } = {}) {
    if (typeof segs === 'string') segs = [['t', segs]];
    wrapSegs(segs, this.cols - indent).forEach((ln, i) => {
      const body = ln.map(([cls, text], j) => (j === 0 && indent ? [cls, text, indent] : [cls, text]));
      this.line(i === 0 ? [...lead, ...body] : body);
    });
  }

  /**
   * Hides a line behind a background-coloured cover that slides right one
   * character per step, with a block cursor riding on its left edge.
   */
  typewriter(chars, { tw, last }) {
    const { L } = this;
    const { delay, dur } = tw.next(chars);
    const id = `${this.id}t${this.n++}`;
    this.css.push(`@keyframes ${id}{to{transform:translateX(${this.x(chars)}px)}}`);
    const cursor = last
      ? `on 0s ${delay}s forwards,blink 1.1s step-end ${r(delay + dur)}s infinite`
      : `on 0s ${delay}s forwards,off 0s ${r(delay + dur + tw.pause)}s forwards`;
    this.parts.push(
      `<g class="cover" style="animation:${id} ${dur}s steps(${chars},end) ${delay}s forwards">` +
        `<rect class="cv" x="-2" y="${r(this.y)}" width="${r(this.inner + 4)}" height="${L.lh}"/>` +
        `<rect class="cur" y="${r(this.y + 3)}" width="${r(L.cw)}" height="${L.lh - 6}" style="animation:${cursor}"/>` +
        `</g>`,
    );
  }

  /** Arbitrary SVG markup occupying `h` pixels, positioned at the current line. */
  raw(svg, h) {
    this.parts.push(`<g transform="translate(0,${r(this.y)})">${svg}</g>`);
    this.y += h;
  }

  gap(f = 0.5) {
    this.y += this.L.lh * f;
  }

  rule({ dashed = false } = {}) {
    const y = r(this.y + this.L.lh * 0.3);
    this.parts.push(`<line class="rule${dashed ? ' dash' : ''}" x1="0" x2="${r(this.inner)}" y1="${y}" y2="${y}"/>`);
    this.y += this.L.lh * 0.6;
  }

  assertFits(cols, label) {
    if (cols > this.cols) throw new Error(`[${this.id}] line overflows (${cols}/${this.cols} cols): "${label}"`);
  }
}

const topPad = (L) => Math.round(L.pad * 0.7);
const bottomPad = (L) => Math.round(L.pad * 0.8);

export const windowHeight = (screen) => Math.ceil(TITLE_H + topPad(screen.L) + screen.y + bottomPad(screen.L));

/** A macOS-style terminal window (title bar, traffic lights) around a Screen. */
export function terminal({ screen, title, t, x = 0, y = 0, w, h = windowHeight(screen) }) {
  const { L } = screen;
  const maxTitle = Math.floor((w - 160) / (12 * ADVANCE));
  const label = title.length > maxTitle ? `${title.slice(0, maxTitle - 1)}…` : title;
  const clip = `${screen.id}clip`;
  const bar = `M0.5 ${TITLE_H}V10.5A10 10 0 0 1 10.5 0.5H${w - 10.5}A10 10 0 0 1 ${w - 0.5} 10.5V${TITLE_H}Z`;
  return (
    `<g transform="translate(${r(x)},${r(y)})">` +
    `<rect width="${w}" height="${h}" rx="10" fill="${t.bg}"/>` +
    `<path d="${bar}" fill="${t.chrome}"/>` +
    `<line x1="0.5" x2="${w - 0.5}" y1="${TITLE_H}" y2="${TITLE_H}" stroke="${t.border}"/>` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${t.border}"/>` +
    DOTS.map((c, i) => `<circle cx="${18 + i * 20}" cy="${TITLE_H / 2}" r="6" fill="${c}"/>`).join('') +
    `<text class="ttl" x="${w / 2}" y="${TITLE_H / 2 + 4}" text-anchor="middle">${esc(label)}</text>` +
    `<clipPath id="${clip}"><rect x="-4" y="-4" width="${r(screen.inner + 8)}" height="${r(screen.y + 8)}"/></clipPath>` +
    `<g transform="translate(${L.pad},${TITLE_H + topPad(L)})" clip-path="url(#${clip})">${screen.parts.join('')}</g>` +
    `</g>`
  );
}

/** Wraps window markup into a standalone SVG document with the theme CSS. */
export function doc({ L, t, width, height, label, body, css = [] }) {
  const style = [
    `text{font-family:${FONT};font-size:${L.fs}px;white-space:pre}`,
    `.t{fill:${t.text}}.m{fill:${t.muted}}.a{fill:${t.accent}}.b{fill:${t.link}}.w{fill:${t.warn}}.bo{font-weight:700}`,
    `.ttl{font-size:12px;fill:${t.muted}}.sm{font-size:${L.small}px;fill:${t.muted}}`,
    `.rule{stroke:${t.border}}.dash{stroke-dasharray:3 4}`,
    `.cv{fill:${t.bg}}.cur{fill:${t.accent};opacity:0}.blink{fill:${t.accent};animation:blink 1.1s step-end infinite}`,
    `.wk{opacity:0;animation:fade .5s ease-out forwards}`,
    `@keyframes fade{to{opacity:1}}@keyframes on{to{opacity:1}}@keyframes off{to{opacity:0}}`,
    `@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}`,
    ...css,
    `@media (prefers-reduced-motion:reduce){.cover{display:none}.wk{opacity:1;animation:none}.blink{animation:none}}`,
  ].join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `role="img" aria-label="${esc(label)}" xml:space="preserve">` +
    `<title>${esc(label)}</title><style>${style}</style>${body}</svg>\n`
  );
}
