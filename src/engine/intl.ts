// National teams. IIHF World Championship every May (16 teams: two groups of 8, quarter-finals,
// re-seeded semi-finals, medal games; the last team of each group is relegated) and the Olympic
// tournament every four years in February (12 teams: three groups of 4, qualification playoffs,
// quarter-finals...; NHL players take part in 2030, the clubs' leagues pause).
// Real data (checked 03.10.2026): WC 2027 in Germany (Düsseldorf/Mannheim), May 14–30, groups
// A: SUI FIN SWE DEU LVA AUT SVN UKR, B: CAN USA CZE SVK DNK NOR KAZ HUN; Finland are the 2026
// champions; Russia and Belarus are suspended by the IIHF (a career setting can admit them).
// Rosters are picked from every league; games are played by the same match engine.
import { genPlayer } from './gen';
import { buildLines, available } from './lines';
import { simulateMatch, type MatchBox } from './match';
import { pushMsg, pushNews, social } from './news';
import { hash01, int, next, normal, shuffle, weighted } from './rng';
import { line } from './stats';
import { emptyRecord } from './standings';
import type { GoalieLine, IntlGame, IntlKind, IntlRecord, League, Player, SkaterLine, Team, Tournament } from './types';
import { addDays, ageOn, clamp, daysBetween } from './util';
import { isGM, LEAGUE_STYLE, proPlayer } from './leagues';
import type { Country } from './names';
import { unlock } from './achievements';

export interface Nation {
  name: string;
  coach: number;
  /** OVR range of generated domestic players (small nations need them to field a team). */
  pool: [number, number];
  league: string;
  /** Approximate IIHF world ranking position in 2026 (lower is better). */
  rank: number;
}

export const NATIONS: Record<string, Nation> = {
  CAN: { name: 'Канада', coach: 82, pool: [58, 70], league: 'ECHL', rank: 1 },
  FIN: { name: 'Финляндия', coach: 81, pool: [56, 70], league: 'Liiga', rank: 2 },
  SUI: { name: 'Швейцария', coach: 79, pool: [55, 70], league: 'NL', rank: 3 },
  SWE: { name: 'Швеция', coach: 80, pool: [56, 70], league: 'SHL', rank: 4 },
  USA: { name: 'США', coach: 80, pool: [57, 69], league: 'ECHL', rank: 5 },
  CZE: { name: 'Чехия', coach: 79, pool: [55, 69], league: 'Czechia', rank: 6 },
  SVK: { name: 'Словакия', coach: 76, pool: [53, 66], league: 'Slovakia', rank: 7 },
  DEU: { name: 'Германия', coach: 76, pool: [54, 68], league: 'DEL', rank: 8 },
  NOR: { name: 'Норвегия', coach: 74, pool: [52, 65], league: 'EliteHockey', rank: 9 },
  LVA: { name: 'Латвия', coach: 74, pool: [53, 66], league: 'Latvia', rank: 10 },
  DNK: { name: 'Дания', coach: 74, pool: [52, 66], league: 'Metal Ligaen', rank: 11 },
  AUT: { name: 'Австрия', coach: 73, pool: [52, 66], league: 'ICEHL', rank: 12 },
  KAZ: { name: 'Казахстан', coach: 72, pool: [52, 65], league: 'Kazakhstan', rank: 13 },
  SVN: { name: 'Словения', coach: 71, pool: [50, 64], league: 'ICEHL', rank: 14 },
  FRA: { name: 'Франция', coach: 71, pool: [51, 65], league: 'Magnus', rank: 15 },
  ITA: { name: 'Италия', coach: 70, pool: [50, 63], league: 'ICEHL', rank: 16 },
  GBR: { name: 'Великобритания', coach: 70, pool: [50, 63], league: 'EIHL', rank: 17 },
  HUN: { name: 'Венгрия', coach: 70, pool: [49, 63], league: 'ICEHL', rank: 18 },
  UKR: { name: 'Украина', coach: 69, pool: [48, 62], league: 'UHL', rank: 19 },
  POL: { name: 'Польша', coach: 69, pool: [47, 61], league: 'PHL', rank: 20 },
  JPN: { name: 'Япония', coach: 68, pool: [45, 60], league: 'AsiaHL', rank: 21 },
  RUS: { name: 'Россия', coach: 81, pool: [56, 68], league: 'VHL', rank: 4.5 },
  BLR: { name: 'Беларусь', coach: 72, pool: [52, 66], league: 'Extraliga', rank: 13.5 },
};

