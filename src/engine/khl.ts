// KHL: the second club league of the world. 22 clubs (2026-27), 68-game regular season
// (Sep 5 – Mar 20), 16-team playoffs: round 1 inside the conferences (1–8, 2–7, 3–6, 4–5), then
// re-seeding by the overall regular-season table at every stage; best-of-7, 2-2-1-1-1; Gagarin Cup.
// The same match engine plays KHL games; rosters are fictional (see docs/PLAN.md).
import { COACH_FIRST, COACH_LAST, type Country } from './names';
import { genPlayer } from './gen';
import { int, next, normal, pick, shuffle, weighted } from './rng';
import { emptyRecord, sortedTeams } from './standings';
import { autoLines, emptyLines } from './lines';
import { capHit, capIn, contractCount, floorIn, marketValueIn, roundSalary } from './contracts';
import { pushMsg, pushNews, social } from './news';
import { statKey } from './stats';
import type { Game, League, Player, PlayoffSeries, SkaterLine, Team } from './types';
import { addDays, ageOn, clamp } from './util';
import { isKhlGM, leagueTeams, userLg } from './leagues';
import { evaluateSeason, ownerReact } from './owner';
import { checkAchievements } from './achievements';
import { KHL_CHAMPION_2026, KHL_CLUBS, KHL_GAMES, type KhlClub } from './khlData';

const KHL_POS_F: Player['pos'][] = ['C', 'L', 'R'];

function nationFor(c: KhlClub, foreignLeft: { n: number }): Country {
  if (c.home === 'BLR') return weighted<Country>(['BLR', 'RUS', 'CAN', 'LVA'], [0.62, 0.3, 0.05, 0.03]);
  if (c.home === 'KAZ') return weighted<Country>(['KAZ', 'RUS', 'CAN', 'USA'], [0.55, 0.37, 0.05, 0.03]);
  if (c.home === null) return weighted<Country>(['RUS', 'CAN', 'USA', 'FIN', 'SWE'], [0.66, 0.14, 0.1, 0.05, 0.05]);
  if (foreignLeft.n > 0 && next() < 0.16) {
    foreignLeft.n--;
    return weighted<Country>(['CAN', 'USA', 'BLR', 'FIN', 'SWE', 'KAZ', 'CZE', 'SVK', 'LVA'], [0.3, 0.2, 0.14, 0.09, 0.08, 0.06, 0.05, 0.04, 0.04]);
  }
  return 'RUS';
}

function khlContract(L: League, p: Player, years?: number) {
  const a = ageOn(p.bd, L.date);
  const y = years ?? (a <= 22 ? int(2, 3) : a >= 32 ? 1 : int(1, 3));
  const aav = roundSalary(marketValueIn(L, p, 'KHL', L.season) * (0.85 + next() * 0.3), 'KHL');
  p.c = { aav, last: L.season + y - 1, type: 'STD', clause: null, exp: ageOn(p.bd, `${L.season + y}-07-01`) >= 27 ? 'UFA' : 'RFA', signed: L.season - (y > 1 ? int(0, 1) : 0) };
}

