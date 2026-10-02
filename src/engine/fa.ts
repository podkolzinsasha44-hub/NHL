// Free agency: from July 1 all 32 teams bid for unrestricted free agents.
import { capSpace, contenderScore, contractCount, marketValue, maxTerm, preferredYears, signContract, startNegotiation, type OfferTerms } from './contracts';
import { hash01, next } from './rng';
import { pushMsg, pushNews, social } from './news';
import type { FAOffer, League, Player } from './types';
import { ageOn, capOf, clamp, minSalaryOf } from './util';

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

/** Desirability of a team's offer for the player. */
export function faUtility(L: League, p: Player, o: FAOffer, ctx?: FACtx) {
  const mv = marketValue(L, p);
  const pref = preferredYears(L, p);
  const money = (o.aav / mv) * (1 - Math.min(0.15, Math.abs(o.years - pref) * 0.035));
  const t = L.teams[o.team];
  const win = (p.pers.win / 20) * (ctx ? ctx[o.team].contender : contenderScore(L, o.team)) * 0.18;
  const tax = t.taxFree ? 0.035 : t.canada ? -0.02 : 0;
  const loyal = p.teams[p.teams.length - 1] === o.team ? (p.pers.loy / 20) * 0.08 : 0;
  const city = (hash01(p.id, o.team.charCodeAt(0) + o.team.charCodeAt(2)) - 0.5) * 0.08;
  const clause = o.clause === 'NMC' ? 0.04 : o.clause === 'NTC' ? 0.02 : 0;
  const rep = o.team === L.user ? (L.gm.rep - 50) / 1000 : 0;
  const role = roleScore(L, p, o.team, ctx) * 0.06;
  return money + win + tax + loyal + city + clause + rep + role;
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
  const fas = freeAgents(L).slice(0, 220);
  const teams = Object.values(L.teams).filter((t) => t.id !== L.user);
  const ctx = buildCtx(L);
  const space: Record<string, number> = {};
  for (const t of teams) space[t.id] = ctx[t.id].space;
  for (const p of fas) {
    const offers = (L.fa.offers[p.id] ??= []);
    const mv = marketValue(L, p);
    const age = ageOn(p.bd, L.date);
    // AI bids
    for (const t of teams) {
      if (offers.some((o) => o.team === t.id)) continue;
      const need = teamNeed(ctx, t.id, p);
      if (!need.short && need.upgrade < 3) continue;
      if (space[t.id] < mv * 0.9 || ctx[t.id].contracts >= 49) continue;
      const interest = (need.upgrade + (need.short ? 4 : 0)) / 10 + (t.strategy === 'contend' ? 0.2 : t.strategy === 'rebuild' && age >= 30 ? -0.4 : 0);
      if (next() > clamp(interest, 0, 0.7) * 0.35) continue;
      const aav = Math.round((mv * (0.9 + next() * 0.22)) / 25_000) * 25_000;
      const years = clamp(preferredYears(L, p) + (next() < 0.3 ? -1 : 0), 1, maxTerm(false));
      offers.push({ team: t.id, aav, years, clause: aav >= 6_000_000 && age >= 27 && next() < 0.4 ? 'NTC' : null, day: L.date });
      space[t.id] -= aav;
    }
    // Decision
    if (!offers.length) continue;
    const utils = offers.map((o) => faUtility(L, p, o, ctx));
    let bi = 0;
    utils.forEach((u, i) => { if (u > utils[bi]) bi = i; });
    const best = offers[bi];
    const u = utils[bi];
    const urgency = (L.fa.day >= 3 ? 0.25 : 0.1) + (p.ovr >= 82 ? 0.25 : 0) + (u > 1.05 ? 0.25 : 0) + L.fa.day * 0.04;
    const bestSpace = best.team === L.user ? capSpace(L, L.user) : ctx[best.team].space;
    if (next() < urgency && bestSpace >= best.aav) {
      signFA(L, p, best);
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
  if (o.aav >= 2_000_000 || o.team === L.user || from === L.user) {
    pushNews(L, { kind: 'fa', title: `${p.fn} ${p.ln} → ${t.name}: ${o.years} × $${(o.aav / 1e6).toFixed(2)}M`, team: o.team, players: [p.id], important: o.team === L.user || from === L.user });
  }
  if (from === L.user && o.team !== L.user) pushMsg(L, { from: 'Ассистент GM', kind: 'staff', title: `${p.ln} подписал контракт с ${t.short}`, body: `Мы потеряли ${p.fn} ${p.ln}: ${o.years} × $${(o.aav / 1e6).toFixed(2)}M в ${t.name}.` });
}

/** The user's offer to a free agent: immediate answer. */
export function userFAOffer(L: League, p: Player, o: OfferTerms): { status: 'signed' | 'considering' | 'rejected'; message: string } {
  const n = startNegotiation(L, p, L.user, 'fa');
  if (capSpace(L, L.user) < o.aav) return { status: 'rejected', message: 'Не хватает места под потолком.' };
  if (contractCount(L, L.user) >= 50) return { status: 'rejected', message: 'У вас уже 50 контрактов — это лимит.' };
  if (o.years > maxTerm(false)) return { status: 'rejected', message: `Новый клуб может дать максимум ${maxTerm(false)} лет.` };
  if (o.aav < minSalaryOf(L)) return { status: 'rejected', message: 'Ниже минимальной зарплаты лиги.' };
  const offer: FAOffer = { team: L.user, aav: o.aav, years: o.years, clause: o.clause, day: L.date };
  const others = (L.fa?.offers[p.id] ?? []).filter((x) => x.team !== L.user);
  const ctx = buildCtx(L);
  const bestOther = others.length ? Math.max(...others.map((x) => faUtility(L, p, x, ctx))) : 0;
  const mine = faUtility(L, p, offer, ctx);
  const mv = marketValue(L, p);
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
  for (const t of Object.values(L.teams)) {
    if (t.id === L.user) continue;
    for (const g of ['F', 'D', 'G'] as const) {
      const isG = (x: Player) => grpOf(x) === g;
      const count = counts[t.id][g];
      const need = g === 'G' ? 3 : g === 'D' ? 8 : 14;
      if (count >= need || contractCount(L, t.id) >= 48) continue;
      const space = capSpace(L, t.id);
      const cand = fas.find((x) => isG(x) && !x.team && x.st === 'FA' && marketValue(L, x) <= space);
      if (cand) {
        const aav = Math.max(minSalaryOf(L), Math.round((marketValue(L, cand) * 0.85) / 25_000) * 25_000);
        signFA(L, cand, { team: t.id, aav, years: 1, clause: null, day: L.date });
      }
    }
  }
}

export function sendUnsignedAbroad(L: League) {
  let n = 0;
  for (const p of freeAgents(L)) {
    if (ageOn(p.bd, L.date) >= 34 && p.ovr < 76) { p.st = 'RET'; p.retired = L.season; continue; }
    if (p.ovr < 68 && next() < 0.6) { p.st = 'EUR'; p.lg = next() < 0.5 ? 'KHL' : 'SHL'; n++; }
  }
  return n;
}

export function capRoom(L: League) {
  return capOf(L);
}
