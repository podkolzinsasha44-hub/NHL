// Club finances of the user's club: attendance, ticket prices, revenue and expenses.
// Real club books are not public, so the numbers are a reference model (ориентир): arena
// capacities are the real hockey capacities (rounded), revenue streams are scaled to the
// league's public totals (NHL ≈ $6.6B a season, KHL clubs live on sponsor budgets).
// Attendance never feeds back into the match engine: the home advantage stays the same for
// everybody, finances only move fans' mood, the owner's trust and the club's books.
import { capHit, capIn } from './contracts';
import { hash01 } from './rng';
import type { FinanceLine, FinanceState, Game, League, Team } from './types';
import { isGM, lgOf, RUB_PER_USD } from './leagues';
import { unlock } from './achievements';
import { clamp, daysBetween } from './util';

/** Hockey capacity of the home arenas (rounded; Utah: Delta Center after the 2025 expansion). */
export const ARENA: Record<string, number> = {
  ANA: 17174, BOS: 17850, BUF: 19070, CGY: 19289, CAR: 18680, CHI: 19717, COL: 18007, CBJ: 18500,
  DAL: 18532, DET: 19515, EDM: 18347, FLA: 19250, LAK: 18230, MIN: 17954, MTL: 21105, NSH: 17159,
  NJD: 16514, NYI: 17255, NYR: 18006, OTT: 18652, PHI: 19537, PIT: 18387, SJS: 17435, SEA: 17151,
  STL: 18096, TBL: 19092, TOR: 18800, UTA: 16200, VAN: 18910, VGK: 17500, WSH: 18573, WPG: 15225,
  // KHL
  SKA: 21500, CSK: 12100, DMS: 11500, SPR: 12100, LOK: 9070, SEV: 6064, TRP: 5600, DMN: 15086,
  SCH: 12000, LAD: 6000, SHA: 7000, AKB: 8890, AVG: 12000, MMG: 7700, SYU: 8250, TRK: 7500,
  AVT: 12500, SIB: 10500, BAR: 11578, NFT: 5500, AMR: 7100, ADM: 5500,
};
/** Outdoor games (Winter Classic) are played on football stadiums. */
const STADIUM = 60000;

/** Ticket price levels: −2..+2 → share of the club's base price. */
export const PRICE_MUL = [0.7, 0.85, 1, 1.15, 1.3];
export const PRICE_RU = ['Очень низкие', 'Низкие', 'Обычные', 'Высокие', 'Очень высокие'];
export const priceMul = (level: number) => PRICE_MUL[clamp(Math.round(level), -2, 2) + 2];

/** Annual budget of one club service (medicine, analytics, scouting) by level 1..3, NHL dollars. */
export const STAFF_LEVEL_COST = [0, 1_000_000, 2_500_000, 4_500_000];
/** KHL budgets are roughly an eighth of the NHL ones. */
const KHL_SCALE = 0.12;

const isKhl = (t: Team) => lgOf(t) === 'KHL';
export const arenaCapacity = (t: Team) => ARENA[t.id] ?? (isKhl(t) ? 8000 : 18000);

/** Average ticket price at the normal level. */
export function basePrice(t: Team) {
  if (isKhl(t)) return 11 + (t.bigMarket ? 6 : 0);
  return 85 + (t.bigMarket ? 45 : 0) + (t.canada ? 25 : 0);
}
/** Food, drinks and merchandise per spectator. */
const perCap = (t: Team) => (isKhl(t) ? 5 : 35);

function seasonGames(t: Team) {
  return isKhl(t) ? 68 : 84;
}

/** Points percentage used by the fans: this season after a few games, last season before. */
function pointsPct(t: Team) {
  if (t.rec.gp >= 5) return t.rec.pts / (2 * t.rec.gp);
  if (t.last) {
    const gp = t.last.w + t.last.l + t.last.otl;
    if (gp) return t.last.pts / (2 * gp);
  }
  return 0.5;
}

export interface DemandCtx {
  rival?: boolean;
  weekend?: boolean;
  playoff?: boolean;
  outdoor?: boolean;
  /** Deterministic noise in −1..1 (per game). */
  noise?: number;
}

/** Share of the arena the fans would fill at a price level (can exceed 1: sold out). */
export function demand(t: Team, level: number, ctx: DemandCtx = {}) {
  let f = (isKhl(t) ? 0.75 : 0.93) + 0.45 * (t.fans / 100 - 0.6) + 0.6 * (pointsPct(t) - 0.5);
  if (t.bigMarket) f += 0.05;
  if (t.canada) f += 0.1;
  if (ctx.rival) f += 0.06;
  if (ctx.weekend) f += 0.05;
  if (ctx.playoff) f += 0.35;
  if (ctx.outdoor) f += 0.6;
  f += (ctx.noise ?? 0) * 0.04;
  return f / Math.pow(priceMul(level), 1.3);
}