/** Builds a fictional roster: 23 on the main roster (13 F, 7 D, 3 G) and 11 in the VHL farm. */
function generateRoster(L: League, c: KhlClub) {
  const τ = c.tier;
  const foreign = { n: c.home === 'RUS' ? int(2, 5) : 0 };
  const mk = (pos: Player['pos'], ovr: number, main: boolean, young = false) => {
    const age = young ? int(18, 21) : clamp(Math.round(normal(main ? 28 : 23, main ? 4 : 3)), main ? 20 : 18, main ? 37 : 30);
    let pot = ovr;
    if (age <= 20) pot += 5 + next() * 15;
    else if (age <= 23) pot += 2 + next() * 8;
    else if (age <= 25) pot += next() * 3;
    const p = genPlayer(L, { pos, age, country: nationFor(c, foreign), ovr: clamp(ovr + (age <= 21 ? -2 : 0), 45, 84), pot, league: 'KHL', status: main ? 'NHL' : 'AHL', team: c.id });
    // Young players of a KHL club enter the NHL draft in the year they turn 18.
    const by = Number(p.bd.slice(0, 4));
    if (age <= 18) p.dy = Math.max(L.season + 1, by + 18);
    khlContract(L, p);
    return p;
  };
  // Each club has one or two stars (many of them ex-NHL players), then a flatter depth chart.
  const star = [3.5, 2, 0.8];
  for (let i = 0; i < 13; i++) mk(i < 4 ? 'C' : pick(KHL_POS_F), 73.5 + 5 * τ - i * 0.8 + (star[i] ?? 0) + normal(0, 1.2), true);
  for (let i = 0; i < 7; i++) mk('D', 71.5 + 5 * τ - i * 0.95 + normal(0, 1.2), true);
  mk('G', 73 + 6 * τ + normal(0, 1), true);
  mk('G', 67 + 3 * τ + normal(0, 1.5), true);
  mk('G', 61 + normal(0, 2), true, next() < 0.5);
  for (let i = 0; i < 6; i++) mk(pick(KHL_POS_F), 59 + 3 * τ + normal(0, 2.5), false, i < 3);
  for (let i = 0; i < 4; i++) mk('D', 58 + 3 * τ + normal(0, 2.5), false, i < 2);
  mk('G', 56 + normal(0, 2), false, true);
}

/** Keeps the payroll between the floor and the cap (clubs negotiated within the rules). */
function fitPayroll(L: League, team: string) {
  const cap = capIn(L, 'KHL'), floor = floorIn(L, 'KHL');
  const hit = capHit(L, team);
  const target = clamp(hit, floor * 1.04, cap * 0.96);
  if (Math.abs(target - hit) < 1000) return;
  const k = target / hit;
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === team && p.c) p.c.aav = roundSalary(p.c.aav * k, 'KHL');
  }
}

export function initKhl(L: League, firstStart: string) {
  for (const c of KHL_CLUBS) {
    const t: Team = {
      id: c.id, lg: 'KHL', name: c.name, city: c.city, short: c.short, conf: c.conf, div: 'X',
      primary: c.primary, secondary: c.secondary, accent: c.accent,
      taxFree: false, canada: false, bigMarket: c.bigMarket,
      last: null,
      lines: emptyLines(),
      rec: emptyRecord(),
      strategy: 'bubble',
      coach: { name: `${pick(COACH_FIRST)} ${pick(COACH_LAST)}`, rating: c.coach, style: pick(['offense', 'defense', 'balanced', 'development'] as const), age: int(40, 64), salary: int(5, 20) * 10_000 },
      fans: 60,
      rel: 50,
      staff: { med: 2, analytics: 2, scouting: 2 },
      captain: null,
      alts: [],
      cups: KHL_CUPS[c.id] ?? 0,
      retired: [],
      budget: 100,
    };
    L.teams[c.id] = t;
    generateRoster(L, c);
    fitPayroll(L, c.id);
  }
  L.khl = { phase: 'preseason', seasonStart: firstStart, regularEnd: firstStart, deadline: `${L.season + 1}-01-25`, playoffs: null, champion: KHL_CHAMPION_2026, history: [] };
  scheduleKhl(L, firstStart, `${L.season + 1}-03-20`);
}

/** Gagarin Cups won through 2025-26 (2020 was not awarded). */
const KHL_CUPS: Record<string, number> = { AKB: 3, CSK: 3, MMG: 3, DMS: 2, SKA: 2, LOK: 2, SYU: 1, AVG: 1 };

/** Next season's schedule (called on July 1 together with the NHL schedule). */
export function buildKhlSeason(L: League) {
  let start = `${L.season}-09-03`;
  // Opening night on the first Friday or Saturday from September 3 (2026-27 opened on Sep 5).
  while (![5, 6].includes(new Date(start + 'T12:00:00Z').getUTCDay())) start = addDays(start, 1);
  // Careers saved before the KHL existed: the league is founded for the new season.
  if (!L.khl) {
    initKhl(L, start);
    pushNews(L, { kind: 'league', important: true, title: 'КХЛ в игре: 22 клуба начинают сезон', body: 'Теперь в мире игры есть Континентальная хоккейная лига — с календарём, плей-офф и Кубком Гагарина.' });
    return;
  }
  L.khl.phase = 'preseason';
  L.khl.seasonStart = start;
  L.khl.deadline = `${L.season + 1}-01-25`;
  L.khl.playoffs = null;
  scheduleKhl(L, start, `${L.season + 1}-03-20`);
}

