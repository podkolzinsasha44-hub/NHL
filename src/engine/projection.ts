// Fast Monte-Carlo projections shown to the player. They use the same team strength that
// drives the match engine, fitted to engine results (scripts/calibrate.ts prints the fit).
import { teamPower } from './lines';
import { playoffPicture, compareTeams } from './standings';
import type { League, Team } from './types';
import { leagueTeams } from './leagues';

export const PROJ = { K: 0.18, HOME: 0.6, OT: 0.25, PO: 0.72 };

let rngState = 123456789;
const r = () => {
  rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
  return (rngState >>> 0) / 4294967296;
};

export function powers(L: League): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of Object.values(L.teams)) out[t.id] = teamPower(L, t);
  return out;
}

export function winProb(pH: number, pA: number, playoff = false) {
  // Playoff hockey is tighter (the engine damps talent gaps), so the curve is flatter.
  return 1 / (1 + Math.exp(-PROJ.K * (playoff ? PROJ.PO : 1) * (pH - pA + PROJ.HOME)));
}

export function gameWinProb(L: League, home: string, away: string, playoff = L.phase === 'playoffs') {
  const P = powers(L);
  return winProb(P[home], P[away], playoff);
}

function seriesProb(pw: Record<string, number>, hi: string, lo: string, wHi = 0, wLo = 0, sims = 0): boolean {
  void sims;
  const pattern = [true, true, false, false, true, false, true];
  let a = wHi, b = wLo;
  while (a < 4 && b < 4) {
    const n = a + b;
    const p = pattern[n] ? winProb(pw[hi], pw[lo], true) : 1 - winProb(pw[lo], pw[hi], true);
    if (r() < p) a++; else b++;
  }
  return a === 4;
}

export interface Odds { po: number; cup: number; pts: number; final: number }

/** Simulates the rest of the season `n` times. */
export function seasonOdds(L: League, n = 400): Record<string, Odds> {
  rngState = (Date.parse(L.date) / 86400000) | 0 || 99;
  const pw = powers(L);
  const teams = leagueTeams(L, 'NHL');
  const res: Record<string, Odds> = {};
  for (const t of teams) res[t.id] = { po: 0, cup: 0, pts: 0, final: 0 };
  const remaining = L.phase === 'regular' || L.phase === 'preseason' ? L.games.filter((g) => !g.played && !g.series && !g.lg) : [];
  const inPlayoffs = L.phase === 'playoffs' && L.playoffs;
  for (let s = 0; s < n; s++) {
    const pts: Record<string, number> = {};
    const rw: Record<string, number> = {};
    for (const t of teams) { pts[t.id] = L.phase === 'preseason' ? 0 : t.rec.pts; rw[t.id] = t.rec.rw; }
    for (const g of remaining) {
      const p = winProb(pw[g.h], pw[g.a]);
      const ot = r() < PROJ.OT;
      if (r() < p) { pts[g.h] += 2; if (!ot) rw[g.h]++; if (ot) pts[g.a] += 1; }
      else { pts[g.a] += 2; if (!ot) rw[g.a]++; if (ot) pts[g.h] += 1; }
    }
    let bracket: { hi: string; lo: string; wHi: number; wLo: number }[][];
    if (inPlayoffs) {
      // Continue the real bracket
      const po = L.playoffs!;
      for (const x of po.series.filter((q) => q.round === 1)) { res[x.hi].po++; res[x.lo].po++; }
      let alive = po.series.filter((q) => q.round === po.round);
      let round = po.round;
      let winners = alive.map((q) => (q.winner ? q.winner : seriesProb(pw, q.hi, q.lo, q.wHi, q.wLo) ? q.hi : q.lo));
      while (winners.length > 1) {
        if (round === 3) for (const w of winners) res[w].final++;
        const nextW: string[] = [];
        for (let i = 0; i < winners.length; i += 2) {
          const a = winners[i], b = winners[i + 1];
          const hi = compareTeams(L.teams[a], L.teams[b]) <= 0 ? a : b;
          const lo = hi === a ? b : a;
          nextW.push(seriesProb(pw, hi, lo) ? hi : lo);
        }
        winners = nextW;
        round++;
        alive = [];
      }
      if (round <= 4 && po.round === 4) {
        const f = po.series.find((q) => q.round === 4);
        if (f) { res[f.hi].final++; res[f.lo].final++; }
      }
      res[winners[0]].cup++;
      continue;
    }
    for (const t of teams) res[t.id].pts += pts[t.id];
    // Seed with simulated points
    const fake: Record<string, Team> = {};
    for (const t of teams) fake[t.id] = { ...t, rec: { ...t.rec, pts: pts[t.id], gp: 84, rw: rw[t.id] } };
    const pic = playoffPicture({ ...L, teams: fake } as League);
    bracket = [];
    const round1: { hi: string; lo: string; wHi: number; wLo: number }[] = [];
    for (const conf of ['E', 'W'] as const) {
      const c = pic[conf];
      const w1 = c.div1[0], w2 = c.div2[0];
      const better = compareTeams(w1, w2) <= 0;
      round1.push({ hi: w1.id, lo: (better ? c.wc[1] : c.wc[0]).id, wHi: 0, wLo: 0 });
      round1.push({ hi: c.div1[1].id, lo: c.div1[2].id, wHi: 0, wLo: 0 });
      round1.push({ hi: w2.id, lo: (better ? c.wc[0] : c.wc[1]).id, wHi: 0, wLo: 0 });
      round1.push({ hi: c.div2[1].id, lo: c.div2[2].id, wHi: 0, wLo: 0 });
      for (const x of [...c.div1, ...c.div2, ...c.wc]) res[x.id].po++;
    }
    bracket.push(round1);
    let winners = round1.map((x) => (seriesProb(pw, x.hi, x.lo) ? x.hi : x.lo));
    let round = 1;
    while (winners.length > 1) {
      round++;
      if (round === 4) for (const w of winners) res[w].final++;
      const nextW: string[] = [];
      for (let i = 0; i < winners.length; i += 2) {
        const a = winners[i], b = winners[i + 1];
        const hi = pts[a] >= pts[b] ? a : b;
        const lo = hi === a ? b : a;
        nextW.push(seriesProb(pw, hi, lo) ? hi : lo);
      }
      winners = nextW;
    }
    res[winners[0]].cup++;
  }
  for (const id in res) {
    res[id].po /= n;
    res[id].cup /= n;
    res[id].final /= n;
    res[id].pts = inPlayoffs ? L.teams[id].rec.pts : res[id].pts / n;
  }
  return res;
}