export const SUSPENDED = new Set(['RUS', 'BLR']);
const WC2027 = { A: ['SUI', 'FIN', 'SWE', 'DEU', 'LVA', 'AUT', 'SVN', 'UKR'], B: ['CAN', 'USA', 'CZE', 'SVK', 'DNK', 'NOR', 'KAZ', 'HUN'] };

/** Player nationality → national team code (real data uses CHE for Switzerland). */
export function nationOf(p: Player): string | null {
  const c = p.ctry === 'CHE' ? 'SUI' : p.ctry === 'GER' ? 'DEU' : p.ctry;
  return NATIONS[c] ? c : null;
}

const allowed = (L: League, code: string) => !SUSPENDED.has(code) || !!L.settings.intlRussia;

export const intlKey = (T: Pick<Tournament, 'year' | 'kind'>) => `${T.year}${T.kind}`;

export function initIntl(L: League, coach?: string) {
  const ranking = Object.keys(NATIONS).sort((a, b) => NATIONS[a].rank - NATIONS[b].rank);
  L.intl = { coach: coach && NATIONS[coach] ? coach : undefined, field: [...WC2027.A, ...WC2027.B], current: null, history: [], ranking, recent: {}, nextGameId: 1 };
  topUpPools(L);
  ensureNext(L);
}

/** Small hockey nations get domestic-league players so that every team can dress a roster. */
export function topUpPools(L: League) {
  const need = { G: 4, D: 9, F: 15 };
  const have: Record<string, { G: number; D: number; F: number }> = {};
  for (const c of Object.keys(NATIONS)) have[c] = { G: 0, D: 0, F: 0 };
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    const n = nationOf(p);
    if (!n) continue;
    const a = ageOn(p.bd, L.date);
    if (a < 18 || a > 38) continue;
    have[n][p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F']++;
  }
  for (const [c, nat] of Object.entries(NATIONS)) {
    for (const g of ['G', 'D', 'F'] as const) {
      for (let i = have[c][g]; i < need[g]; i++) {
        const pos = g === 'G' ? 'G' : g === 'D' ? 'D' : weighted<Player['pos']>(['C', 'L', 'R'], [0.36, 0.32, 0.32]);
        const u = next();
        const ovr = nat.pool[0] + (nat.pool[1] - nat.pool[0]) * u * u;
        genPlayer(L, { pos, age: int(20, 32), country: c as Country, ovr, pot: ovr + next() * 4, league: nat.league, status: 'EUR' });
      }
    }
  }
}

// ---------- Calendar ----------

const fridayOnOrAfter = (iso: string) => {
  let d = iso;
  while (new Date(d + 'T12:00:00Z').getUTCDay() !== 5) d = addDays(d, 1);
  return d;
};

export const isOlympicYear = (y: number) => y >= 2030 && y % 4 === 2;

/** Olympic hockey tournament dates (2030 French Alps, 2034 Salt Lake City). */
export function olympicDates(y: number) {
  const start = y === 2030 ? '2030-02-06' : y === 2034 ? '2034-02-15' : `${y}-02-11`;
  return { start, end: addDays(start, 12) };
}

function wcDates(y: number) {
  const start = y === 2027 ? '2027-05-14' : fridayOnOrAfter(`${y}-05-08`);
  return { start, end: addDays(start, 16) };
}

const OG_HOST: Record<number, { code: string; city: string }> = { 2030: { code: 'FRA', city: 'Французские Альпы' }, 2034: { code: 'USA', city: 'Солт-Лейк-Сити' } };

/** Creates the next tournament once the previous one is over. */
export function ensureNext(L: League) {
  const I = L.intl;
  if (!I || I.current) return;
  const y0 = Number(L.date.slice(0, 4));
  const cands: Tournament[] = [];
  for (let y = y0; y <= y0 + 1; y++) {
    if (wcDates(y).start > L.date) cands.push(makeWC(L, y));
    if (isOlympicYear(y) && olympicDates(y).start > L.date) cands.push(makeOG(L, y));
  }
  cands.sort((a, b) => (a.start < b.start ? -1 : 1));
  I.current = cands[0] ?? null;
}

function rankOf(L: League, code: string) {
  const i = L.intl!.ranking.indexOf(code);
  return i < 0 ? 99 : i;
}