/**
 * 68 games per club: home and away against everyone (42), home and away again inside the
 * conference (20) and six extra games (3 home, 3 away) against rotating opponents.
 */
function scheduleKhl(L: League, start: string, end: string) {
  const ids = KHL_CLUBS.map((c) => c.id).filter((id) => L.teams[id]);
  const conf = (id: string) => L.teams[id].conf;
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      pairs.push([a, b], [b, a]);
      if (conf(a) === conf(b)) pairs.push([a, b], [b, a]);
    }
  }
  // Extra games: circle-method rounds give perfect matchings; alternate home and away.
  const order = shuffle([...ids]);
  const n = order.length;
  const extraRounds = shuffle(Array.from({ length: n - 1 }, (_, r) => r)).slice(0, KHL_GAMES - 2 * (n - 1) - 2 * (n / 2 - 1));
  extraRounds.forEach((r, k) => {
    const rot = [order[0], ...order.slice(1).map((_, i) => order[1 + ((i + r) % (n - 1))])];
    for (let i = 0; i < n / 2; i++) {
      const a = rot[i], b = rot[n - 1 - i];
      pairs.push(k % 2 === 0 ? [a, b] : [b, a]);
    }
  });
  const games = assignDays(shuffle(pairs), start, end);
  L.games = L.games.filter((g) => g.lg !== 'KHL');
  for (const [day, h, a] of games) L.games.push({ id: L.nextGameId++, lg: 'KHL', day, h, a });
  L.games.sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : x.id - y.id));
  L.khl!.regularEnd = games.reduce((m, g) => (g[0] > m ? g[0] : m), start);
}

