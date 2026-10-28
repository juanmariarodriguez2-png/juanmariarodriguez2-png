/**
 * One renderer per README section. Each takes a layout (wide | narrow),
 * a theme (dark | light) and the GitHub stats, and returns an SVG document.
 */

import * as C from '../content.mjs';
import { Screen, Typewriter, doc, esc, fmt, r, terminal, textWidth, windowHeight, wrapSegs } from './svg.mjs';

/** `juan@github ~ $ <cmd>` */
const prompt = (cmd) => [
  ['a bo', `${C.PROMPT.user}@${C.PROMPT.host}`],
  ['m', ` ${C.PROMPT.path} `],
  ['b', '$'],
  ['t', ` ${cmd}`],
];

/** Renders a section made of a single full-width window. */
function single(L, t, { title, label, build }) {
  const screen = new Screen(L, L.width);
  build(screen);
  const h = windowHeight(screen);
  return doc({ L, t, width: L.width, height: h, label, css: screen.css, body: terminal({ screen, title, t, w: L.width, h }) });
}

// ---------------------------------------------------------------------------
// 1. ./contributions.sh
// ---------------------------------------------------------------------------

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** GitHub-style calendar: one column per week, columns fade in left to right. */
function heatmap(weeks, L, t, inner) {
  const wide = L.name === 'wide';
  const labelW = wide ? 32 : 12;
  const step = Math.min(wide ? 15 : 8, Math.floor(((inner - labelW) / weeks.length) * 10) / 10);
  const cell = r(step * 0.8);
  const top = L.small + 8;
  if (labelW + weeks.length * step > inner) throw new Error('heatmap overflows its window');

  // Month labels where the month changes; skip ones that would collide.
  const starts = [];
  weeks.forEach((w, i) => {
    const m = new Date(`${w.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
    if (i === 0 || m !== starts.at(-1).m) starts.push({ i, m });
  });
  if (starts.length > 1 && starts[1].i < 3) starts.shift(); // partial first month
  let out = '';
  let lastX = -Infinity;
  for (const { i, m } of starts) {
    const x = labelW + i * step;
    if (x - lastX < 3.5 * L.scw + 4) continue;
    out += `<text class="sm" x="${r(x)}" y="${L.small}">${MONTHS[m]}</text>`;
    lastX = x;
  }

  // Weekday labels (Mon / Wed / Fri, like GitHub).
  for (const [row, name] of [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]) {
    const y = top + row * step + cell - 1;
    out += `<text class="sm" x="0" y="${r(y)}">${wide ? name : name[0]}</text>`;
  }

  weeks.forEach((w, i) => {
    out += `<g class="wk" style="animation-delay:${r(i * 0.012)}s">`;
    for (const d of w.contributionDays) {
      const fill = t.heat[LEVELS[d.contributionLevel] ?? 0];
      out += `<rect x="${r(labelW + i * step)}" y="${r(top + d.weekday * step)}" width="${cell}" height="${cell}" rx="2" fill="${fill}"/>`;
    }
    out += '</g>';
  });
  return { svg: out, h: top + 6 * step + cell };
}

/** "Less ■■■■■ More", vertically centred on a text line. */
function heatLegend(L, t) {
  const cell = L.name === 'wide' ? 11 : 8;
  const gap = 3;
  const y = (L.lh - cell) / 2;
  let x = 4 * L.scw + 6;
  let svg = `<text class="sm" x="0" y="${r(L.base)}">Less</text>`;
  for (const fill of t.heat) {
    svg += `<rect x="${r(x)}" y="${r(y)}" width="${cell}" height="${cell}" rx="2" fill="${fill}"/>`;
    x += cell + gap;
  }
  svg += `<text class="sm" x="${r(x + 3)}" y="${r(L.base)}">More</text>`;
  return { svg, w: x + 3 + 4 * L.scw };
}

export function contributions(L, t, d) {
  return single(L, t, {
    title: 'contributions.sh — zsh',
    label: `${fmt(d.total)} contributions in the last year`,
    build(s) {
      s.line(prompt('./contributions.sh'));
      s.gap(0.4);
      const map = heatmap(d.weeks, L, t, s.inner);
      s.raw(map.svg, map.h);
      s.gap(0.5);

      const y = s.y;
      const end = s.line([['a bo', fmt(d.total)], ['t', ' contributions in the last year']]);
      const legend = heatLegend(L, t);
      if (s.x(end) + 24 + legend.w <= s.inner) {
        s.parts.push(`<g transform="translate(${r(s.inner - legend.w)},${r(y)})">${legend.svg}</g>`);
      } else {
        s.raw(legend.svg, L.lh);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// 2. whoami (typed intro) + neofetch (live stats), side by side
// ---------------------------------------------------------------------------

function introScreen(L, w) {
  const s = new Screen(L, w, 'intro');
  s.line(prompt('whoami'));
  s.gap(0.4);

  // Collect lines first so the typewriter knows which one is last.
  const lines = [
    [['t bo', C.intro.greeting]],
    null,
    ...wrapSegs([['t', C.intro.role]], s.cols),
    [['m', 'Founder of '], ['a bo', C.intro.founder]],
    null,
    ...wrapSegs([['m', C.intro.pitch]], s.cols),
  ];
  const lastIdx = lines.findLastIndex(Boolean);
  const tw = new Typewriter();
  lines.forEach((segs, i) => (segs ? s.line(segs, { type: { tw, last: i === lastIdx } }) : s.gap(0.5)));
  return s;
}

function statsScreen(L, w, t, d) {
  const s = new Screen(L, w, 'neo');
  s.line(prompt('neofetch'));
  s.gap(0.4);
  s.line([['a bo', C.PROMPT.user], ['t', '@'], ['a bo', C.PROMPT.host]]);
  s.line([['m', '-'.repeat(C.PROMPT.user.length + C.PROMPT.host.length + 1)]]);

  const K = 12; // value column
  const rows = [
    ['Repos', fmt(d.repos)],
    ['Commits', `${fmt(d.commitsYear)} in ${d.year}`],
    ['Contribs', `${fmt(d.total)} in the last year`],
    ['Streak', `${d.streak} ${d.streak === 1 ? 'day' : 'days'} (current)`],
    ['Best', `${d.longest} ${d.longest === 1 ? 'day' : 'days'} (last year)`],
    ['Languages', d.languages.filter((l) => l.name !== 'Other').map((l) => l.name).join(', ') || 'n/a'],
  ];
  for (const [key, value] of rows) s.para([['t', value]], { indent: K, lead: [['a bo', key], ['m', ':']] });

  if (d.languages.length) {
    // Proportional language bar…
    s.gap(0.4);
    const barH = 8;
    let x = 0;
    let bar = `<clipPath id="langbar"><rect width="${r(s.inner)}" height="${barH}" rx="4"/></clipPath><g clip-path="url(#langbar)">`;
    for (const l of d.languages) {
      const w = (s.inner * l.pct) / 100;
      bar += `<rect x="${r(x)}" width="${r(w + 0.5)}" height="${barH}" fill="${l.color}"/>`;
      x += w;
    }
    s.raw(`${bar}</g>`, barH + 6);

    // …and its legend, flowed into as many lines as needed.
    const items = d.languages.map((l) => ({ ...l, label: `${l.name} ${l.pct.toFixed(1)}%` }));
    let row = [];
    let col = 0;
    const flushRow = () => {
      if (!row.length) return;
      const cy = r(s.y + L.lh / 2);
      for (const it of row) s.parts.push(`<circle cx="${r(s.x(it.col) + L.cw * 0.45)}" cy="${cy}" r="4" fill="${it.color}"/>`);
      s.line(row.flatMap((it) => [['t', it.name, it.col + 2], ['m', ` ${it.pct.toFixed(1)}%`]]));
      row = [];
      col = 0;
    };
    for (const it of items) {
      const w = 2 + textWidth(it.label);
      if (col && col + w > s.cols) flushRow();
      row.push({ ...it, col });
      col += w + 2;
    }
    flushRow();
  }

  // The neofetch colour palette strip.
  s.gap(0.4);
  const bw = r(L.cw * 2.4);
  s.raw(t.ansi.map((c, i) => `<rect x="${r(i * bw)}" width="${bw}" height="${L.lh - 8}" fill="${c}"/>`).join(''), L.lh - 8);
  return s;
}

export function whoami(L, t, d) {
  const wide = L.name === 'wide';
  const gap = 16;
  const w = wide ? (L.width - gap) / 2 : L.width;
  const left = introScreen(L, w);
  const right = statsScreen(L, w, t, d);
  const hl = windowHeight(left);
  const hr = windowHeight(right);
  const label = [C.intro.greeting, `${C.intro.role} · Founder of ${C.intro.founder}.`, C.intro.pitch].join(' ');

  let body;
  let height;
  if (wide) {
    height = Math.max(hl, hr);
    body =
      terminal({ screen: left, title: 'whoami — zsh', t, w, h: height }) +
      terminal({ screen: right, title: 'neofetch — zsh', t, x: w + gap, w, h: height });
  } else {
    height = hl + gap + hr;
    body =
      terminal({ screen: left, title: 'whoami — zsh', t, w, h: hl }) +
      terminal({ screen: right, title: 'neofetch — zsh', t, y: hl + gap, w, h: hr });
  }
  return doc({ L, t, width: L.width, height, label, css: [...left.css, ...right.css], body });
}

// ---------------------------------------------------------------------------
// 3. cat building.txt
// ---------------------------------------------------------------------------

export function building(L, t) {
  const b = C.building;
  return single(L, t, {
    title: 'building.txt — zsh',
    label: `Currently building ${b.name} (${b.url}): ${b.summary} ${b.lead} ${b.points.join(', ')}.`,
    build(s) {
      s.line(prompt('cat building.txt'));
      s.gap(0.4);
      s.line([['m', '# currently building']]);
      s.line([['a bo', b.name], ['m', ' → '], ['b', b.url]]);
      s.gap(0.3);
      s.para(b.summary);
      s.para(b.lead);
      for (const p of b.points) s.para([['t', p]], { indent: 4, lead: [['a', '▸', 2]] });
    },
  });
}

// ---------------------------------------------------------------------------
// 4. ls ~/projects
// ---------------------------------------------------------------------------

/** Desktop: a three-column table. Each cell wraps independently. */
function projectsTable(s) {
  const nameW = 29;
  const toolsW = 16;
  const descW = s.cols - nameW - toolsW - 4;
  const cols = [0, nameW + 2, nameW + descW + 4];

  s.line([['m bo', 'PROJECT', cols[0]], ['m bo', 'WHAT IT DOES', cols[1]], ['m bo', 'TOOLS', cols[2]]]);
  s.rule();
  C.projects.forEach((p, i) => {
    const cells = [
      wrapSegs([['b bo', p.name]], nameW),
      wrapSegs([['t', p.what]], descW),
      wrapSegs([['a', p.tools]], toolsW),
    ];
    const rows = Math.max(...cells.map((c) => c.length));
    for (let k = 0; k < rows; k++) {
      s.line(cells.flatMap((c, j) => (c[k] ? c[k].map(([cls, text], m) => (m === 0 ? [cls, text, cols[j]] : [cls, text])) : [])));
    }
    if (i < C.projects.length - 1) s.rule({ dashed: true });
  });
}

/** Phones: one stacked block per project. */
function projectsList(s) {
  C.projects.forEach((p, i) => {
    if (i) s.gap(0.5);
    s.para([['b bo', p.name]], { indent: 2, lead: [['a', '▸']] });
    s.para(p.what, { indent: 2 });
    s.para([['a', `[${p.tools}]`]], { indent: 2 });
  });
}

export function projects(L, t) {
  return single(L, t, {
    title: 'projects — zsh',
    label: `Selected projects: ${C.projects.map((p) => `${p.name}: ${p.what} (${p.tools})`).join('; ')}.`,
    build(s) {
      s.line(prompt('ls ~/projects'));
      s.gap(0.4);
      (L.name === 'wide' ? projectsTable : projectsList)(s);
    },
  });
}

// ---------------------------------------------------------------------------
// 5. cat stack.txt
// ---------------------------------------------------------------------------

export function stack(L, t) {
  return single(L, t, {
    title: 'stack.txt — zsh',
    label: `Tools: ${C.stack.map((x) => x.name).join(', ')}.`,
    build(s) {
      s.line(prompt('cat stack.txt'));
      s.gap(0.5);
      // Flow layout of "chips": dot in the tool's brand colour + name.
      const h = L.lh + 6;
      const gap = 10;
      let x = 0;
      let y = 0;
      let svg = '';
      for (const tool of C.stack) {
        const w = r(textWidth(tool.name) * L.cw + 34);
        if (x && x + w > s.inner) {
          x = 0;
          y += h + gap;
        }
        svg +=
          `<rect x="${r(x + 0.5)}" y="${r(y + 0.5)}" width="${w - 1}" height="${h - 1}" rx="6" fill="${t.chrome}" stroke="${t.border}"/>` +
          `<circle cx="${r(x + 14)}" cy="${r(y + h / 2)}" r="5" fill="${tool.color}"/>` +
          `<text class="t" x="${r(x + 26)}" y="${r(y + h / 2 + L.fs * 0.36)}">${esc(tool.name)}</text>`;
        x += w + gap;
      }
      s.raw(svg, y + h);
    },
  });
}

// ---------------------------------------------------------------------------
// 6. cat before_university.log
// ---------------------------------------------------------------------------

export function beforeUniversity(L, t) {
  const plain = C.beforeUniversity.map(([, segs]) => segs.map(([, x]) => x).join('')).join(' ');
  return single(L, t, {
    title: 'before_university.log — zsh',
    label: `Before university: ${plain}`,
    build(s) {
      s.line(prompt('cat before_university.log'));
      s.gap(0.4);
      for (const [level, segs] of C.beforeUniversity) {
        const tag = level === 'done' ? ['a bo', '[done]'] : ['b', '[info]'];
        s.para(segs, { indent: 7, lead: [tag] });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// 7. cat contact.txt
// ---------------------------------------------------------------------------

export function contact(L, t) {
  return single(L, t, {
    title: 'contact.txt — zsh',
    label: `Contact: ${C.contact.map((c) => `${c.key} ${c.value}`).join(' · ')}`,
    build(s) {
      s.line(prompt('cat contact.txt'));
      s.gap(0.4);
      for (const c of C.contact) {
        s.para([[c.href ? 'b' : 't', c.value]], { indent: 10, lead: [['a', c.key]] });
      }
      s.gap(0.4);
      const y = s.y;
      const end = s.line(prompt(''), { fit: true });
      s.parts.push(`<rect class="blink" x="${s.x(end)}" y="${r(y + 3)}" width="${r(L.cw)}" height="${L.lh - 6}"/>`);
    },
  });
}

/** Output file stem → renderer, in README order. */
export const SECTIONS = { contributions, whoami, building, projects, stack, before_university: beforeUniversity, contact };
