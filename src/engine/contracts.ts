// Salary cap & contracts (CBA 2026-27, simplified where noted).
import { hash01, next } from './rng';
import { pushMsg, pushNews, social } from './news';
import type { Contract, League, LeagueId, Negotiation, Player } from './types';
import { age, ageOn, capOf, clamp, floorOf, minSalaryOf } from './util';
import { teamPower } from './lines';
import { leagueTeams, lgOf, RUB_PER_USD, teamLg } from './leagues';

export const MAX_SHARE = 0.2;
export const ELC_MAX = (L: League, season: number) => (season <= 2026 ? 1_000_000 : minSalaryOf(L, season) + 175_000);

const SHARE_CURVE: [number, number][] = [[40, 0], [68, 0], [70, 0.0105], [72, 0.0135], [74, 0.019], [76, 0.026], [78, 0.035], [80, 0.045], [82, 0.057], [85, 0.077], [87, 0.092], [90, 0.115], [93, 0.14], [97, 0.17], [99, 0.19]];
function curve(pts: [number, number][], x: number) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// ---------- League economics ----------
// All money is stored in US dollars; KHL figures are set in roubles by the league and converted
// with a fixed reference rate (RUB_PER_USD). KHL cap: ₽950M in 2026-27, ₽1B in 2027-28; floor ₽525M / ₽600M.
const KHL_CAP_RUB: Record<number, number> = { 2026: 950e6, 2027: 1000e6 };
const KHL_FLOOR_RUB: Record<number, number> = { 2026: 525e6, 2027: 600e6 };
/** Minimum KHL salary (reference value; juniors on the main roster earn at least ₽750K). */
export const KHL_MIN_RUB = 1_000_000;
/** KHL salary by rating, millions of roubles (top earners 2026-27 make ₽75–100M). */
const KHL_CURVE: [number, number][] = [[50, 1], [58, 1.5], [62, 3.5], [65, 7], [68, 14], [71, 26], [74, 44], [77, 66], [80, 88], [83, 110], [87, 135], [92, 160]];

const rubToUsd = (rub: number) => Math.round(rub / RUB_PER_USD / 1000) * 1000;

function khlCapRub(season: number) {
  if (KHL_CAP_RUB[season]) return KHL_CAP_RUB[season];
  return Math.round((KHL_CAP_RUB[2027] * 1.03 ** (season - 2027)) / 25e6) * 25e6;
}

export function capIn(L: League, lg: LeagueId, season = L.season) {
  return lg === 'KHL' ? rubToUsd(khlCapRub(season)) : capOf(L, season);
}
export function floorIn(L: League, lg: LeagueId, season = L.season) {
  return lg === 'KHL' ? rubToUsd(KHL_FLOOR_RUB[season] ?? khlCapRub(season) * 0.6) : floorOf(L, season);
}
export function minSalaryIn(L: League, lg: LeagueId, season = L.season) {
  return lg === 'KHL' ? rubToUsd(KHL_MIN_RUB) : minSalaryOf(L, season);
}
const lgFor = (L: League, team: string): LeagueId => teamLg(L, team) ?? 'NHL';
export const capFor = (L: League, team: string, season = L.season) => capIn(L, lgFor(L, team), season);
export const floorFor = (L: League, team: string, season = L.season) => floorIn(L, lgFor(L, team), season);
export const minSalaryFor = (L: League, team: string, season = L.season) => minSalaryIn(L, lgFor(L, team), season);

/** Salary step used in offers: $25K in the NHL, ~₽100K in the KHL. */
export function roundSalary(aav: number, lg: LeagueId = 'NHL') {
  const step = lg === 'KHL' ? 1000 : 25_000;
  return Math.round(aav / step) * step;
}

/** Contract amount for news and messages: dollars in the NHL, roubles in the KHL. */
export function salaryText(aav: number, lg: LeagueId = 'NHL') {
  if (lg === 'KHL') {
    const rub = aav * RUB_PER_USD;
    return rub >= 10e6 ? `₽${Math.round(rub / 1e6)} млн` : `₽${(rub / 1e6).toFixed(1)} млн`;
  }
  return `$${(aav / 1e6).toFixed(2)}M`;
}