function makeWC(L: League, year: number): Tournament {
  const I = L.intl!;
  let field = [...I.field];
  // Russia and Belarus: admitted only if the setting allows; they replace the lowest-ranked teams.
  const banned = field.filter((c) => !allowed(L, c));
  if (banned.length) {
    const rest = I.ranking.filter((c) => !field.includes(c) && allowed(L, c));
    field = field.map((c) => (allowed(L, c) ? c : rest.shift()!));
  }
  if (L.settings.intlRussia) {
    for (const c of ['RUS', 'BLR']) {
      if (field.includes(c)) continue;
      const worst = [...field].sort((a, b) => rankOf(L, b) - rankOf(L, a))[0];
      field[field.indexOf(worst)] = c;
    }
  }
  const { start, end } = wcDates(year);
  let groups: Record<string, string[]>;
  if (year === 2027 && field.every((c) => [...WC2027.A, ...WC2027.B].includes(c))) groups = { A: [...WC2027.A], B: [...WC2027.B] };
  else {
    const seeded = [...field].sort((a, b) => rankOf(L, a) - rankOf(L, b));
    groups = { A: [], B: [] };
    seeded.forEach((c, i) => (i % 4 === 0 || i % 4 === 3 ? groups.A : groups.B).push(c));
  }
  return blank(L, 'wc', year, `Чемпионат мира ${year}`, year === 2027 ? 'Германия' : '', start, end, addDays(start, -5), groups);
}

function makeOG(L: League, year: number): Tournament {
  const host = OG_HOST[year];
  const ranked = L.intl!.ranking.filter((c) => allowed(L, c));
  const teams = host && !ranked.slice(0, 12).includes(host.code) ? [host.code, ...ranked.filter((c) => c !== host.code).slice(0, 11)] : ranked.slice(0, 12);
  const seeded = [...teams].sort((a, b) => rankOf(L, a) - rankOf(L, b));
  // IIHF serpentine: A 1-6-7-12, B 2-5-8-11, C 3-4-9-10
  const pat = ['A', 'B', 'C', 'C', 'B', 'A'];
  const groups: Record<string, string[]> = { A: [], B: [], C: [] };
  seeded.forEach((c, i) => groups[pat[i % 6]].push(c));
  const { start, end } = olympicDates(year);
  return blank(L, 'og', year, `Олимпийские игры ${year}`, host?.city ?? '', start, end, addDays(start, -10), groups);
}

function blank(L: League, kind: IntlKind, year: number, name: string, host: string, start: string, end: string, select: string, groups: Record<string, string[]>): Tournament {
  const teams = Object.values(groups).flat();
  const table: Record<string, IntlRecord> = {};
  for (const c of teams) table[c] = { gp: 0, w: 0, otw: 0, otl: 0, l: 0, pts: 0, gf: 0, ga: 0 };
  const T: Tournament = { id: `${kind}${year}`, kind, year, name, host, start, end, select, teams, groups, rosters: {}, games: [], table, phase: 'upcoming' };
  scheduleGroups(L, T);
  return T;
}

function scheduleGroups(L: League, T: Tournament) {
  const I = L.intl!;
  const days = T.kind === 'wc' ? { A: [0, 1, 3, 4, 6, 8, 10], B: [0, 2, 3, 5, 7, 9, 10] } as Record<string, number[]> : null;
  for (const [g, teams] of Object.entries(T.groups)) {
    const n = teams.length;
    const order = [...teams];
    for (let r = 0; r < n - 1; r++) {
      const rot = [order[0], ...order.slice(1).map((_, i) => order[1 + ((i + r) % (n - 1))])];
      const day = addDays(T.start, days ? days[g][r] : r * 2);
      for (let i = 0; i < n / 2; i++) {
        const a = rot[i], b = rot[n - 1 - i];
        T.games.push({ id: I.nextGameId++, day, h: (r + i) % 2 ? a : b, a: (r + i) % 2 ? b : a, stage: g });
      }
    }
  }
}

/** In Olympic seasons the NHL and the KHL pause for the tournament (called after building schedules). */
export function applyOlympicBreak(L: League) {
  const y = L.season + 1;
  if (!isOlympicYear(y) || L.flags[`olybreak${y}`]) return;
  L.flags[`olybreak${y}`] = true;
  const { start, end } = olympicDates(y);
  const from = addDays(start, -2);
  const len = daysBetween(from, end) + 2;
  for (const g of L.games) if (!g.series && !g.played && g.day >= from) g.day = addDays(g.day, len);
  L.games.sort((x, z) => (x.day < z.day ? -1 : x.day > z.day ? 1 : x.id - z.id));
  const lastOf = (khl: boolean) => L.games.filter((g) => !g.series && !!g.lg === khl).reduce((m, g) => (g.day > m ? g.day : m), '');
  L.regularEnd = lastOf(false) || L.regularEnd;
  if (L.khl) L.khl.regularEnd = lastOf(true) || L.khl.regularEnd;
}

