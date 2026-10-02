// Downloads a snapshot of real NHL data into data/raw/ (cached on disk).
// Usage: node scripts/fetch-nhl.mjs   (behind an HTTP proxy: NODE_USE_ENV_PROXY=1)
import fs from 'node:fs/promises';
import path from 'node:path';

const RAW = path.resolve('data/raw');
const WEB = 'https://api-web.nhle.com/v1';
const STATS = 'https://api.nhle.com/stats/rest/en';
const SEASONS = [20232024, 20242025, 20252026];
const CURRENT = 20262027;

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function get(url, file, { force = false } = {}) {
  const out = path.join(RAW, file);
  if (!force && (await exists(out))) return JSON.parse(await fs.readFile(out, 'utf8'));
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'nhl-gm-fan-project/0.1' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const json = await res.json();
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, JSON.stringify(json));
      return json;
    } catch (e) {
      if (attempt === 4) { console.warn('FAILED', url, e.message); return null; }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      if (++done % 100 === 0) console.log(`  ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
}

const allPeople = (r) => (r ? [...(r.forwards || []), ...(r.defensemen || []), ...(r.goalies || [])] : []);

async function main() {
  await fs.mkdir(RAW, { recursive: true });
  console.log('standings');
  const now = await get(`${WEB}/standings/now`, 'standings-now.json', { force: true });
  await get(`${WEB}/standings/2026-04-17`, 'standings-2025-26.json');
  const teams = now.standings.map((t) => t.teamAbbrev.default).sort();
  console.log(teams.length, 'teams');

  console.log('rosters, prospects, schedules');
  for (const t of teams) {
    await get(`${WEB}/roster/${t}/current`, `rosters/${t}.json`, { force: true });
    await get(`${WEB}/prospects/${t}`, `prospects/${t}.json`, { force: true });
    await get(`${WEB}/club-schedule-season/${t}/${CURRENT}`, `schedules/${t}.json`);
  }

  console.log('season stats');
  const reports = {
    skater: ['summary', 'realtime', 'timeonice', 'percentages', 'goalsForAgainst'],
    goalie: ['summary', 'advanced'],
  };
  for (const s of SEASONS) {
    for (const [kind, list] of Object.entries(reports)) {
      for (const r of list) {
        const exp = encodeURIComponent(`seasonId=${s} and gameTypeId=2`);
        await get(`${STATS}/${kind}/${r}?limit=-1&cayenneExp=${exp}`, `stats/${kind}-${r}-${s}.json`);
      }
    }
  }

  // Everyone we care about: rostered, prospects, and anyone who played in the NHL recently.
  const ids = new Set();
  for (const t of teams) {
    for (const f of ['rosters', 'prospects']) {
      const r = JSON.parse(await fs.readFile(path.join(RAW, f, `${t}.json`), 'utf8'));
      allPeople(r).forEach((p) => ids.add(p.id));
    }
  }
  for (const s of SEASONS.slice(1)) {
    for (const kind of ['skater', 'goalie']) {
      const r = JSON.parse(await fs.readFile(path.join(RAW, 'stats', `${kind}-summary-${s}.json`), 'utf8'));
      r.data.forEach((p) => ids.add(p.playerId));
    }
  }
  console.log(ids.size, 'player profiles');
  await pool([...ids], 8, (id) => get(`${WEB}/player/${id}/landing`, `players/${id}.json`));

  // NHL EDGE skating/shot-speed data for skaters who played last season.
  const sk = JSON.parse(await fs.readFile(path.join(RAW, 'stats', `skater-summary-20252026.json`), 'utf8'));
  const edgeIds = sk.data.filter((p) => p.gamesPlayed >= 10).map((p) => p.playerId);
  console.log(edgeIds.length, 'EDGE profiles');
  await pool(edgeIds, 8, (id) => get(`${WEB}/edge/skater-detail/${id}/20252026/2`, `edge/${id}.json`));
  console.log('done');
}

main();
