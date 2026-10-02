import { teamPower } from './lines';
import { pushMsg, pushNews } from './news';
import { shuffle } from './rng';
import type { League, OwnerState } from './types';
import { clamp } from './util';

export function ownerGoalFor(L: League, teamId: string): { goal: OwnerState['goal']; text: string } {
  const ranks = Object.values(L.teams)
    .map((t) => ({ id: t.id, p: teamPower(L, t) }))
    .sort((a, b) => b.p - a.p);
  const rank = ranks.findIndex((r) => r.id === teamId) + 1;
  if (rank <= 3) return { goal: 'cup', text: 'команда собрана для победы — жду Кубок Стэнли или как минимум финал' };
  if (rank <= 7) return { goal: 'final', text: 'мы среди фаворитов — нужен глубокий поход в плей-офф (минимум финал конференции)' };
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
  const mul = L.settings.difficulty === 'rookie' ? 0.6 : L.settings.difficulty === 'hard' ? 1.3 : 1;
  delta = delta < 0 ? delta * mul : delta / mul;
  o.trust = clamp(Math.round(o.trust + delta), 0, 100);
  return Math.round(delta);
}

export function ownerReact(L: League) {
  const o = L.owner;
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
  const offers = shuffle(Object.values(L.teams).filter((t) => t.id !== L.user))
    .filter((t) => t.strategy !== 'contend')
    .slice(0, L.gm.rep >= 45 ? 3 : L.gm.rep >= 25 ? 1 : 0)
    .map((t) => t.id);
  L.gm.offers = offers;
}
