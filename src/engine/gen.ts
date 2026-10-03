import { randomName, type Country } from './names';
import { next, int, normal, pick, weighted, hash01 } from './rng';
import type { GoalieAttrs, League, Personality, Player, Pos, SkaterAttrs, Status } from './types';
import { addDays, calcOvr, clamp, W_POS } from './util';

const ARCH_F: Record<string, Partial<SkaterAttrs>> = {
  sniper: { sh: 8, oi: 3, pa: -3, di: -4 },
  playmaker: { pa: 8, oi: 3, sh: -3, di: -3 },
  power: { ph: 9, sh: 2, sk: -3, ha: -2 },
  twoway: { di: 7, oi: -1, sh: -2 },
  speed: { sk: 9, ha: 3, ph: -4 },
  grinder: { ph: 6, di: 4, sh: -4, pa: -3, ha: -2 },
};
const ARCH_D: Record<string, Partial<SkaterAttrs>> = {
  offD: { oi: 7, pa: 5, sh: 3, di: -4, ph: -3 },
  defD: { di: 7, ph: 5, oi: -5, pa: -3 },
  twowayD: { di: 2, pa: 2 },
  physD: { ph: 9, di: 2, sk: -3, ha: -4 },
  mobileD: { sk: 7, pa: 3, ph: -4 },
};

export function personality(seed: number): Personality {
  const r = (salt: number) => 1 + Math.floor(hash01(seed, salt) * 20);
  return { lead: r(1), prof: r(2), loy: r(3), greed: r(4), win: r(5) };
}

export function devType(seed: number): 'E' | 'N' | 'L' {
  const x = hash01(seed, 9);
  return x < 0.25 ? 'E' : x < 0.8 ? 'N' : 'L';
}

export function skaterAttrs(pos: Pos, ovr: number): SkaterAttrs {
  const arch = pos === 'D' ? pick(Object.values(ARCH_D)) : pick(Object.values(ARCH_F));
  const a: SkaterAttrs = { sk: 0, sh: 0, pa: 0, ha: 0, oi: 0, di: 0, ph: 0, fo: 0, dc: 0, du: 0 };
  for (const k of Object.keys(a) as (keyof SkaterAttrs)[]) a[k] = ovr + (arch[k] ?? 0) + normal(0, 3);
  if (pos === 'D') { a.di += 4; a.sh -= 4; a.ph += 2; }
  a.fo = pos === 'C' ? ovr + normal(0, 6) : ovr - 14 + normal(0, 6);
  const w = W_POS[pos === 'C' ? 'C' : pos === 'D' ? 'D' : 'W'];
  let calc = 0;
  for (const [k, wt] of Object.entries(w)) calc += wt * a[k as keyof SkaterAttrs];
  const shift = ovr - calc;
  for (const k of Object.keys(w) as (keyof SkaterAttrs)[]) a[k] += shift;
  for (const k of Object.keys(a) as (keyof SkaterAttrs)[]) a[k] = clamp(Math.round(a[k]), 25, 99);
  a.dc = clamp(Math.round(normal(70, 10)), 30, 99);
  a.du = clamp(Math.round(normal(80, 8)), 45, 99);
  return a;
}

export function goalieAttrs(ovr: number): GoalieAttrs {
  const a: GoalieAttrs = {
    po: ovr + normal(0, 3), rf: ovr + normal(0, 3), rb: ovr + normal(0, 4), pk: ovr - 6 + normal(0, 7), cs: ovr + normal(0, 4), mn: ovr + normal(0, 5), du: 0,
  };
  const calc = 0.3 * a.po + 0.3 * a.rf + 0.15 * a.rb + 0.05 * a.pk + 0.12 * a.cs + 0.08 * a.mn;
  const shift = ovr - calc;
  for (const k of ['po', 'rf', 'rb', 'pk', 'cs', 'mn'] as const) a[k] = clamp(Math.round(a[k] + shift), 30, 99);
  a.du = clamp(Math.round(normal(82, 7)), 45, 99);
  return a;
}

export function randomPos(): Pos {
  return weighted<Pos>(['C', 'L', 'R', 'D', 'G'], [0.2, 0.2, 0.2, 0.31, 0.09]);
}

export interface GenOpts {
  pos?: Pos;
  age: number;
  country: Country;
  ovr: number;
  pot: number;
  league: string;
  status: Status;
  team?: string | null;
}

