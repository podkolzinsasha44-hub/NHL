// League identity helpers. The world holds NHL clubs and KHL clubs side by side in `L.teams`;
// every NHL system (standings, draft, waivers, salary cap) works on NHL clubs only, and the
// KHL runs its own calendar (see khl.ts). Teams and games without `lg` belong to the NHL.
import type { Game, League, LeagueId, Player, StatLine, Team } from './types';

export const LG_RU: Record<LeagueId, string> = { NHL: 'НХЛ', KHL: 'КХЛ' };
export const CUP_RU: Record<LeagueId, string> = { NHL: 'Кубок Стэнли', KHL: 'Кубок Гагарина' };
/** Farm league of the clubs of each league. */
export const FARM_RU: Record<LeagueId, string> = { NHL: 'АХЛ', KHL: 'ВХЛ' };

export const lgOf = (t: Team | undefined | null): LeagueId => t?.lg ?? 'NHL';
export const gameLg = (g: Game): LeagueId => g.lg ?? 'NHL';

export function teamLg(L: League, id: string | null | undefined): LeagueId | null {
  if (!id) return null;
  const t = L.teams[id];
  return t ? lgOf(t) : null;
}

export function isNhlTeam(L: League, id: string | null | undefined) {
  return teamLg(L, id) === 'NHL';
}

export function leagueTeams(L: League, lg: LeagueId = 'NHL'): Team[] {
  const out: Team[] = [];
  for (const t of Object.values(L.teams)) if (lgOf(t) === lg) out.push(t);
  return out;
}

export function leagueTeamIds(L: League, lg: LeagueId = 'NHL'): string[] {
  return leagueTeams(L, lg).map((t) => t.id);
}

/** True when the user manages a club (the default career). */
export const isGM = (L: League) => L.mode !== 'player';

/** The club the user is attached to: the managed club, or the club of the user's player. */
export function userTeam(L: League): string | null {
  if (isGM(L)) return L.user || null;
  const p = L.pro ? L.players[L.pro.pid] : null;
  return p?.team ?? null;
}

/** League the user lives in (managed club or player's club). */
export function userLg(L: League): LeagueId {
  return teamLg(L, userTeam(L)) ?? 'NHL';
}

/** Calendar phase of the user's league (the KHL has its own season). */
export function userPhase(L: League): 'preseason' | 'regular' | 'playoffs' | 'offseason' | 'draft' | 'freeagency' {
  if (userLg(L) === 'KHL' && L.khl) {
    // In summer both leagues share the July 1 market.
    if (L.khl.phase === 'offseason' && L.phase === 'freeagency') return 'freeagency';
    return L.khl.phase;
  }
  return L.phase;
}

/** Trade deadline of the user's league. */
export function userDeadline(L: League) {
  return userLg(L) === 'KHL' && L.khl ? L.khl.deadline : L.deadline;
}

/** The user is the GM of an NHL club (draft, NHL scouting and waivers matter). */
export const isNhlGM = (L: League) => isGM(L) && isNhlTeam(L, L.user);
export const isKhlGM = (L: League) => isGM(L) && teamLg(L, L.user) === 'KHL';

/** The user's own player in a player career. */
export function proPlayer(L: League): Player | null {
  return L.pro ? L.players[L.pro.pid] ?? null : null;
}

/** Stats key for club games: NHL "2026r"/"2026p", KHL "2026rK"/"2026pK". */
export function clubStatKey(season: number, playoff: boolean, lg: LeagueId = 'NHL') {
  return `${season}${playoff ? 'p' : 'r'}${lg === 'KHL' ? 'K' : ''}`;
}

/** Parses a stats key: club seasons and international tournaments ("2027wc", "2030og"). */
export function parseStatKey(k: string): { season: number; kind: 'r' | 'p' | 'wc' | 'og'; lg: LeagueId | null } | null {
  const m = k.match(/^(\d{4})(r|p|wc|og)(K?)$/);
  if (!m) return null;
  const kind = m[2] as 'r' | 'p' | 'wc' | 'og';
  return { season: Number(m[1]), kind, lg: kind === 'r' || kind === 'p' ? (m[3] ? 'KHL' : 'NHL') : null };
}

/** Club games played in a season (any league, regular season). */
export function clubGamesPlayed(p: Player, season: number) {
  let gp = 0;
  for (const lg of ['NHL', 'KHL'] as const) gp += (p.stats[clubStatKey(season, false, lg)] as StatLine | undefined)?.gp ?? 0;
  return gp;
}

/**
 * League playing style for the match engine, applied to both teams alike. The KHL is a tighter,
 * lower-scoring league than the NHL: about 2.7–2.8 goals per team per game in 2025-26
 * (e.g. Lokomotiv 185–135, Metallurg 252–184 in 68 games). Calibrated in scripts/calibrate.ts.
 */
export const LEAGUE_STYLE: Record<LeagueId, { shot: number; fin: number }> = {
  NHL: { shot: 1, fin: 1 },
  KHL: { shot: 0.95, fin: 0.85 },
};

/** Fixed exchange rate used to show KHL money in roubles (reference value, not market data). */
export const RUB_PER_USD = 85;

/** Russian clubs may dress at most 5 foreign players; who counts as "foreign" depends on the club. */
export const KHL_FOREIGN_LIMIT = 5;
