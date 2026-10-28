#!/usr/bin/env node
/**
 * Regenerates every SVG in /assets from live GitHub data.
 *
 *   GITHUB_TOKEN=<token> node scripts/generate.mjs
 *
 * Environment:
 *   GITHUB_TOKEN | GH_TOKEN  required. The Action's GITHUB_TOKEN sees public data;
 *                            a personal access token (GH_PAT) also sees private work.
 *   GH_USER                  login to render (defaults to LOGIN in content.mjs).
 *   INCLUDE_PRIVATE=true     count private repositories too (needs a PAT).
 *
 * Output: assets/<section>[-narrow]-<dark|light>.svg. Files are only rewritten
 * when their content changes, so the Action commits nothing on quiet days.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOGIN, excludedLanguages } from './content.mjs';
import { SECTIONS } from './lib/sections.mjs';
import { LAYOUTS, THEMES } from './lib/svg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

const QUERY = /* GraphQL */ `
  query Profile($login: String!, $yearStart: DateTime!, $now: DateTime!, $privacy: RepositoryPrivacy) {
    user(login: $login) {
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: $privacy) {
        totalCount
        nodes {
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
      lastYear: contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date weekday contributionCount contributionLevel } }
        }
      }
      thisYear: contributionsCollection(from: $yearStart, to: $now) {
        totalCommitContributions
      }
    }
  }
`;

async function graphql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-readme-generator',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  if (!json.data?.user) throw new Error(`User "${variables.login}" not found`);
  return json.data.user;
}

/** Current streak (today may still be empty) and longest streak in the window. */
function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--; // today isn't over yet
  let current = 0;
  while (i >= 0 && days[i].contributionCount > 0) {
    current++;
    i--;
  }
  return { current, longest };
}

/** Top languages by bytes across owned repos; the tail is folded into "Other". */
function topLanguages(repos, max = 4) {
  const totals = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      if (excludedLanguages.includes(node.name)) continue;
      const prev = totals.get(node.name) ?? { name: node.name, color: node.color ?? '#8b949e', size: 0 };
      prev.size += size;
      totals.set(node.name, prev);
    }
  }
  const all = [...totals.values()].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  const sum = all.reduce((n, l) => n + l.size, 0);
  if (!sum) return [];
  const top = all.slice(0, max);
  const rest = all.slice(max).reduce((n, l) => n + l.size, 0);
  if (rest) top.push({ name: 'Other', color: '#8b949e', size: rest });
  return top.map((l) => ({ name: l.name, color: l.color, pct: Math.round((l.size / sum) * 1000) / 10 }));
}

async function fetchStats(token, login, includePrivate) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const user = await graphql(token, QUERY, {
    login,
    yearStart: `${year}-01-01T00:00:00Z`,
    now: now.toISOString(),
    privacy: includePrivate ? null : 'PUBLIC',
  });
  const calendar = user.lastYear.contributionCalendar;
  const days = calendar.weeks.flatMap((w) => w.contributionDays);
  const { current, longest } = streaks(days);
  return {
    year,
    total: calendar.totalContributions,
    weeks: calendar.weeks,
    commitsYear: user.thisYear.totalCommitContributions,
    repos: user.repositories.totalCount,
    streak: current,
    longest,
    languages: topLanguages(user.repositories.nodes),
  };
}

async function writeIfChanged(file, content) {
  const old = await readFile(file, 'utf8').catch(() => null);
  if (old === content) return false;
  await writeFile(file, content, 'utf8'); // Node writes UTF-8 without a BOM
  return true;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN (or GH_TOKEN) to a GitHub token.');
  const login = process.env.GH_USER || LOGIN;
  const includePrivate = /^(1|true|yes)$/i.test(process.env.INCLUDE_PRIVATE ?? '');

  const stats = await fetchStats(token, login, includePrivate);
  console.log(
    `${login}: ${stats.total} contributions, ${stats.repos} repos, ${stats.commitsYear} commits in ${stats.year}, ` +
      `streak ${stats.streak}, languages ${stats.languages.map((l) => l.name).join('/') || 'none'}`,
  );

  await mkdir(ASSETS, { recursive: true });
  let changed = 0;
  for (const [stem, render] of Object.entries(SECTIONS)) {
    for (const L of Object.values(LAYOUTS)) {
      for (const t of Object.values(THEMES)) {
        const name = `${stem}${L.name === 'narrow' ? '-narrow' : ''}-${t.name}.svg`;
        if (await writeIfChanged(join(ASSETS, name), render(L, t, stats))) {
          changed++;
          console.log(`  updated ${name}`);
        }
      }
    }
  }
  console.log(changed ? `${changed} file(s) updated.` : 'All SVGs already up to date.');
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