const isRival = (L: League, a: string, b: string) => L.rivals.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** Price level a club uses: the user's choice for the managed club, normal for AI clubs. */
const levelOf = (L: League, team: string) => (isGM(L) && team === L.user ? L.fin?.price ?? 0 : 0);

/** Spectators at a game (deterministic: no draw from the match RNG). */
export function attendanceFor(L: League, g: Game) {
  const t = L.teams[g.h];
  if (!t || !L.teams[g.a]) return 0;
  const outdoor = g.special === 'classic';
  const cap = outdoor ? STADIUM : arenaCapacity(t);
  const dow = new Date(g.day + 'T12:00:00Z').getUTCDay();
  const f = demand(t, levelOf(L, t.id), {
    rival: isRival(L, g.h, g.a),
    weekend: dow === 5 || dow === 6,
    playoff: !!g.series,
    outdoor,
    noise: hash01(g.id, 77) * 2 - 1,
  });
  return Math.round(cap * clamp(f, 0.3, 1));
}

export function emptyLine(season: number, team: string): FinanceLine {
  return { season, team, gate: 0, extra: 0, media: 0, sponsor: 0, playoff: 0, payroll: 0, staff: 0, ops: 0, events: 0, homeGames: 0, att: 0, sellouts: 0 };
}

export const revenueOf = (x: FinanceLine) => x.gate + x.extra + x.media + x.sponsor + x.playoff;
export const expensesOf = (x: FinanceLine) => x.payroll + x.staff + x.ops + x.events;
export const profitOf = (x: FinanceLine) => revenueOf(x) - expensesOf(x);

/** Finances of the managed club (created on first use; player careers have none). */
export function ensureFin(L: League): FinanceState | null {
  if (!isGM(L) || !L.user || !L.teams[L.user]) return null;
  if (!L.fin) L.fin = { price: 0, cur: emptyLine(L.season, L.user), hist: [], games: [] };
  if (L.fin.cur.team !== L.user) {
    // New club (job change): the books of the old club are closed as they are.
    if (L.fin.cur.homeGames || L.fin.cur.payroll) L.fin.hist.unshift(L.fin.cur);
    L.fin.cur = emptyLine(L.season, L.user);
    L.fin.games = [];
  }
  return L.fin;
}

/** Media rights per season (national + local). */
export function mediaSeason(t: Team) {
  if (isKhl(t)) return 1_500_000;
  return 46_000_000 + (t.bigMarket ? 28_000_000 : t.canada ? 22_000_000 : 12_000_000);
}
/** Sponsors, suites and merchandise outside the arena: they follow the fans' mood. */
export function sponsorSeason(L: League, t: Team) {
  const mood = t.fans / 100;
  if (isKhl(t)) return capIn(L, 'KHL') * 0.7 * (t.bigMarket ? 1.1 : 0.9) * (0.85 + 0.3 * mood);
  return 28_000_000 * (0.75 + 0.5 * mood) * (t.bigMarket ? 1.35 : 1) * (t.canada ? 1.1 : 1);
}
/** Head coach and club services. */
export function staffSeason(t: Team) {
  const k = isKhl(t) ? KHL_SCALE : 1;
  const services = (STAFF_LEVEL_COST[t.staff.med] + STAFF_LEVEL_COST[t.staff.analytics] + STAFF_LEVEL_COST[t.staff.scouting]) * k;
  return t.coach.salary + services;
}
/** Arena operations, travel and hockey operations. */
export const opsSeason = (t: Team) => (isKhl(t) ? 3_500_000 : 38_000_000);

/**
 * Books one played game: attendance for every game (shown in the match centre and schedules),
 * money for the user's club. Fans react to ticket prices at home games.
 */
export function financeOnGame(L: League, g: Game) {
  g.att = attendanceFor(L, g);
  if (!isGM(L) || (g.h !== L.user && g.a !== L.user)) return;
  const F = ensureFin(L);
  if (!F) return;
  const t = L.teams[L.user];
  if (F.cur.season !== L.season) {
    // Books for a new season start with its first game.
    if (F.cur.homeGames || F.cur.payroll) F.hist.unshift(F.cur);
    if (F.hist.length > 12) F.hist.length = 12;
    F.cur = emptyLine(L.season, L.user);
  }
  const c = F.cur;
  const home = g.h === L.user;
  const price = basePrice(t) * priceMul(F.price);
  if (g.series) {
    if (home) c.playoff += g.att * (price * 1.6 + perCap(t));
    return;
  }
  const n = seasonGames(t);
  c.media += mediaSeason(t) / n;
  c.sponsor += sponsorSeason(L, t) / n;
  c.payroll += capHit(L, L.user) / n;
  c.staff += staffSeason(t) / n;
  c.ops += opsSeason(t) / n;
  if (!home) return;
  const cap = g.special === 'classic' ? STADIUM : arenaCapacity(t);
  c.gate += g.att * price;
  c.extra += g.att * perCap(t);
  c.homeGames++;
  c.att += g.att;
  if (g.att >= cap) c.sellouts++;
  F.games.push([g.day, g.att, cap]);
  if (F.games.length > 50) F.games.shift();
  // Expensive tickets annoy the fans, cheap ones win them over (slowly).
  t.fans = clamp(t.fans + (1 - priceMul(F.price)) * 0.8, 0, 100);
}

