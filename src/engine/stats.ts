import type { GoalieLine, League, LeagueId, Player, SkaterLine, StatLine } from './types';
import { clubStatKey } from './leagues';

export const emptySkater = (): SkaterLine => ({ gp: 0, g: 0, a: 0, pts: 0, pm: 0, pim: 0, sog: 0, ppg: 0, ppp: 0, gwg: 0, toi: 0, hits: 0, blk: 0 });
export const emptyGoalie = (): GoalieLine => ({ gp: 0, gs: 0, w: 0, l: 0, otl: 0, sa: 0, ga: 0, so: 0, toi: 0 });

export const statKey = (season: number, playoff: boolean, lg: LeagueId = 'NHL') => clubStatKey(season, playoff, lg);

export function line(p: Player, key: string): StatLine {
  let l = p.stats[key];
  if (!l) p.stats[key] = l = p.pos === 'G' ? emptyGoalie() : emptySkater();
  return l;
}
export const sl = (p: Player, key: string) => (p.stats[key] as SkaterLine | undefined);
export const gl = (p: Player, key: string) => (p.stats[key] as GoalieLine | undefined);

export const svPct = (g: GoalieLine) => (g.sa ? (g.sa - g.ga) / g.sa : 0);
export const gaa = (g: GoalieLine) => (g.toi ? (g.ga * 3600) / g.toi : 0);

/** Career totals: real pre-game career + in-game regular seasons. */
export function careerSkater(p: Player) {
  const c = { gp: p.car?.gp ?? 0, g: p.car?.g ?? 0, a: p.car?.a ?? 0, pts: p.car?.p ?? 0 };
  for (const [k, v] of Object.entries(p.stats)) {
    if (!k.endsWith('r')) continue;
    const s = v as SkaterLine;
    c.gp += s.gp; c.g += s.g; c.a += s.a; c.pts += s.pts;
  }
  return c;
}
export function careerGoalie(p: Player) {
  const c = { gp: p.car?.gp ?? 0, w: p.car?.w ?? 0, so: p.car?.so ?? 0 };
  for (const [k, v] of Object.entries(p.stats)) {
    if (!k.endsWith('r')) continue;
    const s = v as GoalieLine;
    c.gp += s.gp; c.w += s.w; c.so += s.so;
  }
  return c;
}

export function leaders(L: League, key: string, stat: keyof SkaterLine, n = 10, filter?: (p: Player) => boolean) {
  const out: { p: Player; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.pos === 'G') continue;
    if (filter && !filter(p)) continue;
    const s = p.stats[key] as SkaterLine | undefined;
    if (!s || !s.gp) continue;
    out.push({ p, v: s[stat] });
  }
  return out.sort((a, b) => b.v - a.v || (b.p.stats[key] as SkaterLine).g - (a.p.stats[key] as SkaterLine).g).slice(0, n);
}

export function goalieLeaders(L: League, key: string, stat: 'w' | 'sv' | 'gaa' | 'so', n = 10, minGp = 0) {
  const out: { p: Player; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.pos !== 'G') continue;
    const s = p.stats[key] as GoalieLine | undefined;
    if (!s || s.gp < minGp || !s.gp) continue;
    const v = stat === 'sv' ? svPct(s) : stat === 'gaa' ? gaa(s) : s[stat];
    out.push({ p, v });
  }
  return out.sort((a, b) => (stat === 'gaa' ? a.v - b.v : b.v - a.v)).slice(0, n);
}
