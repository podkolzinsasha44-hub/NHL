// Player development & aging, applied once a year at training camp (Sept 1).
import { genPlayer, genTraits, POOL_LEAGUES, weightedCountry } from './gen';
import { next, normal, int } from './rng';
import { pushMsg, pushNews, social } from './news';
import { careerGoalie, careerSkater } from './stats';
import type { GoalieAttrs, League, Player, SkaterAttrs } from './types';
import { ageOn, calcOvr, clamp } from './util';

/** Expected yearly OVR change by age (before potential gap & randomness). */
export function ageDelta(age: number, pos: Player['pos']): number {
  const g = pos === 'G';
  if (age <= 19) return 4.5;
  if (age <= 21) return 3.2;
  if (age <= 23) return 2.0;
  if (age <= 25) return g ? 1.6 : 1.0;
  if (age <= 27) return g ? 0.8 : 0.2;
  if (age <= 29) return g ? 0.2 : -0.4;
  if (age <= 31) return g ? -0.5 : -1.4;
  if (age <= 33) return g ? -1.3 : -2.4;
  if (age <= 35) return g ? -2.4 : -3.4;
  return -4.6;
}

/** Projected OVR `years` from now (used by trade valuation, no randomness). */
export function projectOvr(p: Player, age: number, years: number) {
  let o = p.ovr;
  for (let y = 0; y < years; y++) {
    const a = age + y;
    const gap = Math.max(0, p.pot - o);
    let d = ageDelta(a, p.pos);
    if (d > 0) d = Math.min(gap, d + gap * (a <= 21 ? 0.22 : a <= 24 ? 0.15 : 0.06));
    o = clamp(o + d, 30, 99);
  }
  return o;
}

export function developPlayer(L: League, p: Player, coachDev: number) {
  const a = ageOn(p.bd, L.date);
  const gap = Math.max(0, p.pot - p.ovr);
  let d = ageDelta(a, p.pos);
  if (d > 0) {
    d += gap * (a <= 21 ? 0.22 : a <= 24 ? 0.15 : 0.06);
    // Ice time matters: NHL/AHL/top leagues develop faster than a press box
    const gp = (p.stats[`${L.season - 1}r`]?.gp ?? 0);
    if (p.st === 'NHL' && gp < 20) d *= 0.75;
    if (p.dev === 'E' && a <= 21) d *= 1.25;
    if (p.dev === 'L' && a <= 21) d *= 0.75;
    if (p.dev === 'L' && a >= 23 && a <= 27) d += 1.2;
    d *= 0.85 + p.pers.prof / 70;
    d += coachDev;
  } else {
    d *= 1.15 - p.pers.prof / 60; // professionals age better
  }
  d += normal(0, a <= 23 ? 2.2 : 1.4);
  // Breakout / bust events for young players
  if (a <= 24 && next() < 0.04) d += int(3, 7);
  if (a <= 24 && next() < 0.03) { d -= int(2, 5); p.pot = Math.max(p.ovr, p.pot - int(3, 8)); }
  if (d > 0) d = Math.min(d, gap + 2);
  const before = p.ovr;
  applyDelta(p, d);
  // Potential drifts towards reality as players mature
  if (a >= 26) p.pot = Math.max(p.ovr, Math.min(p.pot, p.ovr + 1));
  else if (p.pot < p.ovr) p.pot = p.ovr;
  p.hist.push([L.season, p.ovr]);
  p.tr = [...new Set([...p.tr.filter((t) => t !== 'leader' || a >= 30), ...genTraits(p).filter((t) => !p.tr.includes(t))])].slice(0, 4);
  return p.ovr - before;
}

function applyDelta(p: Player, d: number) {
  if (p.pos === 'G') {
    const a = p.r as GoalieAttrs;
    for (const k of ['po', 'rf', 'rb', 'cs', 'mn', 'pk'] as const) a[k] = clamp(Math.round(a[k] + d + normal(0, 1)), 25, 99);
  } else {
    const a = p.r as SkaterAttrs;
    const focus = p.focus as keyof SkaterAttrs | undefined;
    const keys: (keyof SkaterAttrs)[] = ['sk', 'sh', 'pa', 'ha', 'oi', 'di', 'ph', 'fo'];
    for (const k of keys) {
      let dk = d + normal(0, 1.1);
      if (k === 'sk' && d < 0) dk -= 0.8; // skating declines first
      if (focus === k && d > -3) dk += 2.2;
      else if (focus) dk -= 0.25;
      a[k] = clamp(Math.round(a[k] + dk), 25, 99);
    }
  }
  p.ovr = calcOvr(p);
}