/** Cap hit counted against a team this season. */
export function capHit(L: League, team: string, season = L.season): number {
  let sum = 0;
  const khl = lgFor(L, team) === 'KHL';
  const buriedAllowance = khl ? minSalaryIn(L, 'KHL', season) * 4 : minSalaryOf(L, season) + 375_000;
  const ltirPhase = khl ? L.khl?.phase === 'regular' : L.phase === 'regular';
  for (const id in L.players) {
    const p = L.players[id];
    const c = p.c;
    if (!c || c.last < season) continue;
    if (p.team === team) {
      if (season === L.season && p.st === 'AHL') sum += Math.max(0, c.aav - buriedAllowance);
      else if (p.st === 'NHL' || season > L.season) {
        if (season === L.season && ltirPhase && isLTIR(p)) continue;
        sum += c.aav;
      }
      if (c.retainedBy) for (const r of c.retainedBy) sum -= r.amount;
    } else if (c.retainedBy) {
      for (const r of c.retainedBy) if (r.team === team) sum += r.amount;
    }
  }
  for (const d of deadCap(L)) if (d.team === team && d.season === season) sum += d.amount;
  return sum;
}

/** Cap hits of every club in one pass (same rules as capHit). */
export function allCapHits(L: League, season = L.season): Record<string, number> {
  const out: Record<string, number> = {};
  const allow: Record<string, number> = {};
  const ltir: Record<string, boolean> = {};
  for (const t of Object.values(L.teams)) {
    out[t.id] = 0;
    const khl = lgOf(t) === 'KHL';
    allow[t.id] = khl ? minSalaryIn(L, 'KHL', season) * 4 : minSalaryOf(L, season) + 375_000;
    ltir[t.id] = khl ? L.khl?.phase === 'regular' : L.phase === 'regular';
  }
  for (const id in L.players) {
    const p = L.players[id];
    const c = p.c;
    if (!c || c.last < season) continue;
    const team = p.team;
    if (team && out[team] != null) {
      if (season === L.season && p.st === 'AHL') out[team] += Math.max(0, c.aav - allow[team]);
      else if ((p.st === 'NHL' || season > L.season) && !(season === L.season && ltir[team] && isLTIR(p))) out[team] += c.aav;
    }
    if (c.retainedBy) for (const r of c.retainedBy) {
      if (team && out[team] != null) out[team] -= r.amount;
      if (out[r.team] != null) out[r.team] += r.amount;
    }
  }
  for (const d of deadCap(L)) if (d.season === season && out[d.team] != null) out[d.team] += d.amount;
  return out;
}

export function isLTIR(p: Player) {
  return !!p.inj && p.inj.days >= 24;
}

export function deadCap(L: League) {
  return L.dead;
}

export function capSpace(L: League, team: string, season = L.season) {
  return capFor(L, team, season) - capHit(L, team, season);
}

export function contractCount(L: League, team: string) {
  let n = 0;
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === team && p.c && p.c.last >= L.season && p.st !== 'RET') n++;
  }
  return n;
}

export function yearsLeft(L: League, c: Contract) {
  return Math.max(0, c.last - L.season + 1);
}

/** What the player would earn on the open market right now. */
export function marketValue(L: League, p: Player, season = L.season + (L.date.slice(5) >= '03-01' && L.phase !== 'freeagency' ? 1 : 0)): number {
  const a = ageOn(p.bd, `${season}-10-01`);
  // Young players are paid partly for their projected peak
  let basis = p.ovr;
  if (a <= 24) basis = p.ovr + (p.pot - p.ovr) * (a <= 21 ? 0.35 : 0.25);
  let share = curve(SHARE_CURVE, basis);
  if (a >= 35) share *= 0.65;
  else if (a >= 33) share *= 0.78;
  else if (a >= 31) share *= 0.9;
  if (p.pos === 'G') share *= 0.95;
  const cap = capOf(L, season);
  const min = minSalaryOf(L, season);
  return clamp(Math.round((share * cap) / 25_000) * 25_000, min, MAX_SHARE * cap);
}

