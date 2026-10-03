// Headless multi-season smoke test: plays N full seasons (user team on autopilot).
// Usage: npx tsx scripts/smoke.ts [seasons=3] [team=CHI | KHL id | pro]
import fs from 'node:fs';
import { newCareer, type WorldJson } from '../src/engine/world';
import { advanceDay, setDetail } from '../src/engine/season';
import { sortedTeams } from '../src/engine/standings';
import { capHit } from '../src/engine/contracts';
import { freeAgents } from '../src/engine/fa';
import { leagueTeamIds } from '../src/engine/leagues';
import { acceptProOffer } from '../src/engine/pro';

const N = Number(process.argv[2] ?? 3);
const arg = process.argv[3] ?? 'CHI';
const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
setDetail(false);
const pro = arg === 'pro';
const L = newCareer(world, pro
  ? { team: '', gmName: 'smoke', seed: 42, pro: { fn: 'Smoke', ln: 'Test', pos: 'C', ctry: 'RUS', team: 'SPR' } }
  : { team: arg, gmName: 'smoke', seed: 42 });
const t0 = Date.now();
let days = 0;
while (L.history.length < N && days < 400 * N) {
  L.stops = [];
  advanceDay(L);
  days++;
  // Player career on autopilot: take the best offer (NHL first).
  if (pro && L.pro?.offers.length) {
    const best = [...L.pro.offers].sort((a, b) => (L.teams[b.team].lg ? 0 : 1) - (L.teams[a.team].lg ? 0 : 1) || b.aav - a.aav)[0];
    acceptProOffer(L, best.id);
  }
  if (L.phase === 'regular' && L.flags[`report${L.season}`] === undefined && L.history.length) {
    L.flags[`report${L.season}`] = true;
    const h = L.history[0];
    const nhl = leagueTeamIds(L, 'NHL');
    const caps = nhl.map((t) => capHit(L, t) / 1e6);
    console.log(`\n== ${h.season}: champion ${h.champion}, finalist ${h.finalist}, presidents ${h.presidents}, user ${JSON.stringify(h.userRecord)}`);
    console.log(`   top scorer ${h.topScorer?.name} ${h.topScorer?.pts}; trades ${L.trades.length}; FA left ${freeAgents(L).length}; players ${Object.keys(L.players).length}`);
    console.log(`   NHL cap hits min ${Math.min(...caps).toFixed(1)} max ${Math.max(...caps).toFixed(1)} (cap ${(L.meta.cap[L.season] ?? 0) / 1e6}); phase ${L.phase} date ${L.date}`);
    const rosters = nhl.map((t) => Object.values(L.players).filter((p) => p.team === t && p.st === 'NHL').length);
    console.log(`   NHL roster sizes ${Math.min(...rosters)}..${Math.max(...rosters)}; news ${L.news.length}; owner trust ${L.owner.trust}`);
    const k = L.khl?.history[0];
    if (k) {
      const khl = leagueTeamIds(L, 'KHL');
      const kr = khl.map((t) => Object.values(L.players).filter((p) => p.team === t && p.st === 'NHL').length);
      const kc = khl.map((t) => Math.round((capHit(L, t) * 85) / 1e6));
      console.log(`   KHL ${k.season}: champion ${k.champion}, finalist ${k.finalist}, top ${k.topScorer?.name} ${k.topScorer?.pts}; rosters ${Math.min(...kr)}..${Math.max(...kr)}; payroll ₽${Math.min(...kc)}..${Math.max(...kc)}M`);
    }
    for (const t of (L.intl?.history ?? []).filter((x) => x.year === L.season || x.year === L.season - 1)) console.log(`   ${t.name}: ${t.medals.join(' / ')}`);
    if (pro) {
      const p = L.players[L.pro!.pid];
      console.log(`   PRO ${p.fn} ${p.ln}: ovr ${p.ovr} team ${p.team} ${p.st} rights ${p.rights ?? '-'} draft ${p.dr ? `${p.dr.y}#${p.dr.p}` : '-'} log ${JSON.stringify(L.pro!.log.slice(-1))}`);
    }
  }
}
console.log(`\n${days} days in ${((Date.now() - t0) / 1000).toFixed(1)}s; final date ${L.date}, phase ${L.phase}, standings leader ${sortedTeams(L)[0].id}`);
console.log('recent trades:', L.trades.slice(0, 5).map((t) => `${t.a}<->${t.b}: ${t.aGets.names.join('+')} / ${t.bGets.names.join('+')} [${t.grades?.a}/${t.grades?.b}]`).join('\n  '));
console.log('save size MB', (JSON.stringify(L).length / 1e6).toFixed(2));