/** Yearly training camp: development, aging and a report for the user. */
export function trainingCamp(L: League) {
  const report: { p: Player; d: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    const coach = p.team ? L.teams[p.team]?.coach : null;
    const coachDev = coach ? (coach.style === 'development' ? 0.5 : 0) + (coach.rating - 72) * 0.01 : 0;
    const d = developPlayer(L, p, coachDev);
    if (p.team === L.user) report.push({ p, d });
    p.focus = null;
    p.form = 0;
  }
  report.sort((a, b) => b.d - a.d);
  const up = report.filter((r) => r.d >= 2).slice(0, 6);
  const down = report.filter((r) => r.d <= -2).sort((a, b) => a.d - b.d).slice(0, 5);
  pushMsg(L, {
    from: 'Тренерский штаб', kind: 'staff',
    title: 'Итоги тренировочного лагеря',
    body: `Прибавили: ${up.map((r) => `${r.p.ln} ${r.d > 0 ? '+' : ''}${r.d}`).join(', ') || 'никто заметно'}.\nСдали: ${down.map((r) => `${r.p.ln} ${r.d}`).join(', ') || 'никто заметно'}.`,
  });
  if (up[0] && up[0].d >= 5) social(L, `${up[0].p.fn} ${up[0].p.ln} выглядит в лагере как новый игрок (+${up[0].d})`, { kind: 'insider', team: L.user, players: [up[0].p.id] });
}

/** Retirements happen after the playoffs. */
export function retirements(L: League) {
  const notable: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    const a = ageOn(p.bd, L.date);
    let pr = 0;
    if (a >= 41) pr = 0.95;
    else if (a >= 38) pr = 0.45;
    else if (a >= 36) pr = 0.22;
    else if (a >= 34) pr = 0.08;
    else if (a >= 31 && p.ovr < 64) pr = 0.25;
    else if (a >= 28 && p.ovr < 55) pr = 0.3;
    // Still under contract and good → keeps playing
    if (p.c && p.c.last > L.season && p.ovr >= 76) pr *= 0.25;
    if (p.ovr >= 84) pr *= 0.4;
    if (next() >= pr) continue;
    retire(L, p);
    const car = p.pos === 'G' ? careerGoalie(p).gp : careerSkater(p).gp;
    if (car >= 700 || p.awards.length || p.ovr >= 82) notable.push(p);
  }
  for (const p of notable.slice(0, 12)) {
    const c = p.pos === 'G' ? careerGoalie(p) : careerSkater(p);
    const line = p.pos === 'G' ? `${c.gp} матчей, ${(c as { w: number }).w} побед` : `${c.gp} матчей, ${(c as { pts: number }).pts} очков`;
    pushNews(L, { kind: 'retire', title: `${p.fn} ${p.ln} завершает карьеру (${line})`, players: [p.id], team: p.team ?? undefined, important: p.team === L.user });
  }
}

export function retire(L: League, p: Player) {
  p.retired = L.season;
  p.st = 'RET';
  p.c = null;
  delete p.ext;
  p.team = null;
}

/** Keeps the world pool from shrinking: young players appear in European and NCAA leagues each year. */
export function replenishPool(L: League) {
  const n = L.settings.worldSize === 'compact' ? 30 : L.settings.worldSize === 'huge' ? 600 : 220;
  for (let i = 0; i < n; i++) {
    const lg = POOL_LEAGUES[Math.floor(next() * POOL_LEAGUES.length)];
    const age = int(19, 23);
    const ovr = lg.ovr[0] - 3 + next() * (lg.ovr[1] - lg.ovr[0]) * 0.6;
    genPlayer(L, { age, country: weightedCountry(lg.countries), ovr, pot: ovr + 3 + next() * 12, league: lg.lg, status: lg.status });
  }
}
