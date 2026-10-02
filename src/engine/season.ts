import { aiPromote, groupByTeam, manageRoster, notifyUser, updateStrategies } from './ai';
import { simulateMatch, type MatchBox } from './match';
import { pushMsg, pushNews, social } from './news';
import { onPlayoffGame, startPlayoffs } from './playoffs';
import { getState, next, useState_ } from './rng';
import { compareTeams, emptyRecord, sortedTeams } from './standings';
import { line, statKey } from './stats';
import type { Game, GoalieLine, League, SkaterLine, Team } from './types';
import { addDays, clamp } from './util';
import { offseasonDaily } from './offseason';
import { weeklyScouting } from './draft';
import { weeklyTradeActivity } from './trades';
import { weeklyMorale, checkMilestones } from './events';

export interface DayReport {
  date: string;
  games: Game[];
  userGame?: { game: Game; box: MatchBox };
}

/** Last user game box, kept in memory for the match center (not saved). */
export let lastUserBox: { game: Game; box: MatchBox } | null = null;

export function setDetail(v: boolean) {
  detailUserGames = v;
}
let detailUserGames = true;

function teamPlayedYesterday(t: Team, date: string) {
  return t.lastGame === addDays(date, -1);
}

function chooseGoalie(L: League, t: Team, b2b: boolean, playoff: boolean): number | undefined {
  const [g1, g2] = t.lines.g;
  if (!g2) return g1;
  if (playoff) return g1;
  const starter = L.players[g1];
  const backup = L.players[g2];
  // Starters play ~62 of 84; back-to-backs usually go to the backup.
  let pStart = b2b ? 0.15 : 0.82;
  if (backup.ovr > starter.ovr) pStart = 0.4;
  return next() < pStart ? g1 : g2;
}

export function playGame(L: League, g: Game): MatchBox {
  const H = L.teams[g.h], A = L.teams[g.a];
  const playoff = !!g.series;
  const b2bH = teamPlayedYesterday(H, g.day), b2bA = teamPlayedYesterday(A, g.day);
  const isUser = g.h === L.user || g.a === L.user;
  const box = simulateMatch(L, H, A, {
    playoff,
    detail: isUser && detailUserGames,
    b2bHome: b2bH,
    b2bAway: b2bA,
    goalieHome: chooseGoalie(L, H, b2bH, playoff),
    goalieAway: chooseGoalie(L, A, b2bA, playoff),
  });
  applyGame(L, g, box);
  if (isUser) {
    lastUserBox = { game: g, box };
    L.lastUserGame = g.id;
  }
  return box;
}