/** Spreads games over the calendar: teams rest at least a day between games where possible. */
function assignDays(pairs: [string, string][], start: string, end: string): [string, string, string][] {
  const out: [string, string, string][] = [];
  const left = [...pairs];
  const last: Record<string, number> = {};
  const rem: Record<string, number> = {};
  for (const [h, a] of left) { rem[h] = (rem[h] ?? 0) + 1; rem[a] = (rem[a] ?? 0) + 1; }
  const totalDays = Math.max(30, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  let d = 0;
  while (left.length && d < totalDays + 120) {
    const day = addDays(start, d);
    // Aim to finish two days early so the calendar never spills past the last date.
    const daysLeft = Math.max(1, totalDays - d - 2);
    const quota = Math.max(1, Math.min(11, Math.round(left.length / daysLeft + normal(0, 1))));
    const busy = new Set<string>();
    // Clubs with many games left go first, so nobody piles up games at the end.
    left.sort((x, y) => rem[y[0]] + rem[y[1]] - rem[x[0]] - rem[x[1]] + (next() - 0.5) * 3);
    const strict = d < totalDays - 6;
    for (let i = 0; i < left.length && busy.size / 2 < quota; i++) {
      const [h, a] = left[i];
      if (busy.has(h) || busy.has(a)) continue;
      const rested = (t: string) => last[t] == null || d - last[t] >= 2;
      if (strict && (!rested(h) || !rested(a))) continue;
      busy.add(h); busy.add(a);
      last[h] = last[a] = d;
      rem[h]--; rem[a]--;
      out.push([day, h, a]);
      left.splice(i, 1);
      i--;
    }
    d++;
  }
  return out;
}

/** Today's unplayed KHL games. */
export const khlGamesToday = (L: League) => L.games.filter((g) => g.lg === 'KHL' && g.day === L.date && !g.played);

/** KHL phase changes for the current day (called before games are played). */
export function khlPhaseTick(L: League) {
  const K = L.khl;
  if (!K) return;
  if (K.phase === 'preseason' && L.date >= K.seasonStart) {
    K.phase = 'regular';
    for (const t of leagueTeams(L, 'KHL')) t.rec = emptyRecord();
    pushNews(L, { kind: 'league', title: 'Стартовал регулярный чемпионат КХЛ', body: `Действующий обладатель Кубка Гагарина — ${L.teams[K.champion]?.name ?? K.champion}.` });
  }
  if (K.phase === 'regular' && L.date === addDays(K.deadline, -1) && isKhlGM(L)) {
    pushMsg(L, { from: 'Ассистент GM', kind: 'staff', title: 'Завтра дедлайн обменов КХЛ', body: 'После 25 января переходы между клубами закрыты до конца сезона.' });
    L.stops.push('deadline');
  }
}

/** Called after the day's KHL games: end of the regular season, playoff progress. */
export function khlAfterGames(L: League) {
  const K = L.khl;
  if (!K) return;
  if (K.phase === 'regular' && !L.games.some((g) => g.lg === 'KHL' && !g.played && !g.series)) {
    const st = sortedTeams(L, undefined, 'KHL');
    pushNews(L, { kind: 'league', title: `${st[0].name} — победитель регулярного чемпионата КХЛ (${st[0].rec.pts} очков)`, team: st[0].id, important: true });
    if (isKhlGM(L)) L.stops.push('regular-end');
    startKhlPlayoffs(L, maxDay(addDays(L.date, 3), `${L.season + 1}-03-23`));
  }
}

const maxDay = (a: string, b: string) => (a > b ? a : b);

function startKhlPlayoffs(L: League, day: string) {
  const K = L.khl!;
  const series: PlayoffSeries[] = [];
  for (const conf of ['W', 'E'] as const) {
    const seeds = sortedTeams(L, (t) => t.conf === conf, 'KHL').slice(0, 8);
    for (let i = 0; i < 4; i++) {
      series.push({ id: `K1${conf}${i + 1}`, round: 1, conf, hi: seeds[i].id, lo: seeds[7 - i].id, wHi: 0, wLo: 0, games: [] });
    }
  }
  K.playoffs = { season: L.season, series, round: 1 };
  K.phase = 'playoffs';
  for (const s of series) scheduleKhlGame(L, s, day);
  pushNews(L, { kind: 'league', title: 'Стартует розыгрыш Кубка Гагарина', body: series.map((s) => `${L.teams[s.hi].short} — ${L.teams[s.lo].short}`).join('\n'), important: true });
  const u = L.user;
  if (isKhlGM(L)) {
    if (series.some((s) => s.hi === u || s.lo === u)) pushMsg(L, { from: `${L.owner.name}, владелец`, kind: 'owner', title: 'Мы в плей-офф', body: 'Отличная работа. Теперь начинается борьба за Кубок Гагарина.' });
    else social(L, `${L.teams[u].short} не попадают в плей-офф КХЛ. Болельщики требуют ответов`, { kind: 'fan', team: u });
    L.stops.push('playoffs');
  }
}

const HOME_PATTERN = [true, true, false, false, true, false, true];

function scheduleKhlGame(L: League, s: PlayoffSeries, day: string) {
  const hiHome = HOME_PATTERN[s.wHi + s.wLo];
  const g: Game = { id: L.nextGameId++, lg: 'KHL', day, h: hiHome ? s.hi : s.lo, a: hiHome ? s.lo : s.hi, series: s.id };
  L.games.push(g);
  s.games.push(g.id);
}

/** Overall regular-season rank (1 = best), used for re-seeding from round 2. */
function overallRank(L: League) {
  const r: Record<string, number> = {};
  sortedTeams(L, undefined, 'KHL').forEach((t, i) => (r[t.id] = i + 1));
  return r;
}

export function onKhlPlayoffGame(L: League, g: Game) {
  const po = L.khl!.playoffs!;
  const s = po.series.find((x) => x.id === g.series)!;
  const winner = (g.hs ?? 0) > (g.as ?? 0) ? g.h : g.a;
  if (winner === s.hi) s.wHi++;
  else s.wLo++;
  if (s.wHi < 4 && s.wLo < 4) {
    scheduleKhlGame(L, s, addDays(g.day, 2));
    return;
  }
  s.winner = s.wHi === 4 ? s.hi : s.lo;
  const loser = s.winner === s.hi ? s.lo : s.hi;
  const score = `${Math.max(s.wHi, s.wLo)}–${Math.min(s.wHi, s.wLo)}`;
  if (s.round === 4) {
    po.champion = s.winner;
    khlSeasonEnd(L, s.winner, loser, score);
    return;
  }
  pushNews(L, { kind: 'league', title: `КХЛ: ${L.teams[s.winner].name} проходят ${L.teams[loser].short} (${score})`, team: s.winner });
  if (isKhlGM(L)) {
    if (loser === L.user) L.stops.push('eliminated');
    if (s.winner === L.user) L.stops.push('series-won');
  }
  const round = po.series.filter((x) => x.round === s.round);
  if (!round.every((x) => x.winner)) return;
  // Re-seeding by the overall regular-season table.
  const rank = overallRank(L);
  const alive = round.map((x) => x.winner!).sort((a, b) => rank[a] - rank[b]);
  const r = s.round + 1;
  const created: PlayoffSeries[] = [];
  for (let i = 0; i < alive.length / 2; i++) {
    created.push({ id: `K${r}-${i + 1}`, round: r, conf: 'F', hi: alive[i], lo: alive[alive.length - 1 - i], wHi: 0, wLo: 0, games: [] });
  }
  po.series.push(...created);
  po.round = r;
  for (const x of created) scheduleKhlGame(L, x, addDays(g.day, 2));
  const names = ['', '', 'Второй раунд', 'Полуфинал', 'Финал Кубка Гагарина'];
  pushNews(L, { kind: 'league', title: `КХЛ, ${names[r]}: ${created.map((x) => `${L.teams[x.hi].short}–${L.teams[x.lo].short}`).join(', ')}`, important: r === 4 });
}

/** 0 = missed, 1..4 = round lost in, 5 = champion. */
export function khlPlayoffResult(L: League, team: string) {
  const po = L.khl?.playoffs;
  if (!po) return 0;
  if (po.champion === team) return 5;
  let r = 0;
  for (const s of po.series) if (s.hi === team || s.lo === team) r = Math.max(r, s.round);
  return r;
}

function khlSeasonEnd(L: League, champ: string, finalist: string, score: string) {
  const K = L.khl!;
  const ct = L.teams[champ];
  ct.cups++;
  K.champion = champ;
  K.phase = 'offseason';
  pushNews(L, { kind: 'league', title: `🏆 ${ct.name} — обладатели Кубка Гагарина ${L.season + 1}!`, body: `В финале обыграны ${L.teams[finalist].name} (${score}).`, team: champ, important: true });
  // Playoff MVP among the finalists; top scorer of the regular season.
  const pk = statKey(L.season, true, 'KHL'), rk = statKey(L.season, false, 'KHL');
  let mvp: Player | null = null, mv = -1, top: Player | null = null, tv = -1;
  for (const id in L.players) {
    const p = L.players[id];
    const r = p.stats[rk] as SkaterLine | undefined;
    if (r && p.pos !== 'G' && r.pts > tv) { tv = r.pts; top = p; }
    if (p.team !== champ && p.team !== finalist) continue;
    const st = p.stats[pk];
    if (!st) continue;
    const v = p.pos === 'G'
      ? ('sa' in st && st.sa ? ((st.sa - st.ga) / st.sa - 0.9) * 600 + st.w * 1.5 : 0)
      : (st as SkaterLine).pts * 1.2 + (st as SkaterLine).g * 0.4;
    const vv = v * (p.team === champ ? 1 : 0.7);
    if (vv > mv) { mv = vv; mvp = p; }
  }
  if (mvp) {
    mvp.awards.push(`khl-mvp:${L.season}`);
    pushNews(L, { kind: 'award', title: `Самый ценный игрок плей-офф КХЛ — ${mvp.fn} ${mvp.ln} (${L.teams[mvp.team!]?.short})`, players: [mvp.id], team: mvp.team ?? undefined });
  }
  if (top) {
    top.awards.push(`khl-pts:${L.season}`);
    pushNews(L, { kind: 'award', title: `Лучший бомбардир КХЛ — ${top.fn} ${top.ln}: ${tv} очков`, players: [top.id], team: top.team ?? undefined });
  }
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === champ && p.stats[pk]) p.awards.push(`khl-cup:${L.season}`);
  }
  if (isKhlGM(L)) reviewKhlGM(L);
  const st = sortedTeams(L, undefined, 'KHL');
  K.history.unshift({
    season: L.season, champion: champ, finalist, regular: st[0].id,
    topScorer: top ? { id: top.id, name: `${top.fn} ${top.ln}`, pts: tv } : undefined,
    mvp: mvp?.id,
    standings: st.map((t) => ({ id: t.id, pts: t.rec.pts })),
  });
  for (const t of leagueTeams(L, 'KHL')) t.last = { w: t.rec.w, l: t.rec.l, otl: t.rec.otl, pts: t.rec.pts, gf: t.rec.gf, ga: t.rec.ga };
  L.stops.push('khl-season-end');
  if (userLg(L) === 'KHL') L.stops.push('cup');
}