function valueBasis(p: Player, season: number) {
  const a = ageOn(p.bd, `${season}-10-01`);
  let basis = p.ovr;
  if (a <= 24) basis = p.ovr + (p.pot - p.ovr) * (a <= 21 ? 0.35 : 0.25);
  let mul = 1;
  if (a >= 35) mul = 0.65;
  else if (a >= 33) mul = 0.78;
  else if (a >= 31) mul = 0.9;
  return { basis, mul };
}

/** Market value in a given league (KHL salaries follow their own, much lower scale). */
export function marketValueIn(L: League, p: Player, lg: LeagueId, season?: number): number {
  if (lg === 'NHL') return season == null ? marketValue(L, p) : marketValue(L, p, season);
  const s = season ?? L.season + (L.date.slice(5) >= '03-01' && L.phase !== 'freeagency' ? 1 : 0);
  const { basis, mul } = valueBasis(p, s);
  const rub = curve(KHL_CURVE, basis) * 1e6 * mul * (p.pos === 'G' ? 0.95 : 1);
  return clamp(rubToUsd(rub), minSalaryIn(L, 'KHL', s), Math.round(capIn(L, 'KHL', s) * 0.2));
}

/** What `team` would expect to pay the player (league of the team). */
export function valueFor(L: League, p: Player, team: string, season?: number) {
  return marketValueIn(L, p, lgFor(L, team), season);
}

/** Preferred term; KHL deals are shorter (most players sign for 1–3 seasons). */
export function preferredYearsFor(L: League, p: Player, team: string) {
  const y = preferredYears(L, p);
  return lgFor(L, team) === 'KHL' ? clamp(y - 2, 1, 4) : y;
}

export function preferredYears(L: League, p: Player): number {
  const a = age(p, L);
  if (a >= 36) return 1;
  if (a >= 33) return 2;
  if (a >= 30) return 4;
  if (a <= 22 && p.pot - p.ovr >= 6) return 2; // bridge deal
  return 5 + (hash01(p.id, 3) < 0.5 ? 1 : 2);
}

/** Maximum term allowed: 7 years re-signing with own team, 6 years elsewhere. */
export function maxTerm(own: boolean) {
  return own ? 7 : 6;
}

// ---------- Negotiation ----------

export function startNegotiation(L: League, p: Player, team: string, kind: Negotiation['kind']): Negotiation {
  const existing = L.negotiations[p.id];
  if (existing && existing.status === 'open' && existing.team === team) return existing;
  const lg = lgFor(L, team);
  const mv = marketValueIn(L, p, lg);
  const min = minSalaryIn(L, lg);
  const greed = (p.pers.greed - 10) / 100; // ±10%
  let mult = 1.05 + greed + (hash01(p.id, 11) - 0.5) * 0.1;
  const own = p.team === team;
  if (own) mult -= (p.pers.loy - 10) * 0.007;
  if (kind === 'rfa') mult -= 0.12; // RFAs have less leverage
  if (p.c?.type === 'ELC' && own) mult -= 0.05;
  const t = L.teams[team];
  if (p.pers.win >= 14 && t.strategy === 'contend') mult -= 0.06;
  if (t.taxFree) mult -= 0.03;
  if (team === L.user) mult -= (L.gm.rep - 50) / 1000;
  if (L.settings.difficulty === 'rookie') mult -= 0.05;
  if (L.settings.difficulty === 'hard') mult += 0.05;
  const ask = roundSalary(mv * clamp(mult, 0.75, 1.35), lg);
  const floor = roundSalary(ask * (0.86 - (p.pers.greed - 10) * 0.006 + (p.pers.loy - 10) * 0.004 * (own ? 1 : 0)), lg);
  const n: Negotiation = {
    player: p.id, team, kind,
    ask: { aav: Math.max(ask, min), years: Math.min(preferredYearsFor(L, p, team), maxTerm(own)) },
    floor: Math.max(floor, min),
    patience: 70 + p.pers.loy - p.pers.greed + (team === L.user ? (L.gm.rep - 50) / 3 : 0),
    rounds: 0,
    history: [],
    status: 'open',
  };
  L.negotiations[p.id] = n;
  return n;
}

export interface OfferTerms { aav: number; years: number; clause: 'NMC' | 'NTC' | null }
export interface OfferResult { status: 'accepted' | 'counter' | 'rejected' | 'walked'; message: string; counter?: { aav: number; years: number } }