function applyGame(L: League, g: Game, box: MatchBox) {
  const r = box.result;
  const playoff = !!g.series;
  g.played = true;
  g.hs = r.hs; g.as = r.as; g.ot = r.ot; g.shH = r.shH; g.shA = r.shA; g.stars = r.stars;
  const H = L.teams[g.h], A = L.teams[g.a];
  H.lastGame = g.day; A.lastGame = g.day;
  const key = statKey(L.season, playoff);

  if (!playoff) {
    const upd = (t: Team, gf: number, ga: number, home: boolean, pp: [number, number], ppAgainst: [number, number], sf: number, sa: number) => {
      const rec = t.rec;
      rec.gp++; rec.gf += gf; rec.ga += ga; rec.sf += sf; rec.sa += sa;
      rec.ppg += pp[0]; rec.ppo += pp[1]; rec.pkga += ppAgainst[0]; rec.pko += ppAgainst[1];
      const win = gf > ga;
      let res: 'W' | 'L' | 'O';
      if (win) {
        rec.w++; rec.pts += 2; res = 'W';
        if (!r.ot) rec.rw++;
        if (r.ot !== 'SO') rec.row++;
        if (home) rec.hw++;
      } else if (r.ot) {
        rec.otl++; rec.pts += 1; res = 'O';
        if (home) rec.hotl++;
      } else {
        rec.l++; res = 'L';
        if (home) rec.hl++;
      }
      rec.l10.push(res);
      if (rec.l10.length > 10) rec.l10.shift();
      const sk = res === 'W' ? 'W' : res === 'L' ? 'L' : 'OT';
      const m = rec.streak.match(/^(W|L|OT)(\d+)$/);
      rec.streak = m && m[1] === sk ? `${sk}${Number(m[2]) + 1}` : `${sk}1`;
    };
    upd(H, r.hs, r.as, true, r.ppH, r.ppA, r.shH, r.shA);
    upd(A, r.as, r.hs, false, r.ppA, r.ppH, r.shA, r.shH);
  }

  // Skater stats
  for (const s of box.skaters) {
    const l = line(s.p, key) as SkaterLine;
    l.gp++; l.g += s.g; l.a += s.a; l.pts += s.g + s.a; l.pm += s.pm; l.pim += s.pim; l.sog += s.sog;
    l.ppg += s.ppg; l.ppp += s.ppp; l.toi += s.toi; l.hits += s.hits; l.blk += s.blk;
    if (box.gwg === s.id) l.gwg++;
    // Form: performance vs. expectation, slow-moving
    const exp = Math.max(0, (s.p.ovr - 60) / 45);
    const perf = s.g + 0.7 * s.a + 0.12 * s.sog + 0.25 * s.pm - exp;
    s.p.form = clamp(s.p.form * 0.88 + perf * 0.08, -1, 1);
    if (s.p.susp && s.p.susp > 0) s.p.susp--;
    if (s.g >= 3) {
      pushNews(L, { kind: 'game', title: `Хет-трик! ${s.p.fn} ${s.p.ln} (${s.p.team})`, players: [s.id], team: s.p.team ?? undefined });
      if (s.p.team === L.user) social(L, `🎩🎩🎩 ${s.p.ln} оформляет хет-трик! Шляпы летят на лёд`, { kind: 'fan', team: L.user, players: [s.id] });
    }
  }
  // Goalies
  for (const [side, opp, won] of [[box.home, box.away, r.hs > r.as], [box.away, box.home, r.as > r.hs]] as const) {
    const gp = side.goalie;
    const l = line(gp, key) as GoalieLine;
    l.gp++; l.gs++; l.sa += opp.shots; l.ga += opp.score - (r.ot === 'SO' ? (won ? 0 : 1) : 0);
    l.toi += 3600 + (r.ot === 'OT' ? 300 : 0);
    if (won) l.w++;
    else if (r.ot && !playoff) l.otl++;
    else l.l++;
    const allowed = opp.score - (r.ot === 'SO' && !won ? 1 : 0);
    if (allowed === 0 && won) {
      l.so++;
      if (gp.team === L.user) pushNews(L, { kind: 'game', title: `«Сухарь» ${gp.fn} ${gp.ln}: ${opp.shots} сейвов`, players: [gp.id], team: L.user });
    }
    const svp = opp.shots ? (opp.shots - allowed) / opp.shots : 1;
    gp.form = clamp(gp.form * 0.85 + (svp - 0.9) * 2.2, -1, 1);
  }

  // Injuries
  for (const inj of r.injuries) {
    const p = L.players[inj.id];
    if (!p || p.inj) continue;
    const med = p.team ? L.teams[p.team]?.staff.med ?? 2 : 2;
    const days = Math.max(1, Math.round(inj.days * (1.15 - med * 0.075)));
    p.inj = { type: inj.type, days, total: days };
    if (p.team === L.user) {
      const long = days >= 7;
      pushMsg(L, {
        from: 'Медицинский штаб', kind: 'staff',
        title: `Травма: ${p.fn} ${p.ln}`,
        body: `${inj.type}. Ориентировочно ${days <= 2 ? 'день-два' : days <= 7 ? 'до недели' : days < 30 ? `${Math.round(days / 7)} нед.` : `${Math.round(days / 30)} мес.`}${days > 60 ? '. Возможно, до конца сезона.' : '.'}`,
        ref: { type: 'player', id: p.id },
      });
      if (long && p.ovr >= 78) L.stops.push('injury');
    } else if (days >= 30 && p.ovr >= 84) {
      pushNews(L, { kind: 'injury', title: `${p.fn} ${p.ln} (${p.team}) выбыл на ${Math.round(days / 7)} нед.`, players: [p.id], team: p.team ?? undefined });
    }
  }

  // Rare fights / suspensions (flavour, affects availability)
  if (next() < 0.006) {
    const s = box.skaters[Math.floor(next() * box.skaters.length)];
    if (s.p.r && (s.p.r as { ph: number }).ph >= 75) {
      const games = 1 + Math.floor(next() * 4);
      s.p.susp = (s.p.susp ?? 0) + games;
      pushNews(L, { kind: 'suspension', title: `Дисквалификация: ${s.p.fn} ${s.p.ln} (${s.p.team}) — ${games} матч(а) за опасный удар`, players: [s.id], team: s.p.team ?? undefined });
      if (s.p.team === L.user) pushMsg(L, { from: 'Департамент безопасности игроков', kind: 'league', title: `${s.p.ln} дисквалифицирован`, body: `${games} матч(а) за опасный удар. Игрок пропустит эти игры.` });
    }
  }

  if (g.h === L.user || g.a === L.user) {
    const won = (g.h === L.user ? r.hs > r.as : r.as > r.hs);
    if (won) L.seasonLog.userGames.w++;
    else L.seasonLog.userGames.l++;
    const t = L.teams[L.user];
    t.fans = clamp(t.fans + (won ? 0.6 : -0.6) * (playoff ? 3 : 1), 0, 100);
  }

  checkMilestones(L, box);
  if (playoff) {
    const res = onPlayoffGame(L, g);
    if (res === 'final') L.stops.push('cup');
  }
}

