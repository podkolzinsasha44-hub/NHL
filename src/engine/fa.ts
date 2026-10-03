// Free agency: from July 1 all NHL and KHL clubs bid for unrestricted free agents.
// KHL clubs pay on their own (rouble) scale; players compare take-home money (KHL income tax is
// 13–15% against ~40–50% in North America), the league, their role and the team's chances.
import { capSpace, contenderScore, contractCount, marketValue, marketValueIn, maxTerm, minSalaryFor, preferredYearsFor, roundSalary, salaryText, signContract, startNegotiation, valueFor, type OfferTerms } from './contracts';
import { hash01, next } from './rng';
import { pushMsg, pushNews, social } from './news';
import type { FAOffer, League, LeagueId, Player } from './types';
import { ageOn, capOf, clamp, minSalaryOf } from './util';
import { isGM, KHL_FOREIGN_LIMIT, teamLg } from './leagues';
import { foreignCount, foreignCounts, isForeignFor } from './khlData';

/** After-tax advantage of a KHL salary compared with the same gross salary in the NHL. */
export const KHL_TAX_EDGE = 1.4;
const RU_HOME = new Set(['RUS', 'BLR', 'KAZ']);

const lgOfTeam = (L: League, team: string): LeagueId => teamLg(L, team) ?? 'NHL';

/**
 * Can `team` sign the player? NHL draft rights and the KHL foreign-player limit.
 * `foreign` = precomputed foreign counts per club (see foreignCounts) for bulk checks.
 */
export function signingBlock(L: League, p: Player, team: string, foreign?: Record<string, number>): string | null {
  const lg = lgOfTeam(L, team);
  if (lg === 'NHL' && p.rights && p.rights !== team) return `Права на игрока в НХЛ принадлежат ${L.teams[p.rights]?.short ?? p.rights}.`;
  if (lg === 'KHL' && isForeignFor(p, team)) {
    const n = foreign ? (foreign[team] ?? 0) - (p.team === team && p.c ? 1 : 0) : foreignCount(L, team, p.id);
    if (n >= KHL_FOREIGN_LIMIT) return `Лимит легионеров: у клуба уже ${KHL_FOREIGN_LIMIT} иностранцев.`;
  }
  return null;
}

/** Keeps precomputed foreign counts in sync after a signing. */
export function countSigning(foreign: Record<string, number>, p: Player, team: string) {
  if (isForeignFor(p, team)) foreign[team] = (foreign[team] ?? 0) + 1;
}

/** What the player expects to earn: NHL value, or KHL value (after-tax) if that is higher for him. */
function moneyRef(L: League, p: Player, nhlOffers: boolean) {
  const n = marketValue(L, p);
  const k = marketValueIn(L, p, 'KHL') * KHL_TAX_EDGE;
  return nhlOffers ? Math.max(n, k) : k;
}

export function freeAgents(L: League): Player[] {
  const out: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team && p.st === 'FA') out.push(p);
  }
  return out.sort((a, b) => b.ovr - a.ovr);
}

export function openFreeAgency(L: League) {
  L.fa = { open: true, day: 0, offers: {}, decided: [] };
  // Some European contracts expire: those players become available
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'EUR' && !p.team && !p.real && hash01(p.id, L.season) < 0.35 && ageOn(p.bd, L.date) >= 21) p.st = 'FA';
    if (p.st === 'EUR' && !p.team && p.real) p.st = 'FA';
    if (p.st === 'NCAA' && !p.team && ageOn(p.bd, L.date) >= 22) p.st = 'FA';
  }
  const fas = freeAgents(L);
  const top = fas.slice(0, 5).map((p) => `${p.fn} ${p.ln} (${p.ovr})`);
  pushNews(L, { kind: 'fa', title: 'Открылся рынок свободных агентов', body: `Главные имена: ${top.join(', ')}.`, important: true });
  social(L, `1 июля — главный день лета. ${fas[0] ? `${fas[0].fn} ${fas[0].ln}` : 'Кто'} уйдёт первым?`, { kind: 'insider' });
}

interface TeamCtx {
  space: number;
  contracts: number;
  contender: number;
  /** NHL ovr lists by group, sorted desc */
  ovr: { F: number[]; D: number[]; G: number[] };
}
export type FACtx = Record<string, TeamCtx>;

const grpOf = (p: Player) => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');