// ---------- Rosters ----------

/** Club still playing in its league's playoffs (players join after elimination). */
function busyInPlayoffs(L: League, p: Player) {
  if (!p.team) return false;
  const po = L.teams[p.team]?.lg === 'KHL' ? (L.khl?.phase === 'playoffs' ? L.khl.playoffs : null) : L.phase === 'playoffs' ? L.playoffs : null;
  if (!po || po.champion) return false;
  let alive = false, inIt = false;
  for (const s of po.series) {
    if (s.hi !== p.team && s.lo !== p.team) continue;
    inIt = true;
    if (!s.winner || s.winner === p.team) alive = true;
  }
  return inIt && alive;
}

/** Stars often skip the World Championship (never the Olympics); stable per player and year. */
function declines(L: League, T: Tournament, p: Player) {
  if (T.kind !== 'wc' || p.id === L.pro?.pid) return false;
  const a = ageOn(p.bd, L.date);
  // NHL players skip the May tournament often (injuries, fatigue, contracts); Europeans rarely.
  let pr = p.st === 'NHL' && p.team && !L.teams[p.team]?.lg ? (p.ovr >= 85 ? 0.6 : p.ovr >= 80 ? 0.45 : p.ovr >= 75 ? 0.3 : 0.15) : 0.08;
  if (a >= 35) pr += 0.25;
  return hash01(p.id, T.year * 7 + 3) < pr;
}

export function eligible(L: League, T: Tournament, code: string): Player[] {
  const out: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET' || nationOf(p) !== code) continue;
    if (ageOn(p.bd, T.start) < 18) continue;
    if (p.inj && p.inj.days > 3) continue;
    if (busyInPlayoffs(L, p)) continue;
    out.push(p);
  }
  return out;
}

export const ROSTER_SIZE = { G: 3, D: 8, F: 14 };

/** Best available players: 3 goalies, 8 defencemen, 14 forwards (at least 4 centres). */
export function autoRoster(L: League, T: Tournament, code: string): number[] {
  const pool = eligible(L, T, code).filter((p) => !declines(L, T, p));
  const score = (p: Player) => p.ovr + p.form * 2;
  const by = (f: (p: Player) => boolean, n: number) => pool.filter(f).sort((a, b) => score(b) - score(a)).slice(0, n);
  const g = by((p) => p.pos === 'G', ROSTER_SIZE.G);
  const d = by((p) => p.pos === 'D', ROSTER_SIZE.D);
  const c = by((p) => p.pos === 'C', 4);
  const f = [...c, ...by((p) => p.pos !== 'G' && p.pos !== 'D' && !c.includes(p), ROSTER_SIZE.F - c.length)];
  return [...g, ...d, ...f].map((p) => p.id);
}

function nameRosters(L: League, T: Tournament) {
  T.named = true;
  topUpPools(L);
  const I = L.intl!;
  for (const c of T.teams) if (!T.rosters[c] || c !== I.coach) T.rosters[c] = autoRoster(L, T, c);
  const me = proPlayer(L);
  const myNation = me ? nationOf(me) : null;
  if (I.coach && T.teams.includes(I.coach) && isGM(L)) {
    pushMsg(L, { from: `Федерация хоккея: ${NATIONS[I.coach].name}`, kind: 'league', title: `${T.name}: состав сборной`, body: `Штаб подготовил состав из ${T.rosters[I.coach].length} игроков. До старта турнира (${T.start}) его можно изменить в разделе «Ещё → Сборные».`, ref: { type: 'screen', id: 'intl' } });
    L.stops.push('intl-select');
  }
  if (me && myNation && T.teams.includes(myNation)) {
    if (T.rosters[myNation].includes(me.id)) {
      pushMsg(L, { from: `Федерация хоккея: ${NATIONS[myNation].name}`, kind: 'league', title: `Вызов в сборную на ${T.name}`, body: 'Тренерский штаб сборной включил вас в состав. Поздравляем!', ref: { type: 'screen', id: 'intl' } });
      L.stops.push('intl-call');
    } else if (ageOn(me.bd, L.date) >= 18 && !busyInPlayoffs(L, me)) {
      pushMsg(L, { from: `Федерация хоккея: ${NATIONS[myNation].name}`, kind: 'league', title: `${T.name}: без вас`, body: 'В этот раз тренеры сборной сделали выбор в пользу других игроков. Продолжайте прогрессировать.' });
    }
  }
}