const KHL_RESULT = ['не попали в плей-офф', 'вылет в 1-м раунде', 'вылет во 2-м раунде', 'полуфинал', 'финал Кубка Гагарина', 'КУБОК ГАГАРИНА'];

/** Owner's verdict on the KHL GM's season (the NHL GM is reviewed after the Stanley Cup final). */
function reviewKhlGM(L: League) {
  const ut = L.teams[L.user];
  const result = khlPlayoffResult(L, L.user);
  const delta = evaluateSeason(L, result, ut.rec.pts, ut.last?.pts ?? null);
  const resText = KHL_RESULT[result];
  L.gm.history.push({ season: L.season, team: L.user, result: resText });
  L.gm.seasons++;
  L.gm.rep = clamp(L.gm.rep + (result - 1.5) * 4, 0, 100);
  if (result === 5) {
    L.gm.cups++;
    L.stops.push('champion');
    social(L, `ЧЕМПИОНЫ! ${ut.name} выигрывают Кубок Гагарина! ${ut.city} празднует 🏆🎉`, { kind: 'fan', team: L.user });
  }
  pushMsg(L, {
    from: `${L.owner.name}, владелец`, kind: 'owner',
    title: `Итоги сезона: ${resText}`,
    body: `${delta >= 0 ? 'Я доволен' : 'Я разочарован'}. Доверие ${delta >= 0 ? '+' : ''}${delta} → ${L.owner.trust}/100.`,
  });
  checkAchievements(L);
  ownerReact(L);
}

