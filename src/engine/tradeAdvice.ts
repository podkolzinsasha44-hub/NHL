// Trade advisor: which players AI clubs are willing to move, where the user's lineup is
// weaker than the league, and which available players would help most. Read-only: it never
// mutates the league and never draws random numbers, so opening the screen can't change a game.
import { allCapHits, beforeNewLeagueYear, capFor, capSpace, valueFor } from './contracts';
import { buildLines, emptyLines, skaterDef, skaterOff, teamPower } from './lines';
import { leagueTeams, lgOf } from './leagues';
import { winProb } from './projection';
import { interestIn, playerValue } from './trades';
import type { League, LeagueId, Lines, Player, SkaterAttrs, Team } from './types';
import { ageOn, clamp } from './util';

/** Which side of the game the team leans to: set by the tactic, else by the coach's style. */
export type Lean = 'off' | 'def' | 'bal';
export type Group = 'C' | 'W' | 'D' | 'G';

export interface Availability {
  /** Actively shopped (the club wants to move him), not just open to offers. */
  hot: boolean;
  reason: string;
}

export interface TeamNeed {
  id: string;
  groups: Group[];
  title: string;
  detail: string;
  /** Importance in team-power units (the scale projections use). */
  score: number;
}

export interface TradeTarget {
  p: Player;
  team: string;
  avail: Availability;
  /** Team power gained with the player in the best lineup. */
  dPower: number;
  /** Standings points over the games left, by the projection model. */
  dPts: number;
  /** Where he'd play: "2-е звено", "1-я пара", "основной вратарь". */
  slot: string | null;
  /** Who drops out of the lineup (or loses the starter's net). */
  replaces: Player | null;
  /** -1..1: how well his strengths match the team's lean. */
  style: number;
  /** "Под стиль: атака 84" / "Не под стиль: …" when it matters. */
  styleNote: string | null;
  /** Ids of the needs he addresses. */
  needs: string[];
  /** Salary that has to go back for the deal to fit under the cap. */
  capShort: number;
  /** 0 low · 1 medium · 2 high · 3 very high (by how much his club values him). */
  price: 0 | 1 | 2 | 3;
  score: number;
}

export interface SpareAsset {
  p: Player;
  /** Clubs that value him most. */
  interest: string[];
}

export interface TradeAdvice {
  lean: Lean;
  style: string;
  needs: TeamNeed[];
  /** Every available player, best fit first. */
  targets: TradeTarget[];
  spare: SpareAsset[];
  gamesLeft: number;
}

// Lineup weights of teamPower(): forwards 50% by line, defence 27% by pair, starter 23%.
const FW = [0.36, 0.31, 0.21, 0.12];
const DW = [0.42, 0.34, 0.24];
const W_C = FW.map((w) => (0.5 * w) / 3);
const W_W = FW.map((w) => (0.5 * w * 2) / 3);
const W_D = DW.map((w) => 0.27 * w);
const W_G = 0.23;

export const groupOf = (p: Player): Group => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : p.pos === 'C' ? 'C' : 'W');
const sa = (p: Player) => p.r as SkaterAttrs;
/** Offensive minus defensive rating: positive = attacking profile. */
const lean = (p: Player) => skaterOff(sa(p)) - skaterDef(sa(p), p.pos === 'D');
const ppVal = (p: Player) => 0.3 * sa(p).oi + 0.28 * sa(p).sh + 0.27 * sa(p).pa + 0.15 * sa(p).ha;

export function teamLean(t: Team): Lean {
  if (t.tactic === 'attack') return 'off';
  if (t.tactic === 'defense') return 'def';
  return t.coach.style === 'offense' ? 'off' : t.coach.style === 'defense' ? 'def' : 'bal';
}

