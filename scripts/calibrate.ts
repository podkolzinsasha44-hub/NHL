// Calibration: simulates many full seasons from the real 2026-27 start and checks
// league-wide outcomes against real NHL corridors (docs/PLAN.md §6.2), and the KHL
// (played by the same engine) against the real 2025-26 KHL.
// Usage: npx tsx scripts/calibrate.ts [seasons=40]
import fs from 'node:fs';
import { newCareer, type WorldJson } from '../src/engine/world';
import { advanceDay, setDetail } from '../src/engine/season';
import { sortedTeams } from '../src/engine/standings';
import type { GoalieLine, League, SkaterLine } from '../src/engine/types';
import { teamPower } from '../src/engine/lines';

const N = Number(process.argv[2] ?? 40);
const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
setDetail(false);

const acc = {
  games: 0, goals: 0, ot: 0, so: 0, homeWins: 0, ppg: 0, ppo: 0, sa: 0, ga: 0, shots: 0,
  topPts: [] as number[], botPts: [] as number[], topScorer: [] as number[], topGoals: [] as number[],
  presCup: 0, favSeries: 0, series: 0, bestPowerCup: 0, injuriesDays: 0, sdPts: [] as number[], corr: [] as number[],
  champs: {} as Record<string, number>,
  fit: [] as [number, number][],
};
const khl = { games: 0, goals: 0, ot: 0, homeWins: 0, sa: 0, ga: 0, topPts: [] as number[], botPts: [] as number[], topScorer: [] as number[] };

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const L: League = newCareer(world, { team: 'TOR', gmName: 'calib', seed: 1000 + i, settings: { worldSize: 'compact' } });
  const power = Object.fromEntries(Object.values(L.teams).map((t) => [t.id, teamPower(L, t)]));
  let guard = 0;
  while ((!L.playoffs?.champion || L.khl?.phase !== 'offseason') && guard++ < 400) {
    L.stops = [];
    advanceDay(L);
  }
  for (const g of L.games) {
    if (!g.played || g.series) continue;
    if (g.lg === 'KHL') {
      khl.games++;
      khl.goals += (g.hs ?? 0) + (g.as ?? 0);
      if (g.ot) khl.ot++;
      if ((g.hs ?? 0) > (g.as ?? 0)) khl.homeWins++;
      continue;
    }
    acc.fit.push([power[g.h] - power[g.a], (g.hs ?? 0) > (g.as ?? 0) ? 1 : 0]);
    acc.games++;
    acc.goals += (g.hs ?? 0) + (g.as ?? 0);
    if (g.ot === 'OT') acc.ot++;
    if (g.ot === 'SO') acc.so++;
    if ((g.hs ?? 0) > (g.as ?? 0)) acc.homeWins++;
    acc.shots += (g.shH ?? 0) + (g.shA ?? 0);
  }
  for (const t of Object.values(L.teams)) if (!t.lg) { acc.ppg += t.rec.ppg; acc.ppo += t.rec.ppo; }
  for (const p of Object.values(L.players)) {
    const s = p.stats[`${L.season}r`];
    if (s && p.pos === 'G') { acc.sa += (s as GoalieLine).sa; acc.ga += (s as GoalieLine).ga; }
    const k = p.stats[`${L.season}rK`];
    if (k && p.pos === 'G') { khl.sa += (k as GoalieLine).sa; khl.ga += (k as GoalieLine).ga; }
  }
  const kst = sortedTeams(L, undefined, 'KHL');
  khl.topPts.push(kst[0].rec.pts);
  khl.botPts.push(kst[kst.length - 1].rec.pts);
  khl.topScorer.push(Math.max(...Object.values(L.players).filter((p) => p.pos !== 'G' && p.stats[`${L.season}rK`]).map((p) => (p.stats[`${L.season}rK`] as SkaterLine).pts)));
  const st = sortedTeams(L);
  acc.topPts.push(st[0].rec.pts);
  acc.botPts.push(st[st.length - 1].rec.pts);
  const pts = st.map((t) => t.rec.pts);
  const m = pts.reduce((a, b) => a + b) / pts.length;
  acc.sdPts.push(Math.sqrt(pts.reduce((a, b) => a + (b - m) ** 2, 0) / pts.length));
  // correlation of preseason power with points
  const xs = st.map((t) => power[t.id]);
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const r = xs.reduce((a, x, k) => a + (x - mx) * (pts[k] - m), 0) / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * pts.reduce((a, y) => a + (y - m) ** 2, 0));
  acc.corr.push(r);
  const sk = Object.values(L.players).filter((p) => p.pos !== 'G' && p.stats[`${L.season}r`]).map((p) => p.stats[`${L.season}r`] as SkaterLine);
  acc.topScorer.push(Math.max(...sk.map((s) => s.pts)));
  acc.topGoals.push(Math.max(...sk.map((s) => s.g)));
  const champ = L.playoffs!.champion!;
  acc.champs[champ] = (acc.champs[champ] ?? 0) + 1;
  if (champ === st[0].id) acc.presCup++;
  const bestPower = Object.entries(power).sort((a, b) => b[1] - a[1])[0][0];
  if (champ === bestPower) acc.bestPowerCup++;
  for (const s of L.playoffs!.series) {
    acc.series++;
    if (s.winner === s.hi) acc.favSeries++;
  }
  process.stdout.write(`\rseason ${i + 1}/${N}  (${((Date.now() - t0) / (i + 1) / 1000).toFixed(1)}s/season)`);
}
console.log();
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const rows: [string, number, string, number, number][] = [
  ['Goals per team-game', acc.goals / acc.games / 2, '3.08', 2.95, 3.2],
  ['OT/SO share %', ((acc.ot + acc.so) / acc.games) * 100, '24.8', 21, 28],
  ['  of which SO %', (acc.so / acc.games) * 100, '~9', 6, 12],
  ['PP %', (acc.ppg / acc.ppo) * 100, '21.1', 19, 23],
  ['PP opp per team-game', acc.ppo / acc.games / 2, '~3.0', 2.6, 3.4],
  ['League SV%', 1 - acc.ga / acc.sa, '.896', 0.89, 0.905],
  ['Shots per team-game', acc.shots / acc.games / 2, '~28', 26, 31],
  ['Home win %', (acc.homeWins / acc.games) * 100, '52.2', 51, 56],
  ['Best team points', avg(acc.topPts), '121 (82gp)', 112, 130],
  ['Worst team points', avg(acc.botPts), '58 (82gp)', 52, 72],
  ['SD of team points', avg(acc.sdPts), '~14', 11, 17],
  ['Top scorer points', avg(acc.topScorer), '138', 110, 145],
  ['Top goal scorer', avg(acc.topGoals), '~55', 45, 65],
  ['Presidents winner → Cup %', (acc.presCup / N) * 100, '~20', 12, 25],
  ['Favourite wins series %', (acc.favSeries / acc.series) * 100, '55-65', 55, 68],
  ['Power↔points correlation r', avg(acc.corr), '>0.5', 0.5, 0.9],
  ['KHL goals per team-game', khl.goals / khl.games / 2, '~2.75', 2.6, 2.95],
  ['KHL OT/SO share %', (khl.ot / khl.games) * 100, '~25', 20, 30],
  ['KHL home win %', (khl.homeWins / khl.games) * 100, '~53', 50, 57],
  ['KHL SV%', 1 - khl.ga / khl.sa, '~.905', 0.895, 0.915],
  ['KHL best team points (68gp)', avg(khl.topPts), '105', 92, 112],
  ['KHL worst team points', avg(khl.botPts), '~55', 45, 66],
  ['KHL top scorer points', avg(khl.topScorer), '89', 68, 95],
];
let fails = 0;
for (const [name, v, real, lo, hi] of rows) {
  const ok = v >= lo && v <= hi;
  if (!ok) fails++;
  console.log(`${ok ? '✅' : '❌'} ${name.padEnd(30)} ${v.toFixed(3).padStart(9)}   real ${real.padEnd(10)} [${lo}–${hi}]`);
}
let best = { k: 0, h: 0, ll: -Infinity };
for (let k = 0.05; k <= 0.5; k += 0.005) {
  for (let h = 0; h <= 1.5; h += 0.02) {
    let ll = 0;
    for (const [x, y] of acc.fit) {
      const p = 1 / (1 + Math.exp(-k * (x + h)));
      ll += y ? Math.log(p) : Math.log(1 - p);
    }
    if (ll > best.ll) best = { k, h, ll };
  }
}
console.log(`Projection fit: K=${best.k.toFixed(3)} HOME=${best.h.toFixed(2)}`);
console.log('Best preseason team won Cup %', ((acc.bestPowerCup / N) * 100).toFixed(1));
console.log('Champions:', Object.entries(acc.champs).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' '));
process.exit(fails ? 1 : 0);
