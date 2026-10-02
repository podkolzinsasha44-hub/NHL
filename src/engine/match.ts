// Match engine: a game is simulated in 20-second segments (≈ one shift).
// Shot rates and finishing depend on the players on the ice; constants are calibrated
// against real 2025-26 NHL league totals (see scripts/calibrate.ts and docs/PLAN.md §6).
// The engine has no notion of "the user's team" — both sides are treated identically.

import { chance, next, normal, poisson } from './rng';
import { skaterDef, skaterOff } from './lines';
import type { GameEvent, GameResult, GoalieAttrs, League, Player, SkaterAttrs, Team } from './types';
import { clamp } from './util';

export const K = {
  BASE_SHOT: 0.152,
  KS: 0.14,
  BASE_P: 0.0875,
  KF: 0.1,
  KG: 0.22,
  KQ: 0.06,
  HOME: 1.05,
  PEN: 0.0186,
  PP_SHOT: 0.31,
  PP_P: 0.148,
  SH_SHOT: 0.045,
  SH_P: 0.115,
  OT_SHOT: 0.25,
  OT_P: 0.112,
  EN_RATE: 0.12,
  EN_P: 0.7,
  INJ: 0.0045,
  SO_P: 0.31,
};

interface Sk {
  p: Player;
  id: number;
  off: number;
  def: number;
  fin: number;
  pas: number;
  disc: number;
  phys: number;
  isD: boolean;
  sw: number; // shooter weight
  aw: number; // assist weight
  // box
  g: number; a: number; sog: number; pm: number; pim: number; toi: number; ppg: number; ppp: number; hits: number; blk: number; gs: number;
}
interface Unit { sk: Sk[]; off: number; def: number }
interface Side {
  team: Team;
  home: boolean;
  es: Unit[][]; // [fLine][dPair]
  pp: Unit[];
  pk: Unit[];
  ot: Unit[];
  dressed: Sk[];
  goalie: Player;
  backup: Player | null;
  gq: number;
  discMul: number;
  score: number;
  shots: number;
  ppOpp: number;
  ppGoals: number;
  saves: number;
  pulled: boolean;
  physMul: number;
}

const F_W = [0.37, 0.31, 0.2, 0.12];
const D_W = [0.42, 0.34, 0.24];