export function buildCtx(L: League): FACtx {
  const ctx: FACtx = {};
  const contenders: Record<string, number> = {};
  for (const t of Object.keys(L.teams)) contenders[t] = contenderScore(L, t);
  for (const t of Object.keys(L.teams)) ctx[t] = { space: capSpace(L, t), contracts: contractCount(L, t), contender: contenders[t], ovr: { F: [], D: [], G: [] } };
  for (const id in L.players) {
    const x = L.players[id];
    if (!x.team || x.st !== 'NHL' || !ctx[x.team]) continue;
    ctx[x.team].ovr[grpOf(x)].push(x.ovr);
  }
  for (const t of Object.values(ctx)) for (const g of ['F', 'D', 'G'] as const) t.ovr[g].sort((a, b) => b - a);
  return ctx;
}

/** Desirability of a team's offer for the player. `ref` = money he expects (see moneyRef). */
export function faUtility(L: League, p: Player, o: FAOffer, ctx?: FACtx, ref?: number) {
  const lg = lgOfTeam(L, o.team);
  const mv = ref ?? moneyRef(L, p, true);
  const pref = preferredYearsFor(L, p, o.team);
  const gross = lg === 'KHL' ? o.aav * KHL_TAX_EDGE : o.aav;
  const money = (gross / mv) * (1 - Math.min(0.15, Math.abs(o.years - pref) * 0.035));
  // The NHL is the dream for almost everyone; players from Russia, Belarus and Kazakhstan also like playing at home.
  const league = lg === 'NHL' ? 0.15 : RU_HOME.has(p.ctry) ? 0.1 : 0;
  const t = L.teams[o.team];
  const win = (p.pers.win / 20) * (ctx ? ctx[o.team].contender : contenderScore(L, o.team)) * 0.18;
  const tax = t.taxFree ? 0.035 : t.canada ? -0.02 : 0;
  const loyal = p.teams[p.teams.length - 1] === o.team ? (p.pers.loy / 20) * 0.08 : 0;
  const city = (hash01(p.id, o.team.charCodeAt(0) + o.team.charCodeAt(2)) - 0.5) * 0.08;
  const clause = o.clause === 'NMC' ? 0.04 : o.clause === 'NTC' ? 0.02 : 0;
  const rep = o.team === L.user ? (L.gm.rep - 50) / 1000 : 0;
  const role = roleScore(L, p, o.team, ctx) * 0.06;
  return money + win + tax + loyal + city + clause + rep + role + league;
}

function roleScore(L: League, p: Player, team: string, ctx?: FACtx) {
  // Will he play? Compare with the team's players at his position.
  let better = 0;
  if (ctx) better = ctx[team].ovr[grpOf(p)].filter((o) => o > p.ovr).length;
  else for (const id in L.players) {
    const x = L.players[id];
    if (x.team !== team || x.st !== 'NHL') continue;
    if (grpOf(x) === grpOf(p) && x.ovr > p.ovr) better++;
  }
  const slots = p.pos === 'G' ? 1 : p.pos === 'D' ? 4 : 6;
  return better < slots ? 1 : better < slots * 1.6 ? 0.4 : -0.5;
}

function teamNeed(ctx: FACtx, team: string, p: Player) {
  const list = ctx[team].ovr[grpOf(p)];
  const same = list.length;
  const worst = list.length ? list[list.length - 1] : 0;
  const target = p.pos === 'G' ? 2 : p.pos === 'D' ? 7 : 13;
  return { short: same < target, upgrade: p.ovr - worst };
}