function styleText(t: Team, l: Lean) {
  const tactic = { attack: 'Атака', defense: 'Оборона', balanced: 'Баланс' }[t.tactic ?? 'balanced'];
  const coach = { offense: 'атакующий', defense: 'оборонительный', balanced: 'универсальный', development: 'развивающий' }[t.coach.style];
  const want = l === 'off' ? 'нужны игроки с сильной атакой: бросок, пас, хоккейный интеллект в атаке'
    : l === 'def' ? 'нужны надёжные в обороне: защитники с чтением игры и силовой борьбой, сильный вратарь'
      : 'подходят универсальные игроки, одинаково полезные в атаке и обороне';
  return `Тактика «${tactic}», тренер ${coach} — ${want}.`;
}

/** Healthy-enough NHL-level players: short injuries don't count as a hole. */
const inLineupPool = (p: Player) => p.st === 'NHL' && !(p.inj && p.inj.days > 14);

function lineupOf(team: Team, roster: Player[]): Lines {
  const t = { ...team, lines: emptyLines() } as Team;
  buildLines(t, roster);
  return t.lines;
}

const powerOf = (L: League, team: Team, lines: Lines) => teamPower(L, { ...team, lines } as Team);

interface Slots { C: number[]; W: number[]; D: number[]; G: number; off6: number; def4: number }

function slots(L: League, ln: Lines): Slots {
  const P = (id: number) => L.players[id];
  const C: number[] = [], W: number[] = [], D: number[] = [];
  const f6: Player[] = [], d4: Player[] = [];
  ln.f.forEach((line, i) => {
    const ps = line.map(P).filter(Boolean);
    const c = ps.length === 3 ? ps[1] : ps.find((p) => p.pos === 'C') ?? ps[0];
    C.push(c?.ovr ?? 60);
    const wings = ps.filter((p) => p !== c);
    W.push(wings.length ? wings.reduce((s, p) => s + p.ovr, 0) / wings.length : 60);
    if (i < 2) f6.push(...ps);
  });
  ln.d.forEach((pair, i) => {
    const ps = pair.map(P).filter(Boolean);
    D.push(ps.length ? ps.reduce((s, p) => s + p.ovr, 0) / ps.length : 60);
    if (i < 2) d4.push(...ps);
  });
  const avg = (ps: Player[], f: (p: Player) => number) => (ps.length ? ps.reduce((s, p) => s + f(p), 0) / ps.length : 60);
  return {
    C, W, D,
    G: ln.g[0] ? P(ln.g[0])?.ovr ?? 60 : 60,
    off6: avg(f6, (p) => skaterOff(sa(p))),
    def4: avg(d4, (p) => skaterDef(sa(p), true)),
  };
}

function noteFor(p: Player, style: number, l: Lean): string | null {
  if (p.pos === 'G') return l === 'def' ? 'Под стиль: вратарь' : null;
  const off = Math.round(skaterOff(sa(p))), def = Math.round(skaterDef(sa(p), p.pos === 'D'));
  if (style >= 0.35) return l === 'off' ? `Под стиль: атака ${off}` : l === 'def' ? `Под стиль: оборона ${def}` : 'Под стиль: универсал';
  if (style <= -0.5) return l === 'off' ? 'Скорее оборонительный игрок' : l === 'def' ? 'Скорее атакующий игрок' : null;
  return null;
}

const LINE = ['1-го', '2-го', '3-го', '4-го'];
/** buildLines() stores forward lines as [LW, C, RW]. */
const centreOf = (line: number[]) => (line.length === 3 ? line[1] : undefined);

function positionalNeeds(mine: Slots, ref: Slots): TeamNeed[] {
  const out: TeamNeed[] = [];
  const add = (id: string, groups: Group[], title: string, have: number, avg: number, w: number) => {
    const gap = avg - have;
    if (gap >= 2) out.push({ id, groups, title, detail: `У вас ${Math.round(have)}, в среднем по лиге ${Math.round(avg)}`, score: gap * w });
  };
  mine.C.forEach((v, i) => add(`C${i}`, ['C'], i < 2 ? `${i + 1}-й центр` : `Центр ${LINE[i]} звена`, v, ref.C[i], W_C[i]));
  mine.W.forEach((v, i) => add(`W${i}`, ['W', 'C'], `Крайние ${LINE[i]} звена`, v, ref.W[i], W_W[i]));
  mine.D.forEach((v, i) => add(`D${i}`, ['D'], `${i + 1}-я пара защиты`, v, ref.D[i], W_D[i]));
  add('G0', ['G'], 'Основной вратарь', mine.G, ref.G, W_G);
  return out;
}