function tickInjuries(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.inj) continue;
    p.inj.days--;
    if (p.inj.days <= 0) {
      p.inj = null;
      if (p.team === L.user && p.st === 'NHL') pushMsg(L, { from: 'Медицинский штаб', kind: 'staff', title: `${p.fn} ${p.ln} здоров`, body: 'Игрок полностью готов и может вернуться в состав.' });
    }
  }
}

/** Advances the league by one day. */
export function advanceDay(L: League): DayReport {
  useState_(L.rng);
  const date = L.date;
  const report: DayReport = { date, games: [] };

  if (L.phase === 'preseason' && date >= L.seasonStart) {
    L.phase = 'regular';
    for (const t of Object.values(L.teams)) t.rec = emptyRecord();
    pushNews(L, { kind: 'league', title: 'Регулярный сезон начался!' });
  }

  if (L.phase === 'regular' || L.phase === 'playoffs') {
    if (date === addDays(L.deadline, -1) && L.phase === 'regular') {
      pushMsg(L, { from: 'Ассистент GM', kind: 'staff', title: 'Завтра дедлайн обменов', body: 'Это последний шанс усилить состав (или распродать активы) до конца сезона. После дедлайна обмены закрыты до окончания плей-офф.' });
      L.stops.push('deadline');
    }
    const byTeam = groupByTeam(L);
    const todays = L.games.filter((g) => g.day === date && !g.played);
    // Rosters must be valid before games
    const playing = new Set<string>();
    for (const g of todays) { playing.add(g.h); playing.add(g.a); }
    for (const tid of playing) {
      const t = L.teams[tid];
      const notes = manageRoster(L, t, byTeam.get(tid) ?? [], tid === L.user);
      if (tid === L.user) notifyUser(L, notes);
    }
    for (const g of todays) {
      const box = playGame(L, g);
      report.games.push(g);
      if (g.h === L.user || g.a === L.user) report.userGame = { game: g, box };
    }
    if (L.phase === 'regular' && L.games.every((g) => g.series || g.played)) {
      // Regular season over
      endRegularSeason(L);
      startPlayoffs(L, addDays(date, 3));
    }
  }

  tickInjuries(L);

  // Weekly routines (Mondays)
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  if (dow === 1) {
    weeklyMorale(L);
    weeklyScouting(L);
    if (L.phase === 'regular') {
      const byTeam = groupByTeam(L);
      for (const t of Object.values(L.teams)) if (t.id !== L.user) aiPromote(L, byTeam.get(t.id) ?? []);
      updateStrategies(L);
      weeklyTradeActivity(L);
    }
  }

  offseasonDaily(L);

  L.date = addDays(date, 1);
  L.rng = getState();
  return report;
}

function endRegularSeason(L: League) {
  const st = sortedTeams(L);
  const pres = st[0];
  pushNews(L, { kind: 'award', title: `Президентский кубок — ${pres.name} (${pres.rec.pts} очков)`, team: pres.id, important: true });
  L.stops.push('regular-end');
}

export function userGameToday(L: League) {
  return L.games.find((g) => g.day === L.date && !g.played && (g.h === L.user || g.a === L.user));
}

export function nextUserGame(L: League) {
  return L.games.filter((g) => !g.played && (g.h === L.user || g.a === L.user)).sort((a, b) => (a.day < b.day ? -1 : 1))[0];
}

export function teamGames(L: League, team: string) {
  return L.games.filter((g) => g.h === team || g.a === team);
}

export { compareTeams };
