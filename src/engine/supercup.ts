// Victoria Cup: the Stanley Cup champion meets the Gagarin Cup champion. The IIHF played the
// Victoria Cup in 2008 (New York Rangers – Metallurg Mg 4:3, Bern) and 2009 (ZSC Lions – Chicago
// 2:1, Zurich); the game world revives it as an annual one-off final in a European city a few days
// before the NHL opener. One game on neutral ice: no home advantage, the same playing style for
// both sides (between the NHL and KHL styles), overtime and a shootout if needed.
import { groupByTeam, manageRoster, notifyUser } from './ai';
import { simulateMatch, type MatchBox } from './match';
import { pushMsg, pushNews, social } from './news';
import { financeBonus } from './finance';
import { isGM, LEAGUE_STYLE, proPlayer, userTeam } from './leagues';
import type { Game, League, SuperCupGame } from './types';
import { addDays, clamp } from './util';
import { unlock } from './achievements';

export const VICTORIA_VENUES = ['Берн', 'Прага', 'Хельсинки', 'Стокгольм', 'Цюрих', 'Братислава', 'Рига', 'Мангейм'];
const STYLE = { shot: (LEAGUE_STYLE.NHL.shot + LEAGUE_STYLE.KHL.shot) / 2, fin: (LEAGUE_STYLE.NHL.fin + LEAGUE_STYLE.KHL.fin) / 2 };
/** Prize money (reference): winner and runner-up. */
const PRIZE = { win: 1_000_000, lose: 400_000 };
/** Arena capacity of the host city (rounded, hockey). */
const VENUE_CAP: Record<string, number> = { Берн: 17031, Прага: 17360, Хельсинки: 15000, Стокгольм: 13850, Цюрих: 12000, Братислава: 10055, Рига: 10300, Мангейм: 13600 };

export function ensureSuperCup(L: League) {
  return (L.supercup ??= { next: null, history: [] });
}

/**
 * Called on July 1 once both champions of the finished season are known: the game is set for the
 * Saturday before the NHL opener, on a day the KHL champion has no league game.
 */
