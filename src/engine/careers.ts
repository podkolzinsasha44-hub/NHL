// GM career ladder: a successful GM gets calls from other clubs in the summer — a KHL GM with a
// name can move up to the NHL. The user decides; nobody is moved without an answer. The same
// hand-over is used when a fired GM accepts a new job.
import { autoLines } from './lines';
import { OWNER_NAMES } from './names';
import { pushMsg, pushNews } from './news';
import { ownerGoalFor } from './owner';
import { next, pick, shuffle } from './rng';
import { teamPower } from './lines';
import type { JobOffer, League, LeagueId, Team } from './types';
import { CUP_RU, isGM, LG_RU, leagueTeams, lgOf } from './leagues';
import { unlock } from './achievements';
import { clamp } from './util';

/** The club missed the playoffs of its league this season (its GM is likely to be replaced). */
function missedPlayoffs(L: League, t: Team) {
  const po = lgOf(t) === 'KHL' ? L.khl?.playoffs : L.playoffs;
  if (!po || po.season !== L.season) return t.strategy === 'rebuild';
  return !po.series.some((s) => s.hi === t.id || s.lo === t.id);
}

/** Strength rank of a club in its league (1 = strongest). */
export function strengthRank(L: League, team: string) {
  const lg = lgOf(L.teams[team]);
  const ranks = leagueTeams(L, lg).map((t) => ({ id: t.id, p: teamPower(L, t) })).sort((a, b) => b.p - a.p);
  return { rank: ranks.findIndex((r) => r.id === team) + 1, of: ranks.length };
}

function noteFor(L: League, t: Team, fromKhl: boolean) {
  const lg = lgOf(t);
  const { rank, of } = strengthRank(L, t.id);
  const goal = ownerGoalFor(L, t.id).text;
  const who = fromKhl && lg === 'NHL' ? `Клуб НХЛ следит за вашей работой в КХЛ и готов доверить вам команду. ` : '';
  return `${who}${t.name}: ${rank}-я сила ${LG_RU[lg]} из ${of}. Владелец ждёт: ${goal}.`;
}

/**
 * Summer calls after the owner's review of the user's season. `result`: 0 = missed the playoffs,
 * 1..4 = round lost in, 5 = champion.
 */
export function jobCalls(L: League, result: number) {
  if (!isGM(L) || L.gm.fired) return;
  const me = L.teams[L.user];
  const lg = lgOf(me);
  const rep = L.gm.rep;
  const until = `${L.date.slice(0, 4)}-08-25`;
  const pool = (target: LeagueId) => shuffle(leagueTeams(L, target).filter((t) => t.id !== L.user && missedPlayoffs(L, t)));
  const picks: Team[] = [];
  if (lg === 'KHL') {
    // The way up: NHL clubs call a KHL GM with titles or a big name.
    const nhlChance = result === 5 ? 0.85 : result >= 4 && rep >= 55 ? 0.5 : rep >= 65 ? 0.35 : 0;
    if (nhlChance && next() < nhlChance) picks.push(...pool('NHL').slice(0, rep >= 75 || result === 5 ? 2 : 1));
    if (rep >= 55 && result >= 2 && next() < 0.5) picks.push(...pool('KHL').filter((t) => t.bigMarket).slice(0, 1));
  } else {
    const chance = result === 5 ? 0.6 : result >= 4 ? 0.45 : rep >= 70 ? 0.3 : 0;
    if (chance && next() < chance) {
      const p = pool('NHL');
      // Big markets go after successful GMs first.
      picks.push(...[...p.filter((t) => t.bigMarket), ...p.filter((t) => !t.bigMarket)].slice(0, rep >= 80 ? 2 : 1));
    }
  }
  const calls: JobOffer[] = picks.map((t) => ({ team: t.id, until, note: noteFor(L, t, lg === 'KHL') }));
  if (!calls.length) return;
  L.gm.calls = calls;
  pushMsg(L, {
    from: 'Ваш агент', kind: 'agent',
    title: calls.length > 1 ? `Вас зовут ${calls.length} клуба` : `Вас зовёт ${L.teams[calls[0].team].name}`,
    body: `${calls.map((c) => c.note).join('\n\n')}\n\nОтветить нужно до 25 августа. Текущий клуб не держит: решение за вами (Ещё → Карьера).`,
    ref: { type: 'screen', id: 'career' },
  });
  L.stops.push('job-offer');
}

/** Drops the calls after the deadline (training camp). */
export function expireCalls(L: League) {
  if (L.gm.calls?.length && L.gm.calls.every((c) => c.until < L.date)) L.gm.calls = [];
  else if (L.gm.calls) L.gm.calls = L.gm.calls.filter((c) => c.until >= L.date);
}

export function declineCall(L: League, team: string) {
  L.gm.calls = (L.gm.calls ?? []).filter((c) => c.team !== team);
  // Loyalty pleases the owner.
  L.owner.trust = clamp(L.owner.trust + 2, 0, 100);
}

/** Moves the GM to another club (accepted call or a new job after being fired). */
export function takeJob(L: League, team: string) {
  const old = L.user;
  const oldT = L.teams[old];
  const t = L.teams[team];
  if (!t) return;
  const fromKhl = !!oldT && lgOf(oldT) === 'KHL';
  const wasFired = L.gm.fired;
  if (oldT && !wasFired && old !== team) {
    L.gm.history.push({ season: L.season, team: old, result: `ушёл в ${t.short}` });
  }
  L.user = team;
  L.gm.fired = false;
  L.gm.offers = [];
  L.gm.calls = [];
  L.gm.hiredSeason = L.season;
  const g = ownerGoalFor(L, team);
  L.owner = { name: pick(OWNER_NAMES), trust: wasFired ? 55 : clamp(55 + Math.round((L.gm.rep - 50) / 4), 50, 70), warnings: 0, patience: 2, goal: g.goal, goalText: g.text };
  // Talks and offers of the old club stay with the old club.
  L.offers = [];
  for (const id of Object.keys(L.negotiations)) if (L.negotiations[Number(id)].team === old) delete L.negotiations[Number(id)];
  autoLines(L, t);
  if (oldT) autoLines(L, oldT);
  pushNews(L, { kind: 'owner', important: true, team, title: `${L.gm.name} — новый генеральный менеджер ${t.name}`, body: oldT && !wasFired ? `Он покидает ${oldT.name}.` : undefined });
  pushMsg(L, { from: `${L.owner.name}, владелец`, kind: 'owner', title: `Добро пожаловать в ${t.name}`, body: `Рад, что вы с нами. Мои ожидания: ${g.text}. Цель клуба — ${CUP_RU[lgOf(t)]}.` });
  if (fromKhl && lgOf(t) === 'NHL') unlock(L, 'promotion');
}