/** AI teams make offers; players decide. Called daily while free agency is busy. */
export function faDay(L: League) {
  if (!L.fa?.open) return;
  L.fa.day++;
  const fas = freeAgents(L).slice(0, 260);
  const teams = Object.values(L.teams).filter((t) => t.id !== L.user);
  const minNhl = minSalaryOf(L);
  const foreign = foreignCounts(L);
  const ctx = buildCtx(L);
  const space: Record<string, number> = {};
  for (const t of teams) space[t.id] = ctx[t.id].space;
  for (const p of fas) {
    const offers = (L.fa.offers[p.id] ??= []);
    const mvN = marketValue(L, p);
    const mvK = marketValueIn(L, p, 'KHL');
    const age = ageOn(p.bd, L.date);
    // Clear NHL players only consider the KHL once the first wave of the NHL market is over.
    const khlOpen = mvN <= minNhl * 1.6 || RU_HOME.has(p.ctry) || L.fa.day >= 6;
    // AI bids
    for (const t of teams) {
      if (offers.some((o) => o.team === t.id)) continue;
      const lg = lgOfTeam(L, t.id);
      if (lg === 'KHL' && !khlOpen) continue;
      if (signingBlock(L, p, t.id, foreign)) continue;
      const mv = lg === 'KHL' ? mvK : mvN;
      const need = teamNeed(ctx, t.id, p);
      if (!need.short && need.upgrade < 3) continue;
      if (space[t.id] < mv * 0.9 || ctx[t.id].contracts >= 49) continue;
      const interest = (need.upgrade + (need.short ? 4 : 0)) / 10 + (t.strategy === 'contend' ? 0.2 : t.strategy === 'rebuild' && age >= 30 ? -0.4 : 0);
      if (next() > clamp(interest, 0, 0.7) * 0.35) continue;
      const aav = roundSalary(mv * (0.9 + next() * 0.22), lg);
      const years = clamp(preferredYearsFor(L, p, t.id) + (next() < 0.3 ? -1 : 0), 1, maxTerm(false));
      offers.push({ team: t.id, aav, years, clause: lg === 'NHL' && aav >= 6_000_000 && age >= 27 && next() < 0.4 ? 'NTC' : null, day: L.date });
      space[t.id] -= aav;
    }
    // Decision
    if (!offers.length) continue;
    // The user's own player (player career) chooses himself.
    if (!isGM(L) && L.pro?.pid === p.id) continue;
    const ref = moneyRef(L, p, offers.some((o) => lgOfTeam(L, o.team) === 'NHL'));
    const utils = offers.map((o) => faUtility(L, p, o, ctx, ref));
    let bi = 0;
    utils.forEach((u, i) => { if (u > utils[bi]) bi = i; });
    const best = offers[bi];
    const u = utils[bi];
    const urgency = (L.fa.day >= 3 ? 0.25 : 0.1) + (p.ovr >= 82 ? 0.25 : 0) + (u > 1.05 ? 0.25 : 0) + L.fa.day * 0.04;
    const bestSpace = best.team === L.user ? capSpace(L, L.user) : ctx[best.team].space;
    if (next() < urgency && bestSpace >= best.aav && !signingBlock(L, p, best.team, foreign)) {
      signFA(L, p, best);
      countSigning(foreign, p, best.team);
      if (ctx[best.team]) {
        ctx[best.team].space -= best.aav;
        ctx[best.team].contracts++;
        const list = ctx[best.team].ovr[grpOf(p)];
        list.push(p.ovr);
        list.sort((a, b) => b - a);
      }
    }
  }
  if (L.fa.day === 1) L.stops.push('fa-day1');
}

export function signFA(L: League, p: Player, o: FAOffer) {
  const from = p.teams[p.teams.length - 1];
  signContract(L, p, o.team, { aav: o.aav, years: o.years, clause: o.clause }, 'new', true);
  if (L.fa) {
    delete L.fa.offers[p.id];
    L.fa.decided.push(p.id);
  }
  const t = L.teams[o.team];
  const lg = lgOfTeam(L, o.team);
  if (o.aav >= (lg === 'KHL' ? 500_000 : 2_000_000) || o.team === L.user || from === L.user) {
    pushNews(L, { kind: 'fa', title: `${p.fn} ${p.ln} → ${t.name}: ${o.years} × ${salaryText(o.aav, lg)}`, team: o.team, players: [p.id], important: o.team === L.user || from === L.user });
  }
  if (from === L.user && o.team !== L.user) pushMsg(L, { from: 'Ассистент GM', kind: 'staff', title: `${p.ln} подписал контракт с ${t.short}`, body: `Мы потеряли ${p.fn} ${p.ln}: ${o.years} × ${salaryText(o.aav, lg)} в ${t.name}.` });
}

