import { pushMsg, pushNews, social } from './news';
import { compareTeams, playoffPicture } from './standings';
import type { Game, League, PlayoffSeries } from './types';
import { addDays } from './util';
import { pressConference } from './press';

export function startPlayoffs(L: League, startDay: string) {
  const pic = playoffPicture(L);
  const series: PlayoffSeries[] = [];
  for (const conf of ['E', 'W'] as const) {
    const c = pic[conf];
    const [w1, w2] = [c.div1[0], c.div2[0]];
    const better = compareTeams(w1, w2) <= 0 ? 'div1' : 'div2';
    const wcLow = c.wc[1], wcHigh = c.wc[0];
    const opp1 = better === 'div1' ? wcLow : wcHigh;
    const opp2 = better === 'div1' ? wcHigh : wcLow;
    const mk = (id: string, a: string, b: string, next: string): PlayoffSeries => {
      const ta = L.teams[a], tb = L.teams[b];
      const hiFirst = compareTeams(ta, tb) <= 0;
      return { id, round: 1, conf, hi: hiFirst ? a : b, lo: hiFirst ? b : a, wHi: 0, wLo: 0, games: [], next };
    };
    series.push(mk(`${conf}1A`, w1.id, opp1.id, `${conf}2A`));
    series.push(mk(`${conf}1B`, c.div1[1].id, c.div1[2].id, `${conf}2A`));
    series.push(mk(`${conf}1C`, w2.id, opp2.id, `${conf}2B`));
    series.push(mk(`${conf}1D`, c.div2[1].id, c.div2[2].id, `${conf}2B`));
  }
  L.playoffs = { season: L.season, series, round: 1 };
  L.phase = 'playoffs';
  for (const s of series) scheduleNext(L, s, startDay);
  const inPo = series.some((s) => s.hi === L.user || s.lo === L.user);
  pushNews(L, { kind: 'league', title: 'Стартует плей-офф Кубка Стэнли', body: series.map((s) => `${L.teams[s.hi].short} — ${L.teams[s.lo].short}`).join('\n'), important: true });
  if (inPo) pushMsg(L, { from: `${L.owner.name}, владелец`, kind: 'owner', title: 'Мы в плей-офф', body: 'Отличная работа. Теперь начинается настоящий хоккей — каждый матч на вес золота.' });
  else social(L, `${L.teams[L.user].short} пролетают мимо плей-офф. Кто ответит за это?`, { kind: 'fan', team: L.user });
  L.stops.push('playoffs');
}

const HOME_PATTERN = [true, true, false, false, true, false, true]; // 2-2-1-1-1

export function scheduleNext(L: League, s: PlayoffSeries, day: string) {
  const n = s.wHi + s.wLo;
  const hiHome = HOME_PATTERN[n];
  const g: Game = { id: L.nextGameId++, day, h: hiHome ? s.hi : s.lo, a: hiHome ? s.lo : s.hi, series: s.id };
  L.games.push(g);
  s.games.push(g.id);
}

export function seriesOf(L: League, id: string) {
  return L.playoffs?.series.find((s) => s.id === id);
}

/** Called after a playoff game is played. */
export function onPlayoffGame(L: League, g: Game) {
  const po = L.playoffs!;
  const s = seriesOf(L, g.series!)!;
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const winner = homeWon ? g.h : g.a;
  if (winner === s.hi) s.wHi++;
  else s.wLo++;
  if (s.wHi === 4 || s.wLo === 4) {
    s.winner = s.wHi === 4 ? s.hi : s.lo;
    const loser = s.winner === s.hi ? s.lo : s.hi;
    const score = `${Math.max(s.wHi, s.wLo)}–${Math.min(s.wHi, s.wLo)}`;
    if (s.round === 4) {
      po.champion = s.winner;
      return 'final';
    }
    pushNews(L, { kind: 'league', title: `${L.teams[s.winner].name} проходят ${L.teams[loser].short} (${score})`, team: s.winner });
    if (loser === L.user) { L.stops.push('eliminated'); pressConference(L, 'eliminated'); }
    if (s.winner === L.user) L.stops.push('series-won');
    // Round complete?
    const roundSeries = po.series.filter((x) => x.round === s.round);
    if (roundSeries.every((x) => x.winner)) startNextRound(L, s.round, g.day);
  } else {
    scheduleNext(L, s, addDays(g.day, 2));
  }
  return null;
}

function startNextRound(L: League, round: number, lastDay: string) {
  const po = L.playoffs!;
  const prev = po.series.filter((x) => x.round === round);
  const nextIds = [...new Set(prev.map((x) => x.next!))];
  const created: PlayoffSeries[] = [];
  for (const nid of nextIds) {
    const feeders = prev.filter((x) => x.next === nid).map((x) => x.winner!);
    const [a, b] = feeders;
    const hiFirst = compareTeams(L.teams[a], L.teams[b]) <= 0;
    const r = round + 1;
    const conf = r === 4 ? 'F' : (nid[0] as 'E' | 'W');
    let next: string | undefined;
    if (r === 2) next = `${conf}3`;
    if (r === 3) next = 'F4';
    created.push({ id: nid, round: r, conf, hi: hiFirst ? a : b, lo: hiFirst ? b : a, wHi: 0, wLo: 0, games: [], next });
  }
  po.series.push(...created);
  po.round = round + 1;
  const start = addDays(lastDay, 2);
  for (const s of created) scheduleNext(L, s, start);
  const names = ['', '', 'Второй раунд', 'Финалы конференций', 'Финал Кубка Стэнли'];
  pushNews(L, { kind: 'league', title: `${names[round + 1]}: ${created.map((s) => `${L.teams[s.hi].short}–${L.teams[s.lo].short}`).join(', ')}`, important: round + 1 === 4 });
}

/** 0 = missed, 1..4 = round lost in, 5 = champion */
export function playoffResultOf(L: League, team: string) {
  const po = L.playoffs;
  if (!po) return 0;
  let r = 0;
  for (const s of po.series) {
    if (s.hi === team || s.lo === team) r = Math.max(r, s.round);
  }
  if (po.champion === team) return 5;
  return r;
}

export function nextSeriesFix(L: League) {
  // Fix 'next' pointers for round-1 created series (E2A/E2B → E3, W2A/W2B → W3, E3/W3 → F4)
  for (const s of L.playoffs?.series ?? []) {
    if (s.round === 2) s.next = `${s.conf}3`;
  }
}
