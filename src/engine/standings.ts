import type { League, LeagueId, Record_, Team } from './types';
import { lgOf } from './leagues';

export const emptyRecord = (): Record_ => ({
  gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, rw: 0, row: 0, hw: 0, hl: 0, hotl: 0, streak: '', l10: [],
  ppo: 0, ppg: 0, pko: 0, pkga: 0, sf: 0, sa: 0,
});

/** NHL tiebreakers: points%, regulation wins, ROW, wins, goal differential, goals for. */
export function compareTeams(a: Team, b: Team) {
  const ra = a.rec, rb = b.rec;
  const pa = ra.gp ? ra.pts / (2 * ra.gp) : 0;
  const pb = rb.gp ? rb.pts / (2 * rb.gp) : 0;
  if (ra.pts !== rb.pts && ra.gp === rb.gp) return rb.pts - ra.pts;
  if (pa !== pb) return pb - pa;
  if (ra.rw !== rb.rw) return rb.rw - ra.rw;
  if (ra.row !== rb.row) return rb.row - ra.row;
  if (ra.w !== rb.w) return rb.w - ra.w;
  const gd = rb.gf - rb.ga - (ra.gf - ra.ga);
  if (gd) return gd;
  return rb.gf - ra.gf;
}

/** Teams of one league (NHL by default) in standings order. */
export function sortedTeams(L: League, filter?: (t: Team) => boolean, lg: LeagueId = 'NHL') {
  return Object.values(L.teams).filter((t) => lgOf(t) === lg && (filter ? filter(t) : true)).sort(compareTeams);
}

export const DIV_NAMES: Record<string, string> = { A: 'Атлантический', M: 'Столичный', C: 'Центральный', P: 'Тихоокеанский' };
export const CONF_NAMES: Record<string, string> = { E: 'Восточная', W: 'Западная' };

export interface Seeds {
  E: { div1: Team[]; div2: Team[]; wc: Team[]; out: Team[] };
  W: { div1: Team[]; div2: Team[]; wc: Team[]; out: Team[] };
}

export function playoffPicture(L: League): Seeds {
  const res = {} as Seeds;
  for (const conf of ['E', 'W'] as const) {
    const divs = conf === 'E' ? ['A', 'M'] : ['C', 'P'];
    const d1 = sortedTeams(L, (t) => t.div === divs[0]);
    const d2 = sortedTeams(L, (t) => t.div === divs[1]);
    const top = [...d1.slice(0, 3), ...d2.slice(0, 3)];
    const rest = sortedTeams(L, (t) => t.conf === conf && !top.includes(t));
    res[conf] = { div1: d1.slice(0, 3), div2: d2.slice(0, 3), wc: rest.slice(0, 2), out: rest.slice(2) };
  }
  return res;
}

export function placeInDivision(L: League, teamId: string) {
  const t = L.teams[teamId];
  return sortedTeams(L, (x) => x.div === t.div).findIndex((x) => x.id === teamId) + 1;
}

export function leagueRank(L: League, teamId: string) {
  return sortedTeams(L, undefined, lgOf(L.teams[teamId])).findIndex((x) => x.id === teamId) + 1;
}

/** Place within the conference (used for KHL clubs, which have no divisions). */
export function placeInConference(L: League, teamId: string) {
  const t = L.teams[teamId];
  return sortedTeams(L, (x) => x.conf === t.conf, lgOf(t)).findIndex((x) => x.id === teamId) + 1;
}