/** Every summer each club promotes two or three juniors from its academy (MHL) to the VHL farm. */
export function khlYouthIntake(L: League) {
  for (const c of KHL_CLUBS) {
    if (!L.teams[c.id]) continue;
    const n = Math.min(int(2, 3), 50 - contractCount(L, c.id));
    for (let i = 0; i < n; i++) {
      const age = int(17, 19);
      const gem = next() < 0.08;
      const pot = clamp(62 + next() * 16 + (gem ? 10 : 0) + c.tier * 3, 55, 92);
      const ovr = clamp(pot - 14 - next() * 8, 42, 66);
      const country = (c.home ?? 'RUS') as Country;
      const p = genPlayer(L, { age, country, ovr, pot, league: 'KHL', status: 'AHL', team: c.id });
      const by = Number(p.bd.slice(0, 4));
      if (by + 18 >= L.season + 1) p.dy = by + 18;
      khlContract(L, p, 3);
    }
  }
}

/** Pre-season: KHL clubs set their lines like NHL clubs (used at world creation). */
export function khlLines(L: League) {
  for (const t of leagueTeams(L, 'KHL')) autoLines(L, t);
}

export function khlStandings(L: League) {
  return {
    W: sortedTeams(L, (t) => t.conf === 'W', 'KHL'),
    E: sortedTeams(L, (t) => t.conf === 'E', 'KHL'),
    all: sortedTeams(L, undefined, 'KHL'),
  };
}
