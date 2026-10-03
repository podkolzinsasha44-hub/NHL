import { teamPower } from './lines';
import { pushMsg, pushNews } from './news';
import { shuffle } from './rng';
import type { League, OwnerState } from './types';
import { CUP_RU, leagueTeams, lgOf } from './leagues';
import { clamp } from './util';

export function ownerGoalFor(L: League, teamId: string): { goal: OwnerState['goal']; text: string } {
  const lg = lgOf(L.teams[teamId]);
  const ranks = leagueTeams(L, lg)
    .map((t) => ({ id: t.id, p: teamPower(L, t) }))
    .sort((a, b) => b.p - a.p);
  // Thresholds are set for 32 NHL clubs and scaled to the size of the league.
  const rank = ((ranks.findIndex((r) => r.id === teamId) + 1) * 32) / ranks.length;
  if (rank <= 3) return { goal: 'cup', text: `команда собрана для победы — жду ${CUP_RU[lg]} или как минимум финал` };
  if (rank <= 7) return { goal: 'final', text: lg === 'KHL' ? 'мы среди фаворитов — нужен глубокий поход в плей-офф (минимум полуфинал)' : 'мы среди фаворитов — нужен глубокий поход в плей-офф (минимум финал конференции)' };
  if (rank <= 13) return { goal: 'round2', text: 'выход в плей-офф и победа хотя бы в одном раунде' };
  if (rank <= 20) return { goal: 'playoffs', text: 'попадание в плей-офф' };
  if (rank <= 26) return { goal: 'improve', text: 'заметный прогресс: больше очков, чем в прошлом сезоне, и ставка на молодёжь' };
  return { goal: 'develop', text: 'перестройка: развивайте молодых игроков и копите активы. Результат сейчас не главное' };
}

/** Evaluates the season for the owner. Returns trust delta and a verdict. */
export function evaluateSeason(L: League, playoffRound: number, pointsNow: number, pointsBefore: number | null) {
  const o = L.owner;
  // playoffRound: 0 = missed, 1 = lost R1, 2 = lost R2, 3 = lost conf final, 4 = lost final, 5 = champion
  const need: Record<OwnerState['goal'], number> = { cup: 4, final: 3, round2: 2, playoffs: 1, improve: 0, develop: 0 };
  let delta = 0;
  if (o.goal === 'improve') delta = (pointsBefore != null ? (pointsNow - pointsBefore) * 0.8 : 0) + (playoffRound >= 1 ? 10 : 0);
  else if (o.goal === 'develop') delta = 6 + (playoffRound >= 1 ? 8 : 0);
  else delta = (playoffRound - need[o.goal]) * 12 + (playoffRound >= need[o.goal] ? 8 : -6);
  if (playoffRound === 5) delta += 30;
  // Difficulty: owners are harsher on Hardcore
  let mul = L.settings.difficulty === 'rookie' ? 0.6 : L.settings.difficulty === 'hard' ? 1.3 : 1;
  // Big hockey markets: the media and fans push the owner harder.
  if (L.teams[L.user].bigMarket) mul *= 1.15;
  delta = delta < 0 ? delta * mul : delta / mul;
  o.trust = clamp(Math.round(o.trust + delta), 0, 100);
  return Math.round(delta);
}

export function ownerReact(L: League) {
  const o = L.owner;
  if (L.settings.noFiring) {
    // "No firing" mode: the owner still voices displeasure but keeps the GM.
    if (o.trust < 25) pushMsg(L, { from: `${o.name}, владелец`, kind: 'owner', title: 'Я недоволен', body: 'Результаты далеки от ожиданий. Уволить вас я не могу, но жду перемен — болельщики и спонсоры тоже ждут.' });
    o.trust = Math.max(o.trust, 10);
    return;
  }
  if (o.trust <= 0) return fire(L);
  if (o.trust < 25) {
    o.warnings++;
    pushMsg(L, { from: `${o.name}, владелец`, kind: 'owner', title: 'Последнее предупреждение', body: 'Терпение на исходе. Если результаты не улучшатся, мне придётся искать нового генерального менеджера.' });
  }
}

export function fire(L: League) {
  L.gm.fired = true;
  pushNews(L, { kind: 'owner', title: `${L.teams[L.user].name} увольняют генерального менеджера ${L.gm.name}`, important: true, team: L.user });
  // Other clubs with weak management may call.
  // Clubs of the same league call first; a GM with a name may also get an offer from the other league.
  const lg = lgOf(L.teams[L.user]);
  const same = shuffle(leagueTeams(L, lg).filter((t) => t.id !== L.user && t.strategy !== 'contend'));
  const other = shuffle(leagueTeams(L, lg === 'NHL' ? 'KHL' : 'NHL').filter((t) => t.strategy !== 'contend'));
  const n = L.gm.rep >= 45 ? 3 : L.gm.rep >= 25 ? 1 : 0;
  const offers = [...same.slice(0, n), ...(n >= 1 ? other.slice(0, 1) : [])].map((t) => t.id);
  L.gm.offers = offers;
}