export function scheduleSuperCup(L: League) {
  const S = ensureSuperCup(L);
  const prev = L.season - 1;
  const nhl = L.history[0]?.season === prev ? L.history[0].champion : null;
  const khl = L.khl?.history[0]?.season === prev ? L.khl.history[0].champion : null;
  if (!nhl || !khl || !L.teams[nhl] || !L.teams[khl]) return;
  let day = addDays(L.seasonStart, -3);
  const busy = (d: string) => L.games.some((g) => g.day === d && (g.h === khl || g.a === khl || g.h === nhl || g.a === nhl));
  for (let i = 0; i < 6 && busy(day); i++) day = addDays(day, -1);
  const venue = VICTORIA_VENUES[(L.season - 2027 + VICTORIA_VENUES.length * 10) % VICTORIA_VENUES.length];
  S.next = { season: L.season, day, nhl, khl, venue };
  pushNews(L, {
    kind: 'league',
    title: `Кубок Виктории ${L.season}: ${L.teams[nhl].name} — ${L.teams[khl].name}`,
    body: `Обладатели Кубка Стэнли и Кубка Гагарина сыграют ${dayRu(day)} в городе ${venue}. Один матч на нейтральном льду.`,
    important: true,
  });
  const ut = userTeam(L);
  if (ut === nhl || ut === khl) {
    pushMsg(L, {
      from: 'IIHF', kind: 'league',
      title: 'Приглашение на Кубок Виктории',
      body: `Как чемпион вы сыграете за Кубок Виктории против ${L.teams[ut === nhl ? khl : nhl].name}: ${dayRu(day)}, ${venue}. Один матч, нейтральный лёд, при ничьей — овертайм и буллиты. Призовые: ${PRIZE.win / 1e6}M победителю.`,
    });
  }
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayRu = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** Plays the cup game if it is scheduled today. Returns the game and its box score. */
export function superCupToday(L: League): { game: Game; box: MatchBox } | null {
  const S = L.supercup;
  const n = S?.next;
  if (!S || !n) return null;
  const ut = userTeam(L);
  if (n.day === addDays(L.date, 1) && (ut === n.nhl || ut === n.khl)) L.stops.push('victoria-eve');
  if (n.day !== L.date) return null;
  const H = L.teams[n.nhl], A = L.teams[n.khl];
  if (!H || !A) { S.next = null; return null; }
  const byTeam = groupByTeam(L);
  for (const t of [H, A]) {
    const notes = manageRoster(L, t, byTeam.get(t.id) ?? [], t.id === L.user);
    if (t.id === L.user) notifyUser(L, notes);
  }
  const mine = ut === n.nhl || ut === n.khl;
  const box = simulateMatch(L, H, A, { playoff: false, neutral: true, style: STYLE, detail: mine, goalieHome: H.lines.g[0], goalieAway: A.lines.g[0] });
  const r = box.result;
  const att = Math.round((VENUE_CAP[n.venue] ?? 12000) * clamp(0.9 + (H.fans + A.fans) / 1000, 0.85, 1));
  const game: Game = { id: L.nextGameId++, day: L.date, h: n.nhl, a: n.khl, played: true, hs: r.hs, as: r.as, ot: r.ot, shH: r.shH, shA: r.shA, stars: r.stars, cup: 'victoria', att };
  L.games.push(game);
  H.lastGame = A.lastGame = L.date;
  const winner = r.hs > r.as ? n.nhl : n.khl;
  const mvp = r.stars.find((id) => L.players[id]?.team === winner) ?? r.stars[0];
  Object.assign(n, { hs: r.hs, as: r.as, ot: r.ot, winner, mvp, gameId: game.id, att });
  S.history.unshift({ ...n });
  S.next = null;
  const W = L.teams[winner];
  W.vc = (W.vc ?? 0) + 1;
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === winner && p.st === 'NHL') p.awards.push(`vc:${n.season}`);
  }
  const m = mvp ? L.players[mvp] : null;
  if (m) m.awards.push(`vc-mvp:${n.season}`);
  const score = `${r.hs}:${r.as}${r.ot ? ` ${r.ot}` : ''}`;
  pushNews(L, {
    kind: 'league', important: true, team: winner,
    title: `🏆 ${W.name} — обладатели Кубка Виктории ${n.season}!`,
    body: `${H.name} — ${A.name} ${score} (${n.venue}, ${att.toLocaleString('ru-RU')} зрителей).${m ? ` Лучший игрок — ${m.fn} ${m.ln}.` : ''}`,
    players: m ? [m.id] : undefined,
  });
  if (mine) {
    const won = ut === winner;
    if (isGM(L)) {
      financeBonus(L, won ? PRIZE.win : PRIZE.lose);
      const t = L.teams[L.user];
      t.fans = clamp(t.fans + (won ? 5 : -2), 0, 100);
      if (won) {
        L.owner.trust = clamp(L.owner.trust + 4, 0, 100);
        L.gm.rep = clamp(L.gm.rep + 3, 0, 100);
        unlock(L, 'victoria');
      }
    } else if (won && proPlayer(L)?.team === winner) unlock(L, 'pro_victoria');
    social(L, won ? `${W.short} — лучшая команда планеты! Кубок Виктории наш 🌍🏆` : `Обидно: ${L.teams[ut!].short} уступают в Кубке Виктории. ${W.short} сильнее в этот вечер`, { kind: 'fan', team: ut ?? undefined });
    L.stops.push('victoria');
  }
  return { game, box };
}

/** Upcoming cup game for the user's club (shown on the office screen). */
export function userSuperCup(L: League): SuperCupGame | null {
  const n = L.supercup?.next;
  const ut = userTeam(L);
  return n && ut && (n.nhl === ut || n.khl === ut) ? n : null;
}