function gamesLeft(L: League, lg: LeagueId, t: Team) {
  const total = lg === 'KHL' ? 68 : 84;
  const phase = lg === 'KHL' ? L.khl?.phase : L.phase;
  if (phase === 'playoffs') return 0;
  return phase === 'regular' ? Math.max(0, total - t.rec.gp) : total;
}

/** Why an AI club would move this player, or null if he's part of its core. */
function availability(L: League, p: Player, core: Set<number>, dressed: Set<number>, overCap: Set<string>): Availability | null {
  const t = L.teams[p.team!];
  const khl = lgOf(t) === 'KHL';
  const a = ageOn(p.bd, L.date);
  if (p.wantsTrade) return { hot: true, reason: 'Просит обмен' };
  // Rebuilding clubs part even with their leaders once they're 30+.
  if (core.has(p.id) && !(t.strategy === 'rebuild' && a >= 30)) return null;
  const c = p.c!;
  const big = c.aav >= (khl ? 15e6 / 85 : 1.5e6);
  if (big && overCap.has(t.id)) return { hot: true, reason: 'Клуб над потолком' };
  // The veterans AI sellers move to contenders (see aiToAiTrade).
  if (t.strategy === 'rebuild' && a >= 27) return { hot: true, reason: 'Перестройка: продают ветеранов' };
  if (t.strategy === 'bubble' && a >= 30) return { hot: false, reason: 'Середняк продаёт ветерана' };
  const start = beforeNewLeagueYear(L) ? L.season + 1 : L.season;
  if (c.last === start && t.strategy !== 'contend' && a >= 26 && p.ovr >= (khl ? 66 : 72)) return { hot: false, reason: 'Истекает контракт' };
  if (p.st === 'NHL' && !p.inj && !dressed.has(p.id) && a >= 22 && p.ovr >= (khl ? 62 : 66)) return { hot: false, reason: 'Не попадает в состав' };
  if (p.st === 'AHL' && a >= 23 && p.ovr >= (khl ? 62 : 66)) return { hot: false, reason: khl ? 'Играет в ВХЛ' : 'Играет в АХЛ' };
  if (big && c.aav > valueFor(L, p, t.id) * 1.4) return { hot: false, reason: 'Переплаченный контракт' };
  return null;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(q * (s.length - 1))];
};