/** The user's offer to a free agent: immediate answer. */
export function userFAOffer(L: League, p: Player, o: OfferTerms): { status: 'signed' | 'considering' | 'rejected'; message: string } {
  const n = startNegotiation(L, p, L.user, 'fa');
  if (capSpace(L, L.user) < o.aav) return { status: 'rejected', message: 'Не хватает места под потолком.' };
  if (contractCount(L, L.user) >= 50) return { status: 'rejected', message: 'У вас уже 50 контрактов — это лимит.' };
  if (o.years > maxTerm(false)) return { status: 'rejected', message: `Новый клуб может дать максимум ${maxTerm(false)} лет.` };
  if (o.aav < minSalaryFor(L, L.user)) return { status: 'rejected', message: 'Ниже минимальной зарплаты лиги.' };
  const block = signingBlock(L, p, L.user);
  if (block) return { status: 'rejected', message: block };
  const offer: FAOffer = { team: L.user, aav: o.aav, years: o.years, clause: o.clause, day: L.date };
  const others = (L.fa?.offers[p.id] ?? []).filter((x) => x.team !== L.user);
  const ctx = buildCtx(L);
  const ref = moneyRef(L, p, [...others, offer].some((x) => lgOfTeam(L, x.team) === 'NHL'));
  const bestOther = others.length ? Math.max(...others.map((x) => faUtility(L, p, x, ctx, ref))) : 0;
  const mine = faUtility(L, p, offer, ctx, ref);
  const mv = valueFor(L, p, L.user);
  const askRatio = n.floor / mv;
  if (o.aav < n.floor * (others.length ? 1 : 0.96)) {
    n.patience -= 12;
    return { status: 'rejected', message: `Это ниже рынка. Мы ориентируемся на $${(n.ask.aav / 1e6).toFixed(2)}M × ${n.ask.years}.` };
  }
  if (mine >= bestOther * 1.0 && mine >= askRatio * 0.97) {
    signFA(L, p, offer);
    return { status: 'signed', message: `${p.ln} принимает ваше предложение!` };
  }
  if (L.fa) {
    const list = (L.fa.offers[p.id] ??= []);
    const i = list.findIndex((x) => x.team === L.user);
    if (i >= 0) list[i] = offer;
    else list.push(offer);
  }
  return { status: 'considering', message: 'Есть предложения интереснее. Мы подумаем — решение в ближайшие дни.' };
}

/** After the July rush: unsigned players lower expectations; AI fills holes; leftovers go to Europe in October. */
export function faWeekly(L: League) {
  const fas = freeAgents(L).slice(0, 400);
  const counts: Record<string, { F: number; D: number; G: number }> = {};
  for (const t of Object.keys(L.teams)) counts[t] = { F: 0, D: 0, G: 0 };
  for (const id in L.players) {
    const x = L.players[id];
    if (x.team && counts[x.team] && x.c && (x.st === 'NHL' || x.st === 'AHL')) counts[x.team][grpOf(x)]++;
  }
  const foreign = foreignCounts(L);
  for (const t of Object.values(L.teams)) {
    if (t.id === L.user) continue;
    const khl = t.lg === 'KHL';
    for (const g of ['F', 'D', 'G'] as const) {
      const isG = (x: Player) => grpOf(x) === g;
      const count = counts[t.id][g];
      // KHL clubs keep bigger squads (main roster + VHL farm).
      const need = g === 'G' ? 3 : g === 'D' ? (khl ? 10 : 8) : khl ? 17 : 14;
      if (count >= need || contractCount(L, t.id) >= 48) continue;
      const space = capSpace(L, t.id);
      const cand = fas.find((x) => isG(x) && !x.team && x.st === 'FA' && valueFor(L, x, t.id) <= space && !signingBlock(L, x, t.id, foreign) && (!L.pro || L.pro.pid !== x.id || isGM(L)));
      if (cand) {
        const aav = Math.max(minSalaryFor(L, t.id), roundSalary(valueFor(L, cand, t.id) * 0.85, khl ? 'KHL' : 'NHL'));
        signFA(L, cand, { team: t.id, aav, years: 1, clause: null, day: L.date });
        countSigning(foreign, cand, t.id);
        counts[t.id][g]++;
      }
    }
  }
}

export function sendUnsignedAbroad(L: League) {
  let n = 0;
  for (const p of freeAgents(L)) {
    if (ageOn(p.bd, L.date) >= 34 && p.ovr < 76) { p.st = 'RET'; p.retired = L.season; continue; }
    if (p.ovr < 68 && next() < 0.6) { p.st = 'EUR'; p.lg = RU_HOME.has(p.ctry) ? 'VHL' : next() < 0.5 ? 'SHL' : 'DEL'; n++; }
  }
  return n;
}

export function capRoom(L: League) {
  return capOf(L);
}
