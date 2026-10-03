// Downloads real KHL rosters and three seasons of KHL stats from the league's public
// mobile-app API (the one behind the official KHL app) into data/raw/khl/ (cached on disk).
// Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-khl.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const RAW = path.resolve('data/raw/khl');
const API = 'https://khl.api.webcaster.pro/api/khl_mobile';
// Regular-season stage ids: 2024/25, 2025/26, 2026/27 (current).
export const KHL_STAGES = { 20242025: 323, 20252026: 370, 20262027: 407 };

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function get(url, file, { force = false } = {}) {
  const out = path.join(RAW, file);
  if (!force && (await exists(out))) return JSON.parse(await fs.readFile(out, 'utf8'));
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'nhl-gm-fan-project/0.1' }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const json = await res.json();
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, JSON.stringify(json));
      return json;
    } catch (e) {
      if (attempt === 5) { console.warn('FAILED', url, e.message); return null; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** Pages of 16 players, alphabetical; an empty page ends the list. */
async function allPages(stage, force) {
  const out = [];
  for (let base = 1; ; base += 8) {
    const batch = await Promise.all(Array.from({ length: 8 }, (_, i) => get(`${API}/players_v2.json?locale=en&stage_id=${stage}&page=${base + i}`, `stage-${stage}/page-${base + i}.json`, { force })));
    let done = false;
    for (const page of batch) {
      if (!Array.isArray(page) || !page.length) { done = true; break; }
      out.push(...page.map((x) => x.player));
    }
    console.log(`  stage ${stage}: ${out.length} players`);
    if (done) return out;
  }
}

async function main() {
  await fs.mkdir(RAW, { recursive: true });
  await get(`${API}/teams_v2.json?locale=en`, 'teams.json', { force: true });
  // Current rosters (club of every player right now).
  await get(`${API}/players.json?locale=en`, 'rosters.json', { force: true });
  for (const [season, stage] of Object.entries(KHL_STAGES)) {
    const players = await allPages(stage, Number(season) === 20262027);
    await fs.writeFile(path.join(RAW, `players-${season}.json`), JSON.stringify(players));
  }
  console.log('done');
}

main();