export function tradeAdvice(L: League, teamId = L.user): TradeAdvice {
  const me = L.teams[teamId];
  if (!me) return { lean: 'bal', style: '', needs: [], targets: [], spare: [], gamesLeft: 0 };
  const lg = lgOf(me);
  const teams = leagueTeams(L, lg);
  const others = teams.filter((t) => t.id !== teamId);
  const ids = new Set(teams.map((t) => t.id));
  const myLean = teamLean(me);

  // One pass over the world: rosters of the league, league-wide profile medians.
  const roster = new Map<string, Player[]>();
  const leanF: number[] = [], leanD: number[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || !ids.has(p.team) || p.st === 'RET') continue;
    let arr = roster.get(p.team);
    if (!arr) roster.set(p.team, (arr = []));
    arr.push(p);
    if (p.st === 'NHL' && p.pos !== 'G') (p.pos === 'D' ? leanD : leanF).push(lean(p));
  }
  const medF = quantile(leanF, 0.5), medD = quantile(leanD, 0.5);
  /** -1..1 fit with the lean, relative to the median player of his position. */
  const styleFit = (p: Player) => {
    if (p.pos === 'G') return myLean === 'def' ? 0.5 : 0;
    const z = (lean(p) - (p.pos === 'D' ? medD : medF)) / 5;
    return myLean === 'off' ? clamp(z, -1, 1) : myLean === 'def' ? clamp(-z, -1, 1) : clamp(0.5 - Math.abs(z) * 0.5, -1, 1);
  };

  // League reference: the average club's lineup, slot by slot.
  const ref: Slots = { C: [0, 0, 0, 0], W: [0, 0, 0, 0], D: [0, 0, 0], G: 0, off6: 0, def4: 0 };
  for (const t of others) {
    const s = slots(L, t.lines);
    for (let i = 0; i < 4; i++) { ref.C[i] += (s.C[i] ?? 60) / others.length; ref.W[i] += (s.W[i] ?? 60) / others.length; }
    for (let i = 0; i < 3; i++) ref.D[i] += (s.D[i] ?? 60) / others.length;
    ref.G += s.G / others.length;
    ref.off6 += s.off6 / others.length;
    ref.def4 += s.def4 / others.length;
  }

  // The user's best lineup and where it falls short.
  const mine = roster.get(teamId) ?? [];
  const pool = mine.filter(inLineupPool);
  const base = lineupOf(me, pool);
  const P0 = powerOf(L, me, base);
  const mySlots = slots(L, base);
  const needs = positionalNeeds(mySlots, ref);
  const count = (g: Group) => pool.filter((p) => groupOf(p) === g).length;
  if (count('C') < 4) needs.push({ id: 'nC', groups: ['C'], title: 'Не хватает центров', detail: `Центров в составе: ${count('C')} из 4`, score: 0.6 });
  if (count('D') < 6) needs.push({ id: 'nD', groups: ['D'], title: 'Не хватает защитников', detail: `Защитников в составе: ${count('D')} из 6`, score: 0.6 });
  if (count('G') < 2) needs.push({ id: 'nG', groups: ['G'], title: 'Нужен второй вратарь', detail: `Вратарей в составе: ${count('G')} из 2`, score: 0.5 });
  if (myLean === 'off' && ref.off6 - mySlots.off6 >= 1.5) {
    needs.push({ id: 'sOff', groups: ['C', 'W'], title: 'Атака под ваш стиль', detail: `Атака топ-6 нападающих ${Math.round(mySlots.off6)}, в среднем по лиге ${Math.round(ref.off6)}`, score: (ref.off6 - mySlots.off6) * 0.12 });
  }
  if (myLean === 'def' && ref.def4 - mySlots.def4 >= 1.5) {
    needs.push({ id: 'sDef', groups: ['D'], title: 'Оборона под ваш стиль', detail: `Оборона топ-4 защитников ${Math.round(mySlots.def4)}, в среднем по лиге ${Math.round(ref.def4)}`, score: (ref.def4 - mySlots.def4) * 0.12 });
  }
  // Special teams, once the sample means something.
  if (me.rec.gp >= 15) {
    let ppg = 0, ppo = 0, pkga = 0, pko = 0;
    for (const t of teams) { ppg += t.rec.ppg; ppo += t.rec.ppo; pkga += t.rec.pkga; pko += t.rec.pko; }
    const pp = me.rec.ppo ? me.rec.ppg / me.rec.ppo : 0, ppL = ppo ? ppg / ppo : 0;
    const pk = me.rec.pko ? 1 - me.rec.pkga / me.rec.pko : 0, pkL = pko ? 1 - pkga / pko : 0;
    const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
    if (ppL - pp >= 0.03) needs.push({ id: 'pp', groups: ['C', 'W', 'D'], title: 'Большинство', detail: `Реализация ${pct(pp)}, в среднем по лиге ${pct(ppL)}`, score: (ppL - pp) * 8 });
    if (pkL - pk >= 0.03) needs.push({ id: 'pk', groups: ['C', 'W', 'D'], title: 'Меньшинство', detail: `Нейтрализация ${pct(pk)}, в среднем по лиге ${pct(pkL)}`, score: (pkL - pk) * 8 });
  }
  needs.sort((a, b) => b.score - a.score);

  // Projection: standings points from a power gain over the games left.
  const powers = teams.map((t) => teamPower(L, t));
  const avgP = powers.reduce((s, x) => s + x, 0) / Math.max(1, powers.length);
  const wp = (x: number) => 0.5 * (winProb(x, avgP) + 1 - winProb(avgP, x));
  const left = gamesLeft(L, lg, me);
  const ptsFor = (d: number) => left * 2 * (wp(P0 + d) - wp(P0));

  // AI clubs: their core by their own valuation, and who actually dresses.
  const value = new Map<number, number>();
  const core = new Set<number>();
  const dressed = new Set<number>();
  const hits = allCapHits(L);
  const overCap = new Set(others.filter((t) => hits[t.id] > capFor(L, t.id)).map((t) => t.id));
  for (const t of others) {
    const org = (roster.get(t.id) ?? []).filter((p) => p.c && (p.st === 'NHL' || p.st === 'AHL'));
    for (const p of org) value.set(p.id, playerValue(L, p, t.id));
    // Leaders by the club's own valuation and by rating (an expiring star is still a star).
    const k = t.strategy === 'contend' ? 6 : t.strategy === 'bubble' ? 5 : 4;
    [...org].sort((a, b) => value.get(b.id)! - value.get(a.id)!).slice(0, k).forEach((p) => core.add(p.id));
    [...org].sort((a, b) => b.ovr - a.ovr).slice(0, k).forEach((p) => core.add(p.id));
    const khl = lgOf(t) === 'KHL';
    for (const p of org) if (ageOn(p.bd, L.date) <= 22 && p.pot >= (khl ? 76 : 80)) core.add(p.id);
    for (const id of [...t.lines.f.flat(), ...t.lines.d.flat(), ...t.lines.g]) dressed.add(id);
  }
  const vals = [...value.values()];
  const q = [quantile(vals, 0.25), quantile(vals, 0.75), quantile(vals, 0.92)];

  const start = beforeNewLeagueYear(L) ? L.season + 1 : L.season;
  const space = capSpace(L, teamId, start);
  const mySkaters = new Set([...base.f.flat(), ...base.d.flat()]);
  const minOvr = (ids: number[]) => (ids.length ? Math.min(...ids.map((id) => L.players[id]?.ovr ?? 0)) : 0);
  const floorOvr = {
    F: base.f.flat().length >= 12 ? minOvr(base.f.flat()) : 0,
    D: base.d.flat().length >= 6 ? minOvr(base.d.flat()) : 0,
    G: base.g.length >= 2 ? minOvr(base.g) : 0,
  };
  const targets: TradeTarget[] = [];
  for (const t of others) {
    for (const p of roster.get(t.id) ?? []) {
      if (!p.c || p.c.last < start || (p.st !== 'NHL' && p.st !== 'AHL') || p.id === L.pro?.pid) continue;
      if (p.c.clause === 'NMC' && !p.wantsTrade) continue;
      const avail = availability(L, p, core, dressed, overCap);
      if (!avail) continue;
      // Can't crack the lineup: no need to rebuild it.
      const ln = p.ovr > floorOvr[p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F'] ? lineupOf(me, [...pool, p]) : base;
      const dPower = Math.max(0, powerOf(L, me, ln) - P0);
      let slot: string | null = null;
      let replaces: Player | null = null;
      const fi = ln.f.findIndex((l) => l.includes(p.id));
      const di = ln.d.findIndex((l) => l.includes(p.id));
      if (fi >= 0) slot = `${fi + 1}-е звено`;
      else if (di >= 0) slot = `${di + 1}-я пара`;
      else if (ln.g[0] === p.id) slot = 'основной вратарь';
      else if (ln.g[1] === p.id) slot = 'сменщик';
      if (p.pos === 'G') {
        const was = ln.g[0] === p.id ? base.g[0] : ln.g[1] === p.id ? base.g[1] : undefined;
        replaces = was != null ? L.players[was] ?? null : null;
      } else if (slot) {
        const now = new Set([...ln.f.flat(), ...ln.d.flat()]);
        const out = [...mySkaters].filter((id) => !now.has(id)).map((id) => L.players[id]);
        replaces = out.sort((a, b) => a.ovr - b.ovr)[0] ?? null;
      }
      const style = styleFit(p);
      const styleNote = noteFor(p, style, myLean);
      const g = groupOf(p);
      const addressed = needs.filter((n) => {
        if (!n.groups.includes(g) || !slot) return false;
        const m = /^([CWDG])(\d)$/.exec(n.id);
        if (m) {
          const i = Number(m[2]);
          if (m[1] === 'G') return ln.g[0] === p.id;
          if (m[1] === 'D') return di >= 0 && di <= i;
          const centre = fi >= 0 && centreOf(ln.f[fi]) === p.id;
          return fi >= 0 && fi <= i && (m[1] === 'C' ? centre : !centre);
        }
        if (n.id === 'sOff') return fi >= 0 && fi <= 1 && style > 0.2;
        if (n.id === 'sDef') return di >= 0 && di <= 1 && style > 0.2;
        if (n.id === 'pp') return ln.pp[0].includes(p.id) && ppVal(p) >= 75;
        if (n.id === 'pk') return (ln.pk[0].includes(p.id) || ln.pk[1].includes(p.id)) && skaterDef(sa(p), p.pos === 'D') >= 75;
        return true; // missing bodies
      }).map((n) => n.id);
      const capShort = Math.max(0, p.c.aav - space);
      const v = value.get(p.id) ?? 0;
      const price = (v <= q[0] ? 0 : v <= q[1] ? 1 : v <= q[2] ? 2 : 3) as TradeTarget['price'];
      // Real gain first; the team's style and its weak spots tip the order.
      let score = dPower * (1 + 0.4 * style + (addressed.length ? 0.2 : 0)) * (capShort > 0 ? 0.85 : 1);
      if (!slot) score = -1 + p.ovr / 1000; // depth only: listed after real upgrades
      targets.push({ p, team: t.id, avail, dPower, dPts: ptsFor(dPower), slot, replaces, style, styleNote, needs: addressed, capShort, price, score });
    }
  }
  targets.sort((a, b) => b.score - a.score || b.p.ovr - a.p.ovr);

  // What the user can spare: players whose departure barely touches the best lineup.
  const spareCands = mine
    .filter((p) => p.c && p.c.last >= start && p.c.clause !== 'NMC' && (p.st === 'NHL' || p.st === 'AHL') && p.id !== L.pro?.pid)
    .map((p) => {
      const loss = pool.includes(p) ? P0 - powerOf(L, me, lineupOf(me, pool.filter((x) => x !== p))) : 0;
      return { p, loss };
    })
    .filter((x) => x.loss <= 0.12 && x.p.ovr >= (lg === 'KHL' ? 60 : 64))
    .sort((a, b) => Number(!!b.p.wantsTrade) - Number(!!a.p.wantsTrade) || b.p.ovr - a.p.ovr)
    .slice(0, 8);
  const spare = spareCands
    .map(({ p }) => ({ p, top: interestIn(L, p).filter((x) => x.v > 1) }))
    .filter((x) => x.top.length)
    .sort((a, b) => b.top[0].v - a.top[0].v)
    .slice(0, 5)
    .map(({ p, top }) => ({ p, interest: top.slice(0, 3).map((x) => x.t.id) }));

  return { lean: myLean, style: styleText(me, myLean), needs: needs.slice(0, 4), targets, spare, gamesLeft: left };
}

/** Short list for the advisor card: real upgrades, best fit first. */
export const recommended = (a: TradeAdvice, n = 6) => a.targets.filter((t) => t.slot && t.dPower >= 0.05).slice(0, n);

/** Russian labels for the UI. */
export const PRICE_RU = ['низкая', 'средняя', 'высокая', 'очень высокая'] as const;