/** The coached nation's roster can be edited until the tournament starts. */
export function setCoachRoster(L: League, ids: number[]) {
  const T = L.intl?.current;
  const c = L.intl?.coach;
  if (!T || !c || T.phase !== 'upcoming') return false;
  T.rosters[c] = ids.slice(0, 28);
  return true;
}

// ---------- Games ----------

export function nationTeam(L: League, T: Tournament, code: string): Team {
  const roster = (T.rosters[code] ?? []).map((id) => L.players[id]).filter((p) => p && available(p));
  const nat = NATIONS[code];
  const t: Team = {
    id: code, name: nat.name, city: '', short: nat.name, conf: 'E', div: 'X', primary: '#16233b', secondary: '#ffffff', accent: '#7fd3ff',
    taxFree: false, canada: false, bigMarket: false, last: null,
    lines: { f: [[], [], [], []], d: [[], [], []], g: [], pp: [[], []], pk: [[], []], auto: true },
    rec: emptyRecord(), strategy: 'bubble',
    coach: { name: '', rating: nat.coach, style: 'balanced', age: 50, salary: 0 },
    fans: 60, rel: 50, staff: { med: 2, analytics: 2, scouting: 2 }, captain: null, alts: [], cups: 0, retired: [], budget: 0,
  };
  // Injuries can leave a small nation short: call up domestic players to dress a full lineup.
  const short = { G: 1, D: 6, F: 12 };
  for (const p of roster) short[p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F']--;
  for (const g of ['G', 'D', 'F'] as const) {
    for (let i = 0; i < short[g]; i++) {
      const pos = g === 'F' ? 'C' : g;
      const x = genPlayer(L, { pos, age: 26, country: code as Country, ovr: nat.pool[0], pot: nat.pool[0], league: nat.league, status: 'EUR' });
      (T.rosters[code] ??= []).push(x.id);
      roster.push(x);
    }
  }
  buildLines(t, roster);
  return t;
}

function record(T: Tournament, g: IntlGame) {
  const add = (c: string, gf: number, ga: number) => {
    const r = T.table[c];
    r.gp++; r.gf += gf; r.ga += ga;
    if (gf > ga) { if (g.ot) { r.otw++; r.pts += 2; } else { r.w++; r.pts += 3; } }
    else if (g.ot) { r.otl++; r.pts += 1; }
    else r.l++;
  };
  add(g.h, g.hs!, g.as!);
  add(g.a, g.as!, g.hs!);
}

function applyStats(L: League, T: Tournament, box: MatchBox) {
  const key = intlKey(T);
  const r = box.result;
  for (const s of box.skaters) {
    const l = line(s.p, key) as SkaterLine;
    l.gp++; l.g += s.g; l.a += s.a; l.pts += s.g + s.a; l.pm += s.pm; l.pim += s.pim; l.sog += s.sog;
    l.ppg += s.ppg; l.ppp += s.ppp; l.toi += s.toi; l.hits += s.hits; l.blk += s.blk;
    if (box.gwg === s.id) l.gwg++;
  }
  for (const [side, opp, won] of [[box.home, box.away, r.hs > r.as], [box.away, box.home, r.as > r.hs]] as const) {
    const l = line(side.goalie, key) as GoalieLine;
    const allowed = opp.score - (r.ot === 'SO' && !won ? 1 : 0);
    l.gp++; l.gs++; l.sa += opp.shots; l.ga += allowed; l.toi += 3600;
    if (won) l.w++; else l.l++;
    if (allowed === 0 && won) l.so++;
  }
  for (const inj of r.injuries) {
    const p = L.players[inj.id];
    if (p && !p.inj) p.inj = { type: `${inj.type} (в сборной)`, days: inj.days, total: inj.days };
  }
}

function playGame(L: League, T: Tournament, g: IntlGame) {
  const H = nationTeam(L, T, g.h), A = nationTeam(L, T, g.a);
  const box = simulateMatch(L, H, A, { playoff: !/^[A-C]$/.test(g.stage), style: LEAGUE_STYLE.NHL });
  const r = box.result;
  g.played = true; g.hs = r.hs; g.as = r.as; g.ot = r.ot; g.shH = r.shH; g.shA = r.shA; g.stars = r.stars;
  if (/^[A-C]$/.test(g.stage)) record(T, g);
  applyStats(L, T, box);
  const me = proPlayer(L);
  if (me && (T.rosters[g.h]?.includes(me.id) || T.rosters[g.a]?.includes(me.id))) unlock(L, 'pro_national');
}

/** Standings of a group (IIHF points, then goal difference and goals). */
export function groupTable(T: Tournament, g: string) {
  return [...T.groups[g]].sort((a, b) => {
    const x = T.table[a], y = T.table[b];
    return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || a.localeCompare(b);
  });
}

const winnerOf = (g: IntlGame) => ((g.hs ?? 0) > (g.as ?? 0) ? g.h : g.a);
const loserOf = (g: IntlGame) => ((g.hs ?? 0) > (g.as ?? 0) ? g.a : g.h);

/** Preliminary-round ranking of all teams (used for re-seeding and final placements). */
function prelimOrder(T: Tournament) {
  const tables = Object.keys(T.groups).map((g) => groupTable(T, g));
  const out: string[] = [];
  const maxLen = Math.max(...tables.map((t) => t.length));
  for (let pos = 0; pos < maxLen; pos++) {
    const tier = tables.map((t) => t[pos]).filter(Boolean);
    tier.sort((a, b) => {
      const x = T.table[a], y = T.table[b];
      return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf;
    });
    out.push(...tier);
  }
  return out;
}

function addGame(L: League, T: Tournament, day: number, h: string, a: string, stage: string) {
  T.games.push({ id: L.intl!.nextGameId++, day: addDays(T.start, day), h, a, stage });
}

const stageDone = (T: Tournament, st: (s: string) => boolean) => {
  const gs = T.games.filter((g) => st(g.stage));
  return gs.length > 0 && gs.every((g) => g.played);
};
const has = (T: Tournament, stage: string) => T.games.some((g) => g.stage === stage);

/** Creates the next knockout stage once the previous one is complete. */
function progress(L: League, T: Tournament) {
  const groupsDone = stageDone(T, (s) => /^[A-C]$/.test(s));
  if (!groupsDone) return;
  if (T.phase === 'group') {
    T.phase = 'playoff';
    if (T.kind === 'wc') {
      const A = groupTable(T, 'A'), B = groupTable(T, 'B');
      addGame(L, T, 12, A[0], B[3], 'qf');
      addGame(L, T, 12, A[1], B[2], 'qf');
      addGame(L, T, 12, B[0], A[3], 'qf');
      addGame(L, T, 12, B[1], A[2], 'qf');
    } else {
      const order = prelimOrder(T);
      for (let i = 4; i < 8; i++) addGame(L, T, 6, order[i], order[15 - i], 'q');
    }
    pushNews(L, { kind: 'league', title: `${T.name}: групповой этап завершён`, body: Object.keys(T.groups).map((g) => `Группа ${g}: ${groupTable(T, g).map((c) => NATIONS[c].name).join(', ')}`).join('\n') });
    return;
  }
  const order = prelimOrder(T);
  const seedSort = (arr: string[]) => [...arr].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (T.kind === 'og' && stageDone(T, (s) => s === 'q') && !has(T, 'qf')) {
    const q = seedSort(T.games.filter((g) => g.stage === 'q').map(winnerOf));
    // Top four meet the qualification winners, best seed against the lowest one.
    for (let i = 0; i < 4; i++) addGame(L, T, 8, order[i], q[3 - i], 'qf');
    return;
  }
  if (stageDone(T, (s) => s === 'qf') && !has(T, 'sf')) {
    const w = seedSort(T.games.filter((g) => g.stage === 'qf').map(winnerOf));
    const d = T.kind === 'wc' ? 14 : 10;
    addGame(L, T, d, w[0], w[3], 'sf');
    addGame(L, T, d, w[1], w[2], 'sf');
    pushNews(L, { kind: 'league', title: `${T.name}: полуфиналы`, body: `${NATIONS[w[0]].name} — ${NATIONS[w[3]].name}\n${NATIONS[w[1]].name} — ${NATIONS[w[2]].name}` });
    return;
  }
  if (stageDone(T, (s) => s === 'sf') && !has(T, 'final')) {
    const sf = T.games.filter((g) => g.stage === 'sf');
    const d = T.kind === 'wc' ? 16 : 12;
    addGame(L, T, d - (T.kind === 'og' ? 1 : 0), loserOf(sf[0]), loserOf(sf[1]), 'bronze');
    addGame(L, T, d, winnerOf(sf[0]), winnerOf(sf[1]), 'final');
    return;
  }
  if (stageDone(T, (s) => s === 'final' || s === 'bronze') && has(T, 'final')) finish(L, T);
}

/** Final placements 1..n. */
function placements(T: Tournament): string[] {
  const order = prelimOrder(T);
  const fin = T.games.find((g) => g.stage === 'final')!;
  const br = T.games.find((g) => g.stage === 'bronze')!;
  const top = [winnerOf(fin), loserOf(fin), winnerOf(br), loserOf(br)];
  const qfLosers = T.games.filter((g) => g.stage === 'qf').map(loserOf).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const qLosers = T.games.filter((g) => g.stage === 'q').map(loserOf).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const placed = new Set([...top, ...qfLosers, ...qLosers]);
  return [...top, ...qfLosers, ...qLosers, ...order.filter((c) => !placed.has(c))];
}

function finish(L: League, T: Tournament) {
  const I = L.intl!;
  T.phase = 'done';
  const rank = placements(T);
  T.rank = rank;
  T.medals = rank.slice(0, 3);
  const key = intlKey(T);
  // Tournament MVP (from the medallists) and the top scorer.
  let mvp: Player | null = null, mv = -1, top: Player | null = null, tv = -1;
  for (const c of T.teams) {
    for (const id of T.rosters[c] ?? []) {
      const p = L.players[id];
      const s = p?.stats[key];
      if (!s) continue;
      if (p.pos !== 'G' && (s as SkaterLine).pts > tv) { tv = (s as SkaterLine).pts; top = p; }
      const medal = T.medals.indexOf(c);
      if (medal < 0) continue;
      const v = (p.pos === 'G' ? ((s as GoalieLine).sa ? (((s as GoalieLine).sa - (s as GoalieLine).ga) / (s as GoalieLine).sa - 0.9) * 120 + (s as GoalieLine).w : 0) : (s as SkaterLine).pts * 1.2 + (s as SkaterLine).g * 0.3) * (1 - medal * 0.12);
      if (v > mv) { mv = v; mvp = p; }
    }
  }
  T.mvp = mvp?.id;
  const medalName = ['gold', 'silver', 'bronze'];
  T.medals.forEach((c, i) => {
    for (const id of T.rosters[c] ?? []) {
      const p = L.players[id];
      if (p?.stats[key]) (p.intl ??= []).push(`${T.kind}:${T.year}:${medalName[i]}`);
    }
  });
  for (const c of T.teams) for (const id of T.rosters[c] ?? []) {
    const p = L.players[id];
    if (p?.stats[key] && !(p.intl ?? []).some((x) => x.startsWith(`${T.kind}:${T.year}`))) (p.intl ??= []).push(`${T.kind}:${T.year}`);
  }
  if (mvp) mvp.awards.push(`${T.kind}-mvp:${T.year}`);
  const [gold, silver, bronze] = T.medals;
  pushNews(L, {
    kind: 'league', important: true,
    title: `🥇 ${NATIONS[gold].name} — ${T.kind === 'og' ? 'олимпийские чемпионы' : 'чемпионы мира'} ${T.year}!`,
    body: `Серебро — ${NATIONS[silver].name}, бронза — ${NATIONS[bronze].name}.${mvp ? ` MVP турнира: ${mvp.fn} ${mvp.ln}.` : ''}${top ? ` Лучший бомбардир: ${top.fn} ${top.ln} (${tv}).` : ''}`,
  });
  social(L, `${NATIONS[gold].name} ${T.kind === 'og' ? 'берёт олимпийское золото' : 'выигрывает чемпионат мира'}! ${hash01(T.year, 3) < 0.5 ? 'Какой турнир!' : 'Заслуженно.'}`, { kind: 'fan' });
  // User involvement
  if (I.coach && T.teams.includes(I.coach) && isGM(L)) {
    const place = rank.indexOf(I.coach) + 1;
    L.gm.rep = clamp(L.gm.rep + (place === 1 ? 6 : place <= 3 ? 3 : place <= 8 ? 0 : -2), 0, 100);
    if (place === 1) unlock(L, 'intl_gold');
    pushMsg(L, { from: `Федерация хоккея: ${NATIONS[I.coach].name}`, kind: 'league', title: `${T.name}: ${place <= 3 ? ['золото', 'серебро', 'бронза'][place - 1] : `${place}-е место`}`, body: place === 1 ? 'Вы привели сборную к золоту. Страна гордится вами!' : place <= 3 ? 'Медаль! Отличный турнир.' : 'Турнир завершён. Работа со сборной продолжается.', ref: { type: 'screen', id: 'intl' } });
    L.stops.push('intl-final');
  }
  const me = proPlayer(L);
  if (me && me.stats[key]) {
    const c = nationOf(me)!;
    const place = rank.indexOf(c) + 1;
    if (place === 1) unlock(L, 'pro_gold');
    L.stops.push('intl-final');
  }
  I.history.unshift({ id: T.id, kind: T.kind, year: T.year, name: T.name, medals: T.medals, mvp: T.mvp, topScorer: top ? { id: top.id, name: `${top.fn} ${top.ln}`, pts: tv } : undefined, coach: I.coach, coachRank: I.coach ? rank.indexOf(I.coach) + 1 || undefined : undefined });
  // World ranking: weighted recent placements (Olympics count as much as a World Championship).
  for (const c of T.teams) (I.recent[c] ??= []).unshift(rank.indexOf(c) + 1);
  for (const c of Object.keys(I.recent)) I.recent[c] = I.recent[c].slice(0, 4);
  const score = (c: string) => {
    const r = I.recent[c] ?? [];
    const w = [1, 0.75, 0.5, 0.25];
    return r.reduce((s, x, i) => s + w[i] * (20 - x), 0) - NATIONS[c].rank * 0.05;
  };
  I.ranking = Object.keys(NATIONS).sort((a, b) => score(b) - score(a));
  if (T.kind === 'wc') relegation(L, T);
  I.prev = T;
  I.current = null;
}

/** Last place of each group goes down; two Division I teams come up (stronger rosters do better). */
function relegation(L: League, T: Tournament) {
  const I = L.intl!;
  const down = Object.keys(T.groups).map((g) => groupTable(T, g).slice(-1)[0]);
  // Russia and Belarus are not part of the promotion race: when admitted they enter the field directly.
  const cands = Object.keys(NATIONS).filter((c) => !T.teams.includes(c) && !SUSPENDED.has(c));
  const strength = (c: string) => {
    const ovr: number[] = [];
    for (const id in L.players) { const p = L.players[id]; if (p.st !== 'RET' && nationOf(p) === c) ovr.push(p.ovr); }
    ovr.sort((a, b) => b - a);
    return ovr.slice(0, 20).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(20, ovr.length));
  };
  const up: string[] = [];
  const pool = shuffle([...cands]);
  for (let k = 0; k < 2 && pool.length; k++) {
    const pick = weighted(pool, pool.map((c) => Math.exp((strength(c) - 55) / 2.5 + normal(0, 0.3))));
    up.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  I.field = [...T.teams.filter((c) => !down.includes(c)), ...up];
  pushNews(L, { kind: 'league', title: `IIHF: ${down.map((c) => NATIONS[c].name).join(' и ')} покидают элиту`, body: up.length ? `В высший дивизион поднимаются: ${up.map((c) => NATIONS[c].name).join(', ')}.` : undefined });
}

/** Daily tournament routine: rosters, games, knockout stages, medals. */
export function intlDaily(L: League) {
  const I = L.intl;
  if (!I) return;
  if (!I.current) ensureNext(L);
  const T = I.current;
  if (!T) return;
  if (!T.named && L.date >= T.select) nameRosters(L, T);
  if (T.phase === 'upcoming' && L.date >= T.start) {
    T.phase = 'group';
    const note = !L.settings.intlRussia && T.year >= 2027 ? ' Сборные России и Беларуси по-прежнему отстранены IIHF.' : '';
    pushNews(L, { kind: 'league', important: T.kind === 'og', title: `Стартует ${T.kind === 'og' ? 'олимпийский хоккейный турнир' : `чемпионат мира ${T.year}`}${T.host ? ` (${T.host})` : ''}`, body: `${T.teams.length} сборных.${note}` });
  }
  if (T.phase === 'group' || T.phase === 'playoff') {
    for (const g of T.games) if (g.day === L.date && !g.played) playGame(L, T, g);
    // Knockout stages may chain on the same evening only after their games are played.
    for (let i = 0; i < 4 && (T.phase as Tournament['phase']) !== 'done'; i++) {
      const before = T.games.length;
      progress(L, T);
      if (T.games.length === before) break;
    }
  }
}

/** Tournaments a player took part in: [key, line] pairs, newest first. */
export function intlLines(p: Player) {
  return Object.entries(p.stats).filter(([k]) => /^\d{4}(wc|og)$/.test(k)).sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export const KIND_RU: Record<IntlKind, string> = { wc: 'ЧМ', og: 'ОИ' };