/** Prize money and gate of a one-off cup game. */
export function financeBonus(L: League, amount: number) {
  const F = ensureFin(L);
  if (!F) return;
  F.cur.playoff += amount;
}

/**
 * Closes the user's season books at the owner's review. Returns the owner's trust change for the
 * finances: owners of big clubs expect a profit, KHL owners only want the budget kept.
 */
export function closeFinanceSeason(L: League): { profit: number; delta: number } | null {
  const F = ensureFin(L);
  if (!F || !F.cur.homeGames) return null;
  const t = L.teams[L.user];
  const profit = profitOf(F.cur);
  let delta: number;
  if (isKhl(t)) delta = clamp(Math.round(profit / 1_500_000), -4, 3);
  else {
    const expect = t.bigMarket ? 60_000_000 : t.canada ? 40_000_000 : 10_000_000;
    delta = clamp(Math.round((profit - expect) / 15_000_000), -4, 3);
  }
  if (profit >= (isKhl(t) ? 300_000_000 / RUB_PER_USD : 50_000_000)) unlock(L, 'tycoon');
  if (F.cur.homeGames >= 30 && F.cur.sellouts >= F.cur.homeGames * 0.8) unlock(L, 'full_house');
  F.hist.unshift(F.cur);
  if (F.hist.length > 12) F.hist.length = 12;
  F.cur = emptyLine(L.season + 1, L.user);
  return { profit, delta };
}

/** Forecast for the price screen: the same model the season uses. */
export function priceForecast(L: League, level: number) {
  const t = L.teams[L.user];
  const cap = arenaCapacity(t);
  const avg = (demand(t, level, { weekend: false }) * 5 + demand(t, level, { weekend: true }) * 2) / 7;
  const att = Math.round(cap * clamp(avg, 0.3, 1));
  const price = basePrice(t) * priceMul(level);
  return {
    level,
    price,
    att,
    fill: att / cap,
    perGame: att * (price + perCap(t)),
    fansPerSeason: (1 - priceMul(level)) * 0.8 * (seasonGames(t) / 2),
  };
}

/** Projected full-season books at the current pace (regular season). */
export function projectSeason(L: League) {
  const F = L.fin;
  const t = L.teams[L.user];
  if (!F || !t) return null;
  const n = seasonGames(t);
  const gp = Math.max(1, t.rec.gp);
  const c = F.cur.season === L.season ? F.cur : emptyLine(L.season, L.user);
  if (!c.homeGames) {
    const fc = priceForecast(L, F.price);
    const homes = n / 2;
    return {
      ...emptyLine(L.season, L.user),
      gate: fc.att * fc.price * homes, extra: fc.att * perCap(t) * homes,
      media: mediaSeason(t), sponsor: sponsorSeason(L, t), payroll: capHit(L, L.user), staff: staffSeason(t), ops: opsSeason(t),
      homeGames: homes, att: fc.att * homes,
    };
  }
  const k = n / gp;
  return { ...c, gate: c.gate * k, extra: c.extra * k, media: c.media * k, sponsor: c.sponsor * k, payroll: c.payroll * k, staff: c.staff * k, ops: c.ops * k, homeGames: Math.round(c.homeGames * k), att: c.att * k };
}

export const PROMO_COOLDOWN = 30;
export const promoCost = (t: Team) => (isKhl(t) ? 60_000 : 750_000);

/** Fan event (open practice, autograph day, cheap family tickets): costs money, lifts the mood. */
export function fanEvent(L: League): { ok: boolean; text: string } {
  const F = ensureFin(L);
  if (!F) return { ok: false, text: 'Недоступно' };
  if (F.promo && daysBetween(F.promo, L.date) < PROMO_COOLDOWN) return { ok: false, text: `Следующая акция возможна через ${PROMO_COOLDOWN - daysBetween(F.promo, L.date)} дн.` };
  const t = L.teams[L.user];
  const gain = t.fans < 40 ? 6 : t.fans < 70 ? 4 : 2;
  t.fans = clamp(t.fans + gain, 0, 100);
  F.cur.events += promoCost(t);
  F.promo = L.date;
  return { ok: true, text: `Болельщики оценили: настроение трибун +${gain}` };
}