/** Effective value of an offer for the player: money, term fit and clauses. */
export function offerUtility(n: Negotiation, o: OfferTerms) {
  const pref = n.ask.years;
  const termFit = 1 - Math.min(0.12, Math.abs(o.years - pref) * 0.03);
  const clause = o.clause === 'NMC' ? 1.04 : o.clause === 'NTC' ? 1.02 : 1;
  return o.aav * termFit * clause;
}

export function makeOffer(L: League, n: Negotiation, o: OfferTerms): OfferResult {
  const p = L.players[n.player];
  n.rounds++;
  const util = offerUtility(n, o);
  const own = p.team === n.team;
  if (o.years > maxTerm(own) || o.years < 1) return { status: 'rejected', message: `Срок должен быть от 1 до ${maxTerm(own)} лет.` };
  const space = capSpace(L, n.team, beforeNewLeagueYear(L) ? L.season + 1 : L.season);
  const currentAav = p.team === n.team && p.c && p.c.last >= L.season ? p.c.aav : 0;
  if (o.aav - currentAav > space && !(p.c && p.c.last >= L.season && n.kind === 'extend')) {
    return { status: 'rejected', message: 'Такой контракт не помещается под потолок зарплат.' };
  }
  let result: OfferResult;
  if (util >= n.ask.aav * 0.995) {
    result = { status: 'accepted', message: 'Мы согласны. Готовим бумаги!' };
  } else if (util >= n.floor) {
    const closeness = (util - n.floor) / Math.max(1, n.ask.aav - n.floor);
    if (next() < 0.25 + closeness * 0.6) result = { status: 'accepted', message: 'Это честное предложение. Договорились.' };
    else {
      // concede part of the gap
      const newAsk = roundSalary(n.ask.aav - (n.ask.aav - util) * 0.45, lgFor(L, n.team));
      n.ask.aav = Math.max(newAsk, n.floor);
      n.patience -= 6;
      result = { status: 'counter', message: 'Близко, но нам нужно чуть больше.', counter: { ...n.ask } };
    }
  } else {
    const gap = (n.floor - util) / n.floor;
    n.patience -= 10 + gap * 120;
    result = n.patience > 0
      ? { status: 'counter', message: gap > 0.25 ? 'Это несерьёзно. Мой клиент стоит намного больше.' : 'Предложение ниже наших ожиданий.', counter: { ...n.ask } }
      : { status: 'walked', message: 'Мы прекращаем переговоры. Вернёмся к этому разговору позже — может быть.' };
  }
  n.history.push({ aav: o.aav, years: o.years, clause: o.clause, result: result.status });
  if (result.status === 'walked') {
    n.status = 'broken';
    p.talksBlockedUntil = addDaysIso(L.date, 30);
    p.morale = clamp(p.morale - 8, 0, 100);
  }
  if (result.status === 'accepted') {
    n.status = 'signed';
    signContract(L, p, n.team, o, n.kind === 'extend' ? 'extend' : 'new');
  }
  return result;
}