function pickIdx(w: number[]) {
  let r = next();
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

function mkSk(p: Player, playoff: boolean, fatigue: number): Sk {
  const a = p.r as SkaterAttrs;
  const isD = p.pos === 'D';
  const mood = 1 + p.form * 0.025 + (p.morale - 65) / 2500;
  const t = p.tr;
  let off = skaterOff(a) * mood - fatigue;
  let def = skaterDef(a, isD) * mood - fatigue;
  let fin = (0.6 * a.sh + 0.25 * a.oi + 0.15 * a.ha) * mood;
  let pas = (0.65 * a.pa + 0.25 * a.oi + 0.1 * a.ha) * mood;
  if (t.includes('sniper')) fin += 2;
  if (t.includes('cannon')) fin += 1.5;
  if (t.includes('playmaker')) pas += 3;
  if (t.includes('speed')) off += 1;
  if (t.includes('twoway')) def += 1.5;
  if (t.includes('blocker')) def += 1.5;
  if (t.includes('faceoff')) off += 0.6;
  if (playoff && t.includes('clutch')) { off += 1; fin += 1; }
  return {
    p, id: p.id, off, def, fin, pas, disc: a.dc, phys: a.ph, isD,
    sw: Math.exp((fin - 70) / 30) * (isD ? 0.5 : 1),
    aw: Math.exp((pas - 70) / 17) * (isD ? 0.9 : 1),
    g: 0, a: 0, sog: 0, pm: 0, pim: 0, toi: 0, ppg: 0, ppp: 0, hits: 0, blk: 0, gs: 0,
  };
}

function unit(sks: Sk[], pp = false): Unit {
  const f = sks.filter((s) => !s.isD);
  const d = sks.filter((s) => s.isD);
  const av = (arr: Sk[], k: 'off' | 'def') => (arr.length ? arr.reduce((x, s) => x + s[k], 0) / arr.length : 60);
  const off = f.length && d.length ? 0.72 * av(f, 'off') + 0.28 * av(d, 'off') : av(sks, 'off');
  const def = f.length && d.length ? 0.4 * av(f, 'def') + 0.6 * av(d, 'def') : av(sks, 'def');
  const qb = pp && d.some((s) => s.p.tr.includes('quarterback')) ? 2.5 : 0;
  return { sk: sks, off: off + qb, def };
}

export function goalieQuality(g: Player) {
  const a = g.r as GoalieAttrs;
  return 0.35 * a.po + 0.35 * a.rf + 0.15 * a.rb + 0.15 * a.cs;
}

function buildSide(L: League, team: Team, home: boolean, opts: { playoff: boolean; b2b: boolean; goalie?: number }): Side {
  const ln = team.lines;
  const P = (id: number) => L.players[id];
  const fatigue = opts.b2b ? 1.3 : 0;
  const cache = new Map<number, Sk>();
  const S = (id: number) => {
    let s = cache.get(id);
    if (!s) {
      s = mkSk(P(id), opts.playoff, fatigue);
      cache.set(id, s);
    }
    return s;
  };
  const coachAdj = (team.coach.rating - 72) * 0.07;
  const tOff = team.tactic === 'attack' ? 1.1 : team.tactic === 'defense' ? -1.0 : 0;
  const tDef = team.tactic === 'attack' ? -1.0 : team.tactic === 'defense' ? 1.1 : 0;
  const leaders = [...ln.f.flat(), ...ln.d.flat()].some((id) => P(id)?.tr.includes('leader')) ? 0.4 : 0;
  const fl = ln.f.map((line) => line.map(S));
  const dp = ln.d.map((pair) => pair.map(S));
  const es = fl.map((line) => dp.map((pair) => {
    const u = unit([...line, ...pair]);
    u.off += coachAdj + leaders + tOff;
    u.def += coachAdj + leaders + tDef;
    return u;
  }));
  const pp = ln.pp.map((u) => unit(u.map(S), true));
  pp.forEach((u) => (u.off += coachAdj));
  const pk = ln.pk.map((u) => unit(u.map(S)));
  pk.forEach((u) => (u.def += coachAdj));
  // 3-on-3 overtime units: top centre+winger+D combos
  const ot = [
    unit([fl[0][1], fl[0][0], dp[0][0]].filter(Boolean)),
    unit([fl[1][1], fl[0][2], dp[0][1]].filter(Boolean)),
    unit([fl[0][1], fl[1][0], dp[1][0]].filter(Boolean)),
  ];
  const gId = opts.goalie ?? ln.g[0];
  const goalie = P(gId);
  const backupId = ln.g.find((id) => id !== gId);
  const ga = goalie.r as GoalieAttrs;
  const night = normal(0, (1.4 + (99 - ga.cs) / 14) * (opts.playoff ? 1.3 : 1));
  let gq = goalieQuality(goalie) * (1 + goalie.form * 0.012) + night - (opts.b2b ? 0.8 : 0);
  if (goalie.tr.includes('wall')) gq += 1.2;
  if (opts.playoff && goalie.tr.includes('clutch')) gq += 0.6;
  const dressed = [...cache.values()];
  const avgDisc = dressed.reduce((a, s) => a + s.disc, 0) / Math.max(1, dressed.length);
  const avgPhys = dressed.reduce((a, s) => a + s.phys, 0) / Math.max(1, dressed.length);
  return {
    team, home, es, pp, pk, ot, dressed, goalie, backup: backupId ? P(backupId) : null, gq,
    discMul: Math.exp((70 - avgDisc) / 28),
    score: 0, shots: 0, ppOpp: 0, ppGoals: 0, saves: 0, pulled: false,
    physMul: Math.exp((avgPhys - 75) / 40),
  };
}

function pickWeighted(arr: Sk[], key: 'sw' | 'aw', exclude?: Sk) {
  let total = 0;
  for (const s of arr) if (s !== exclude) total += s[key];
  let r = next() * total;
  for (const s of arr) {
    if (s === exclude) continue;
    r -= s[key];
    if (r <= 0) return s;
  }
  return arr.find((s) => s !== exclude) ?? arr[0];
}

const PEN_TYPES = ['подножка', 'задержка клюшкой', 'зацеп', 'удар клюшкой', 'задержка', 'блокировка', 'грубость', 'выброс шайбы', 'удар локтем', 'атака сзади'];

export interface MatchOpts {
  playoff?: boolean;
  detail?: boolean;
  b2bHome?: boolean;
  b2bAway?: boolean;
  goalieHome?: number;
  goalieAway?: number;
}

export interface MatchBox {
  result: GameResult;
  skaters: Sk[];
  home: Side;
  away: Side;
  gwg: number | null;
}

export function simulateMatch(L: League, home: Team, away: Team, o: MatchOpts = {}): MatchBox {
  const playoff = !!o.playoff;
  const detail = !!o.detail;
  const H = buildSide(L, home, true, { playoff, b2b: !!o.b2bHome, goalie: o.goalieHome });
  const A = buildSide(L, away, false, { playoff, b2b: !!o.b2bAway, goalie: o.goalieAway });
  const events: GameEvent[] = [];
  const shotsMap: GameResult['shotsMap'] = [];
  const goals: { team: Side; scorer: Sk }[] = [];
  const momentum = new Array(12).fill(0);
  let penH = 0, penA = 0; // segments remaining shorthanded
  let penHId: Sk | null = null, penAId: Sk | null = null;
  const name = (s: Sk) => `${s.p.fn[0]}. ${s.p.ln}`;
  const ev = (e: GameEvent) => { if (detail) events.push(e); };

  // Tighter checking in the playoffs: talent gaps matter a bit less.
  const talent = playoff ? 0.8 : 1;
  const shot = (att: Side, dfn: Side, u: Unit, opp: Unit, t: number, period: number, kind: 'EV' | 'PP' | 'SH' | '3v3', base: number, pBase: number) => {
    const n = poisson(base * Math.exp((K.KS * talent * (u.off - opp.def)) / 10) * (att.home ? K.HOME : 1));
    for (let i = 0; i < n; i++) {
      const shooter = pickWeighted(u.sk, 'sw');
      att.shots++;
      shooter.sog++;
      if (period <= 3) momentum[Math.min(11, Math.floor(t / 300))] += att.home ? 1 : -1;
      const pGoal = clamp(pBase * Math.exp((K.KF * (shooter.fin - 75)) / 10 - (K.KG * (dfn.gq - 80)) / 10 + (K.KQ * talent * (u.off - opp.def)) / 10), 0.015, 0.45);
      const isGoal = dfn.pulled ? false : next() < pGoal;
      if (detail) {
        const close = isGoal ? next() < 0.7 : next() < 0.35;
        shotsMap.push({ team: att.team.id, x: close ? 0.8 + next() * 0.12 : 0.6 + next() * 0.3, y: close ? 0.35 + next() * 0.3 : 0.1 + next() * 0.8, goal: isGoal });
      }
      if (!isGoal) {
        dfn.saves++;
        continue;
      }
      att.score++;
      shooter.g++;
      const assists: Sk[] = [];
      const ra = next();
      const nA = ra < 0.06 ? 0 : ra < 0.3 ? 1 : 2;
      let ex: Sk | undefined = shooter;
      for (let k = 0; k < nA && u.sk.length > 1 + k; k++) {
        const a = pickWeighted(u.sk.filter((s) => s !== shooter && !assists.includes(s)), 'aw');
        if (!a) break;
        assists.push(a);
        a.a++;
        if (kind === 'PP') a.ppp++;
        ex = a;
      }
      void ex;
      if (kind === 'PP') { shooter.ppg++; shooter.ppp++; att.ppGoals++; }
      if (kind === 'EV' || kind === '3v3') {
        for (const s of u.sk) s.pm++;
        for (const s of opp.sk) s.pm--;
      }
      if (kind === 'SH') {
        for (const s of u.sk) s.pm++;
        for (const s of opp.sk) s.pm--;
      }
      goals.push({ team: att, scorer: shooter });
      ev({
        t, p: period, type: 'goal', team: att.team.id, strength: kind,
        players: [shooter.id, ...assists.map((a) => a.id)],
        score: [H.score, A.score],
        text: `${name(shooter)}${assists.length ? ` (${assists.map(name).join(', ')})` : ''}${kind === 'PP' ? ' · бол.' : kind === 'SH' ? ' · мен.' : ''}`,
      });
      return true;
    }
    return false;
  };

  const segment = (t: number, period: number, ot3: boolean, penaltyMul: number) => {
    // Pick units
    let hU: Unit, aU: Unit;
    let hKind: 'EV' | 'PP' | 'SH' | '3v3' = 'EV', aKind: 'EV' | 'PP' | 'SH' | '3v3' = 'EV';
    if (ot3) {
      hU = H.ot[Math.floor(next() * H.ot.length)];
      aU = A.ot[Math.floor(next() * A.ot.length)];
      hKind = aKind = '3v3';
    } else if (penH > 0 && penA <= 0) {
      hU = H.pk[next() < 0.6 ? 0 : 1];
      aU = A.pp[next() < 0.68 ? 0 : 1];
      hKind = 'SH'; aKind = 'PP';
    } else if (penA > 0 && penH <= 0) {
      hU = H.pp[next() < 0.68 ? 0 : 1];
      aU = A.pk[next() < 0.6 ? 0 : 1];
      hKind = 'PP'; aKind = 'SH';
    } else {
      hU = H.es[pickIdx(F_W)][pickIdx(D_W)];
      aU = A.es[pickIdx(F_W)][pickIdx(D_W)];
    }
    for (const s of hU.sk) s.toi += 20;
    for (const s of aU.sk) s.toi += 20;

    // Physical play
    if (next() < 0.13 * H.physMul) { const s = hU.sk[Math.floor(next() * hU.sk.length)]; s.hits++; }
    if (next() < 0.13 * A.physMul) { const s = aU.sk[Math.floor(next() * aU.sk.length)]; s.hits++; }
    if (next() < 0.075) { const s = hU.sk[Math.floor(next() * hU.sk.length)]; s.blk++; }
    if (next() < 0.075) { const s = aU.sk[Math.floor(next() * aU.sk.length)]; s.blk++; }

    // Penalties
    if (!ot3) {
      if (penH <= 0 && next() < K.PEN * H.discMul * penaltyMul) {
        const off = hU.sk[Math.floor(next() * hU.sk.length)];
        off.pim += 2;
        penH = 6; penHId = off; A.ppOpp++;
        ev({ t, p: period, type: 'penalty', team: home.id, players: [off.id], text: `${name(off)} — 2 мин (${PEN_TYPES[Math.floor(next() * PEN_TYPES.length)]})` });
      }
      if (penA <= 0 && next() < K.PEN * A.discMul * penaltyMul) {
        const off = aU.sk[Math.floor(next() * aU.sk.length)];
        off.pim += 2;
        penA = 6; penAId = off; H.ppOpp++;
        ev({ t, p: period, type: 'penalty', team: away.id, players: [off.id], text: `${name(off)} — 2 мин (${PEN_TYPES[Math.floor(next() * PEN_TYPES.length)]})` });
      }
    }
    void penHId; void penAId;

    // Score effects: trailing teams push, leading teams sit back (stronger late in the game)
    const diff = H.score - A.score;
    const se = period >= 3 ? 0.24 : 0.08;
    // Tied late in regulation, both teams play it safe and take the point.
    const tiedLate = diff === 0 && period === 3 && t >= 3000 && !playoff;
    const hMul = tiedLate ? 0.78 : diff < 0 ? 1 + se : diff > 0 ? 1 - se * 0.7 : 1;
    const aMul = tiedLate ? 0.78 : diff > 0 ? 1 + se : diff < 0 ? 1 - se * 0.7 : 1;

    const baseFor = (kind: string) => (kind === 'PP' ? K.PP_SHOT : kind === 'SH' ? K.SH_SHOT : kind === '3v3' ? K.OT_SHOT : K.BASE_SHOT);
    const pFor = (kind: string) => (kind === 'PP' ? K.PP_P : kind === 'SH' ? K.SH_P : kind === '3v3' ? K.OT_P : K.BASE_P);

    // Empty net situations (regulation only)
    let enH = false, enA = false;
    if (period === 3 && !playoffOT) {
      const left = 3600 - t;
      if (diff === -1 && left <= 120) enH = true;
      if (diff === -2 && left <= 170) enH = true;
      if (diff === 1 && left <= 120) enA = true;
      if (diff === 2 && left <= 170) enA = true;
    }
    if (enH !== H.pulled) { H.pulled = enH; if (enH) ev({ t, p: period, type: 'pull', team: home.id, text: `${home.short} снимают вратаря` }); }
    if (enA !== A.pulled) { A.pulled = enA; if (enA) ev({ t, p: period, type: 'pull', team: away.id, text: `${away.short} снимают вратаря` }); }

    let scored: Side | null = null;
    const order = next() < 0.5 ? [0, 1] : [1, 0];
    for (const o of order) {
      const att = o === 0 ? H : A, dfn = o === 0 ? A : H;
      const u = o === 0 ? hU : aU, opp = o === 0 ? aU : hU;
      const kind = o === 0 ? hKind : aKind;
      const mul = (o === 0 ? hMul : aMul) * (att.pulled ? 1.5 : 1);
      if (dfn.pulled) {
        // Shooting at an empty net
        if (next() < K.EN_RATE) {
          const shooter = pickWeighted(u.sk, 'sw');
          if (next() < K.EN_P) {
            att.score++; att.shots++; shooter.g++; shooter.sog++;
            const a1 = pickWeighted(u.sk, 'aw', shooter);
            if (a1 && next() < 0.8) a1.a++;
            for (const s of u.sk) s.pm++;
            for (const s of opp.sk) s.pm--;
            goals.push({ team: att, scorer: shooter });
            ev({ t, p: period, type: 'goal', team: att.team.id, strength: 'EN', players: [shooter.id], score: [H.score, A.score], text: `${name(shooter)} · в пустые ворота` });
            scored = att;
            break;
          }
        }
        continue;
      }
      if (shot(att, dfn, u, opp, t, period, kind, baseFor(kind) * mul, pFor(kind))) {
        scored = att;
        if (kind === 'PP') { if (att === H) penA = 0; else penH = 0; }
        break;
      }
    }
    if (penH > 0) penH--;
    if (penA > 0) penA--;
    return scored;
  };

  let playoffOT = false;
  // Regulation
  for (let period = 1; period <= 3; period++) {
    for (let seg = 0; seg < 60; seg++) segment((period - 1) * 1200 + seg * 20, period, false, playoff ? 0.82 : 1);
    ev({ t: period * 1200, p: period, type: 'period', team: '', score: [H.score, A.score], text: `Конец ${period}-го периода` });
  }
  H.pulled = A.pulled = false;
  let ot: 'OT' | 'SO' | null = null;
  if (H.score === A.score) {
    if (playoff) {
      playoffOT = true;
      let period = 4;
      outer: while (true) {
        for (let seg = 0; seg < 60; seg++) {
          const t = 3600 + (period - 4) * 1200 + seg * 20;
          if (segment(t, period, false, 0.6)) break outer;
        }
        period++;
        if (period > 12) { // safety valve
          (next() < 0.5 ? H : A).score++;
          break;
        }
      }
      ot = 'OT';
    } else {
      penH = penA = 0;
      for (let seg = 0; seg < 15; seg++) {
        if (segment(3600 + seg * 20, 4, true, 0)) { ot = 'OT'; break; }
      }
      if (H.score === A.score) {
        ot = 'SO';
        const shooters = (s: Side) => [...s.dressed].filter((x) => !x.isD).sort((a, b) => (b.p.r as SkaterAttrs).ha + (b.p.r as SkaterAttrs).sh - (a.p.r as SkaterAttrs).ha - (a.p.r as SkaterAttrs).sh);
        const hs = shooters(H), as = shooters(A);
        let hG = 0, aG = 0;
        const attempt = (s: Sk, g: Side) => {
          const a = s.p.r as SkaterAttrs;
          const p = clamp(K.SO_P + ((a.ha + a.sh) / 2 - 80) * 0.008 - (g.gq - 80) * 0.01, 0.12, 0.55);
          return next() < p;
        };
        for (let r = 0; r < 20; r++) {
          const hS = hs[r % hs.length], aS = as[r % as.length];
          const hg = attempt(hS, A), ag = attempt(aS, H);
          if (hg) hG++;
          if (ag) aG++;
          ev({ t: 3900, p: 5, type: 'so', team: home.id, text: `Буллиты: ${name(hS)} ${hg ? '✓' : '✗'} · ${name(aS)} ${ag ? '✓' : '✗'}` });
          if (r >= 2 && hG !== aG) break;
          if (r < 2) {
            const left = 2 - r;
            if (hG > aG + left || aG > hG + left) break;
          }
        }
        if (hG === aG) (next() < 0.5 ? (hG++) : (aG++));
        if (hG > aG) H.score++;
        else A.score++;
      }
    }
  }
  ev({ t: 3600, p: 3, type: 'end', team: '', score: [H.score, A.score], text: 'Финальная сирена' });

  // Game-winning goal: the goal that put the winner ahead for good (not shootout).
  let gwg: number | null = null;
  if (ot !== 'SO') {
    const winner = H.score > A.score ? H : A;
    const loserScore = Math.min(H.score, A.score);
    const wGoals = goals.filter((g) => g.team === winner);
    if (wGoals[loserScore]) gwg = wGoals[loserScore].scorer.id;
  }

  // Injuries
  const injuries: GameResult['injuries'] = [];
  for (const [side, oppSide] of [[H, A], [A, H]] as const) {
    for (const s of side.dressed) {
      const a = s.p.r as SkaterAttrs;
      const pInj = K.INJ * (1.65 - a.du / 100) * oppSide.physMul * (s.p.tr.includes('ironman') ? 0.5 : 1);
      if (chance(pInj)) injuries.push(rollInjury(s.id));
    }
    if (chance(K.INJ * 0.35)) injuries.push(rollInjury(side.goalie.id));
  }

  // Three stars
  const all: Sk[] = [...H.dressed, ...A.dressed];
  const scoreSk = (s: Sk) => s.g * 1.0 + s.a * 0.7 + s.sog * 0.08 + s.pm * 0.15 + s.blk * 0.05 + s.hits * 0.03 + (gwg === s.id ? 0.4 : 0);
  const cands: { id: number; v: number }[] = all.map((s) => ({ id: s.id, v: scoreSk(s) }));
  for (const side of [H, A]) {
    const opp = side === H ? A : H;
    const v = side.saves * 0.065 - opp.score * 0.45 + (side.score > opp.score ? 0.6 : 0) + (opp.score === 0 ? 1 : 0);
    cands.push({ id: side.goalie.id, v });
  }
  cands.sort((a, b) => b.v - a.v);
  const stars = cands.slice(0, 3).map((c) => c.id);

  const result: GameResult = {
    hs: H.score, as: A.score, ot,
    shH: H.shots, shA: A.shots,
    events, stars,
    ppH: [H.ppGoals, H.ppOpp], ppA: [A.ppGoals, A.ppOpp],
    gH: H.goalie.id, gA: A.goalie.id,
    shotsMap, injuries, momentum,
  };
  return { result, skaters: all, home: H, away: A, gwg };
}

const INJ_TYPES: [string, number, number, number][] = [
  // type, weight, minDays, maxDays
  ['Верх тела', 0.22, 1, 14],
  ['Низ тела', 0.22, 1, 14],
  ['Растяжение паха', 0.08, 5, 25],
  ['Сотрясение', 0.07, 7, 45],
  ['Травма колена', 0.08, 10, 80],
  ['Травма плеча', 0.06, 10, 60],
  ['Перелом кисти', 0.05, 25, 50],
  ['Голеностоп', 0.06, 7, 35],
  ['Спина', 0.05, 3, 30],
  ['Болезнь', 0.08, 1, 5],
  ['Разрыв связок', 0.03, 120, 220],
];

export function rollInjury(id: number) {
  let r = next() * INJ_TYPES.reduce((a, x) => a + x[1], 0);
  for (const [type, w, lo, hi] of INJ_TYPES) {
    r -= w;
    if (r <= 0) {
      const u = next();
      const days = Math.round(lo + (hi - lo) * u * u);
      return { id, days, type };
    }
  }
  return { id, days: 3, type: 'Верх тела' };
}