export function genPlayer(L: League, o: GenOpts): Player {
  const id = L.nextId++;
  const pos = o.pos ?? randomPos();
  const [fn, ln] = randomName(o.country, next);
  const year = Number(L.date.slice(0, 4)) - o.age;
  const bd = addDays(`${year}-01-01`, -int(0, 364));
  const ovr = clamp(Math.round(o.ovr), 35, 92);
  const r = pos === 'G' ? goalieAttrs(ovr) : skaterAttrs(pos, ovr);
  const p: Player = {
    id, fn, ln, pos,
    sh: next() < 0.62 ? 'L' : 'R',
    bd,
    ctry: o.country,
    ht: Math.round(normal(pos === 'D' || pos === 'G' ? 189 : 184, 5)),
    wt: Math.round(normal(pos === 'D' ? 92 : 88, 6)),
    num: null,
    img: null,
    real: false,
    team: o.team ?? null,
    st: o.status,
    ovr: 0,
    pot: 0,
    r,
    tr: [],
    lg: o.league,
    c: null,
    morale: 70,
    form: 0,
    inj: null,
    pers: personality(id),
    dev: devType(id),
    stats: {},
    hist: [],
    awards: [],
    teams: o.team ? [o.team] : [],
  };
  p.ovr = calcOvr(p);
  p.pot = clamp(Math.max(p.ovr, Math.round(o.pot)), p.ovr, 96);
  p.hist.push([L.season, p.ovr]);
  p.tr = genTraits(p);
  L.players[id] = p;
  return p;
}

export function genTraits(p: Player): string[] {
  const t: string[] = [];
  if (p.pos === 'G') {
    const g = p.r as GoalieAttrs;
    if (p.ovr >= 86 && g.cs >= 88) t.push('wall');
    if (g.mn >= 90) t.push('clutch');
    return t;
  }
  const a = p.r as SkaterAttrs;
  if (p.pos !== 'D' && a.sh >= 86 && a.sh - p.ovr >= 4) t.push('sniper');
  if (a.pa >= 86 && a.pa - p.ovr >= 4) t.push('playmaker');
  if (a.sk >= 90) t.push('speed');
  if (a.ph >= 88) t.push('enforcer');
  if (p.pos === 'C' && a.fo >= 85) t.push('faceoff');
  if (p.pos !== 'D' && a.di >= 82 && a.oi >= 80) t.push('twoway');
  if (p.pos === 'D' && a.oi >= 84 && a.pa >= 82) t.push('quarterback');
  if (p.pos === 'D' && a.di >= 85 && a.ph >= 82) t.push('blocker');
  return t.slice(0, 3);
}

/** League profiles for the fictional "world pool" (players outside NHL and KHL organisations). */
export const POOL_LEAGUES: { lg: string; countries: [Country, number][]; ovr: [number, number]; age: [number, number]; status: Status; share: number }[] = [
  // KHL players belong to the 22 KHL clubs (khl.ts); the pool keeps their second tier.
  { lg: 'VHL', countries: [['RUS', 0.86], ['BLR', 0.06], ['KAZ', 0.06], ['LVA', 0.02]], ovr: [54, 68], age: [20, 33], status: 'EUR', share: 0.08 },
  { lg: 'SHL', countries: [['SWE', 0.82], ['FIN', 0.06], ['CAN', 0.05], ['USA', 0.03], ['NOR', 0.02], ['DNK', 0.02]], ovr: [58, 75], age: [19, 34], status: 'EUR', share: 0.16 },
  { lg: 'Liiga', countries: [['FIN', 0.88], ['SWE', 0.04], ['CAN', 0.04], ['USA', 0.02], ['CZE', 0.02]], ovr: [56, 73], age: [19, 34], status: 'EUR', share: 0.13 },
  { lg: 'NL', countries: [['SUI', 0.65], ['CAN', 0.12], ['SWE', 0.08], ['FIN', 0.06], ['USA', 0.05], ['AUT', 0.04]], ovr: [57, 75], age: [20, 35], status: 'EUR', share: 0.08 },
  { lg: 'DEL', countries: [['DEU', 0.6], ['CAN', 0.2], ['USA', 0.12], ['AUT', 0.04], ['SWE', 0.04]], ovr: [55, 71], age: [20, 35], status: 'EUR', share: 0.07 },
  { lg: 'Czechia', countries: [['CZE', 0.85], ['SVK', 0.1], ['FIN', 0.05]], ovr: [55, 72], age: [19, 35], status: 'EUR', share: 0.08 },
  { lg: 'Slovakia', countries: [['SVK', 0.85], ['CZE', 0.1], ['CAN', 0.05]], ovr: [52, 66], age: [19, 34], status: 'EUR', share: 0.03 },
  { lg: 'AHL', countries: [['CAN', 0.55], ['USA', 0.35], ['SWE', 0.04], ['FIN', 0.03], ['CZE', 0.03]], ovr: [56, 70], age: [22, 33], status: 'FA', share: 0.09 },
  { lg: 'NCAA', countries: [['USA', 0.72], ['CAN', 0.25], ['SWE', 0.03]], ovr: [50, 64], age: [19, 23], status: 'NCAA', share: 0.06 },
];

export function weightedCountry(list: [Country, number][]): Country {
  return weighted(list.map((c) => c[0]), list.map((c) => c[1]));
}