function addDaysIso(iso: string, d: number) {
  const x = new Date(iso + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

/** Season in which a newly signed deal starts. Extensions begin after the current deal ends. */
export function dealStart(L: League, p: Player, kind: 'extend' | 'new') {
  if (kind === 'extend' && p.c && p.c.last >= L.season) return p.c.last + 1;
  return beforeNewLeagueYear(L) ? L.season + 1 : L.season;
}

/** Between the end of the playoffs and July 1 new deals start next season. */
export function beforeNewLeagueYear(L: League) {
  return (L.phase === 'offseason' || L.phase === 'draft') && L.date.slice(5) < '07-01';
}

export function signContract(L: League, p: Player, team: string, o: OfferTerms, kind: 'extend' | 'new', silent = false) {
  const start = dealStart(L, p, kind);
  const last = start + o.years - 1;
  const ageExp = ageOn(p.bd, `${last + 1}-07-01`);
  const prevTeam = p.team;
  const c: Contract = {
    aav: o.aav,
    last,
    type: 'STD',
    clause: o.clause,
    exp: ageExp < 27 ? 'RFA' : 'UFA',
    signed: L.season,
  };
  if (kind === 'extend' && p.c && p.c.last >= L.season) {
    p.ext = c;
  } else {
    p.c = c;
  }
  const lg = lgFor(L, team);
  const leftLeague = prevTeam && prevTeam !== team && lgFor(L, prevTeam) !== lg;
  p.team = team;
  if (lg === 'NHL') delete p.rights; // signing in the NHL uses up (or outlives) any draft rights
  if (!p.teams.includes(team)) p.teams.push(team);
  if (p.st === 'FA' || p.st === 'EUR' || p.st === 'JR' || p.st === 'NCAA' || leftLeague) {
    let healthy = 0;
    for (const id in L.players) { const x = L.players[id]; if (x.team === team && x.st === 'NHL' && !x.inj) healthy++; }
    // KHL clubs carry bigger main rosters; their farm is the VHL.
    p.st = lg === 'KHL' ? (p.ovr >= 60 && healthy < 23 ? 'NHL' : 'AHL') : p.ovr >= 66 && healthy < 23 ? 'NHL' : 'AHL';
  }
  p.lg = lg === 'KHL' ? 'KHL' : p.st === 'NHL' ? 'NHL' : 'AHL';
  p.wantsTrade = false;
  p.morale = clamp(p.morale + 10, 0, 100);
  if (team === L.user) {
    if (!L.album.includes(p.id)) L.album.push(p.id);
    L.seasonLog.signings++;
    L.seasonLog.spent += o.aav * o.years;
  }
  if (!silent && (o.aav >= (lg === 'KHL' ? 700_000 : 3_000_000) || team === L.user)) {
    const t = L.teams[team];
    const verb = prevTeam === team ? 'продлевает контракт с' : 'подписывает';
    pushNews(L, {
      kind: 'sign',
      title: `${t.short} ${verb} ${p.fn} ${p.ln}: ${o.years} × ${salaryText(o.aav, lg)}${o.clause ? ` (${o.clause})` : ''}`,
      team, players: [p.id],
      important: team === L.user,
    });
    if (o.aav >= 9_000_000 && lg === 'NHL') social(L, `${p.ln} получает $${(o.aav / 1e6).toFixed(1)}M в год. ${next() < 0.5 ? 'Переплата?' : 'Заслуженно!'}`, { kind: 'analyst', team, players: [p.id] });
  }
  delete L.negotiations[p.id];
}

/** Applies extensions that start this season (called at rollover). */
export function activateExtensions(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (p.ext && (!p.c || p.c.last < L.season)) {
      p.c = p.ext;
      delete p.ext;
    }
  }
}

export function extensionOf(p: Player) {
  return p.ext;
}

// ---------- ELC ----------

export function elcTerms(L: League, p: Player): OfferTerms & { years: number } {
  const a = age(p, L);
  const years = a <= 21 ? 3 : a <= 23 ? 2 : 1;
  const slot = p.dr && p.dr.y >= L.season ? p.dr.p : 120;
  const max = ELC_MAX(L, L.season);
  const min = minSalaryOf(L);
  const aav = slot <= 10 ? max : slot <= 32 ? Math.round((min + (max - min) * 0.6) / 5000) * 5000 : min + 25_000;
  return { aav, years, clause: null };
}

export function signELC(L: League, p: Player, team: string) {
  const t = elcTerms(L, p);
  const start = beforeNewLeagueYear(L) ? L.season + 1 : L.season;
  p.c = { aav: t.aav, last: start + t.years - 1, type: 'ELC', clause: null, exp: 'RFA', signed: L.season };
  p.team = team;
  if (!p.teams.includes(team)) p.teams.push(team);
  p.lg = 'NHL';
  delete p.rights;
  // Junior-age players can be signed and returned to their junior club (the contract slides).
  const wasJunior = p.st === 'JR';
  p.st = p.ovr >= 72 ? 'NHL' : wasJunior && ageOn(p.bd, L.date) < 20 ? 'JR' : 'AHL';
  delete p.rightsUntil;
  if (team === L.user) pushNews(L, { kind: 'sign', title: `${L.teams[team].short} подписывают контракт новичка с ${p.fn} ${p.ln}`, team, players: [p.id] });
}

// ---------- Buyouts, waivers, releases ----------

export function buyoutCost(L: League, p: Player) {
  if (!p.c) return null;
  const yrs = yearsLeft(L, p.c);
  const frac = ageOn(p.bd, L.date) >= 26 ? 2 / 3 : 1 / 3;
  const total = p.c.aav * yrs * frac;
  return { total, perYear: total / (2 * yrs), years: 2 * yrs, savingPerYear: p.c.aav - total / (2 * yrs) };
}

export function buyout(L: League, p: Player) {
  const b = buyoutCost(L, p);
  if (!b || !p.team) return false;
  const team = p.team;
  const dead = deadCap(L);
  const start = beforeNewLeagueYear(L) ? L.season + 1 : L.season;
  for (let i = 0; i < b.years; i++) dead.push({ team, season: start + i, amount: Math.round(b.perYear), name: `${p.fn} ${p.ln}` });
  const verb = lgFor(L, team) === 'KHL' ? 'расторгают контракт с' : 'выкупают контракт';
  pushNews(L, { kind: 'sign', title: `${L.teams[team].short} ${verb} ${p.fn} ${p.ln}`, team, players: [p.id], important: team === L.user });
  makeFreeAgent(L, p);
  return true;
}

export function makeFreeAgent(L: League, p: Player) {
  p.team = null;
  p.c = null;
  p.st = 'FA';
  p.wantsTrade = false;
  delete L.negotiations[p.id];
  for (const t of Object.values(L.teams)) {
    t.lines.f = t.lines.f.map((l) => l.filter((x) => x !== p.id));
    t.lines.d = t.lines.d.map((l) => l.filter((x) => x !== p.id));
    t.lines.g = t.lines.g.filter((x) => x !== p.id);
  }
}

/** Places a player on waivers. Returns the claiming team, or null if he cleared. */
export function waive(L: League, p: Player): string | null {
  // The KHL has no waiver draft: the club simply sends the player to its VHL farm.
  if (lgFor(L, p.team ?? '') === 'KHL') { p.st = 'AHL'; return null; }
  const order = leagueTeams(L, 'NHL')
    .filter((t) => t.id !== p.team)
    .sort((a, b) => (a.rec.gp ? a.rec.pts / a.rec.gp : 0) - (b.rec.gp ? b.rec.pts / b.rec.gp : 0));
  const aav = p.c?.aav ?? 0;
  for (const t of order) {
    if (t.id === L.user) continue;
    if (capSpace(L, t.id) < aav || contractCount(L, t.id) >= 50) continue;
    const roster = Object.values(L.players).filter((x) => x.team === t.id && x.st === 'NHL' && (x.pos === 'G') === (p.pos === 'G') && (x.pos === 'D') === (p.pos === 'D'));
    const worst = roster.sort((a, b) => a.ovr - b.ovr)[0];
    const age_ = ageOn(p.bd, L.date);
    const value = p.ovr + (age_ <= 25 ? (p.pot - p.ovr) * 0.4 : 0) - (aav > 2_500_000 ? (aav - 2_500_000) / 400_000 : 0);
    if (worst && value >= worst.ovr + 2 && next() < 0.6) {
      const from = p.team;
      p.team = t.id;
      p.st = 'NHL';
      p.teams.push(t.id);
      pushNews(L, { kind: 'sign', title: `${t.short} забирают ${p.fn} ${p.ln} с драфта отказов (${from})`, team: t.id, players: [p.id], important: from === L.user });
      return t.id;
    }
  }
  p.st = 'AHL';
  return null;
}

export function capSummary(L: League, team: string) {
  const cap = capFor(L, team);
  const hit = capHit(L, team);
  const nextHit = capHit(L, team, L.season + 1);
  return { cap, hit, space: cap - hit, nextCap: capFor(L, team, L.season + 1), nextHit, contracts: contractCount(L, team), floor: floorFor(L, team) };
}

/** Team-level estimate of how attractive the team is to free agents (0..1). */
export function contenderScore(L: League, team: string) {
  const all = leagueTeams(L, lgOf(L.teams[team])).map((t) => teamPower(L, t)).sort((a, b) => a - b);
  const p = teamPower(L, L.teams[team]);
  return all.indexOf(p) / (all.length - 1);
}

export { pushMsg };
