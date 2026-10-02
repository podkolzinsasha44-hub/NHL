// Headless multi-season smoke test: plays N full seasons (user team on autopilot).
import fs from 'node:fs';
import { newCareer, type WorldJson } from '../src/engine/world';
import { advanceDay, setDetail } from '../src/engine/season';
import { sortedTeams } from '../src/engine/standings';
import { capHit } from '../src/engine/contracts';
import { freeAgents } from '../src/engine/fa';

const N = Number(process.argv[2] ?? 3);
const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
setDetail(false);
const L = newCareer(world, { team: process.argv[3] ?? 'CHI', gmName: 'smoke', seed: 42 });
const t0 = Date.now();
let lastSeason = L.season;
let days = 0;
while (L.history.length < N && days < 400 * N) {
  L.stops = [];
  advanceDay(L);
  days++;
  if (L.season !== lastSeason) {
    lastSeason = L.season;
  }
  if (L.phase === 'regular' && L.flags[`report${L.season}`] === undefined && L.history.length) {
    L.flags[`report${L.season}`] = true;
    const h = L.history[0];
    const caps = Object.keys(L.teams).map((t) => capHit(L, t) / 1e6);
    console.log(`\n== ${h.season}: champion ${h.champion}, finalist ${h.finalist}, presidents ${h.presidents}, user ${JSON.stringify(h.userRecord)}`);
    console.log(`   top scorer ${h.topScorer?.name} ${h.topScorer?.pts}; trades ${L.trades.length}; FA left ${freeAgents(L).length}; players ${Object.keys(L.players).length}`);
    console.log(`   cap hits min ${Math.min(...caps).toFixed(1)} max ${Math.max(...caps).toFixed(1)} (cap ${(L.meta.cap[L.season] ?? 0) / 1e6}); phase ${L.phase} date ${L.date}`);
    const rosters = Object.keys(L.teams).map((t) => Object.values(L.players).filter((p) => p.team === t && p.st === 'NHL').length);
    console.log(`   NHL roster sizes ${Math.min(...rosters)}..${Math.max(...rosters)}; news ${L.news.length}; owner trust ${L.owner.trust}`);
  }
}
console.log(`\n${days} days in ${((Date.now() - t0) / 1000).toFixed(1)}s; final date ${L.date}, phase ${L.phase}, standings leader ${sortedTeams(L)[0].id}`);
console.log('recent trades:', L.trades.slice(0, 5).map((t) => `${t.a}<->${t.b}: ${t.aGets.names.join('+')} / ${t.bGets.names.join('+')} [${t.grades?.a}/${t.grades?.b}]`).join('\n  '));
console.log('save size MB', (JSON.stringify(L).length / 1e6).toFixed(2));