/** Cup odds for the user team if lines/roster were as given (used for trade impact preview). */
export function cupOddsFor(L: League, team: string, n = 300) {
  return seasonOdds(L, n)[team]?.cup ?? 0;
}

/**
 * KHL odds: the rest of the regular season, conference playoffs in round 1 (1–8, 2–7...), then
 * re-seeding by the overall table at every stage — the 2026-27 format. Same win model as the NHL.
 */
export function khlSeasonOdds(L: League, n = 250): Record<string, Odds> {
  rngState = ((Date.parse(L.date) / 86400000) | 0) + 7 || 99;
  const pw = powers(L);
  const teams = leagueTeams(L, 'KHL');
  const res: Record<string, Odds> = {};
  for (const t of teams) res[t.id] = { po: 0, cup: 0, pts: 0, final: 0 };
  const K = L.khl;
  if (!K || !teams.length) return res;
  const remaining = K.phase === 'regular' || K.phase === 'preseason' ? L.games.filter((g) => g.lg === 'KHL' && !g.played && !g.series) : [];
  const po = K.phase === 'playoffs' ? K.playoffs : null;
  const series = (hi: string, lo: string, wHi = 0, wLo = 0) => (seriesProb(pw, hi, lo, wHi, wLo) ? hi : lo);
  for (let s = 0; s < n; s++) {
    const pts: Record<string, number> = {};
    for (const t of teams) pts[t.id] = K.phase === 'preseason' ? 0 : t.rec.pts;
    for (const g of remaining) {
      const p = winProb(pw[g.h], pw[g.a]);
      const ot = r() < PROJ.OT;
      if (r() < p) { pts[g.h] += 2; if (ot) pts[g.a] += 1; } else { pts[g.a] += 2; if (ot) pts[g.h] += 1; }
    }
    const order = (ids: string[]) => [...ids].sort((a, b) => pts[b] - pts[a]);
    let alive: string[];
    let round: number;
    if (po) {
      for (const x of po.series.filter((q) => q.round === 1)) { res[x.hi].po++; res[x.lo].po++; }
      round = po.round;
      alive = po.series.filter((q) => q.round === round).map((q) => q.winner ?? series(q.hi, q.lo, q.wHi, q.wLo));
    } else {
      for (const t of teams) res[t.id].pts += pts[t.id];
      alive = [];
      for (const conf of ['W', 'E'] as const) {
        const seeds = order(teams.filter((t) => t.conf === conf).map((t) => t.id)).slice(0, 8);
        for (const x of seeds) res[x].po++;
        for (let i = 0; i < 4; i++) alive.push(series(seeds[i], seeds[7 - i]));
      }
      round = 1;
    }
    while (alive.length > 1) {
      round++;
      const o = order(alive);
      if (o.length === 2) for (const w of o) res[w].final++;
      const nextW: string[] = [];
      for (let i = 0; i < o.length / 2; i++) nextW.push(series(o[i], o[o.length - 1 - i]));
      alive = nextW;
    }
    if (alive[0]) res[alive[0]].cup++;
  }
  for (const id in res) {
    res[id].po /= n; res[id].cup /= n; res[id].final /= n;
    res[id].pts = po ? L.teams[id].rec.pts : res[id].pts / n;
  }
  return res;
}

/** Odds for the league of a team. */
export function oddsFor(L: League, team: string, n = 250) {
  return L.teams[team]?.lg === 'KHL' ? khlSeasonOdds(L, n) : seasonOdds(L, n);
}
