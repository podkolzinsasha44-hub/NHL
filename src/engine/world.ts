import { COACH_FIRST, COACH_LAST, OWNER_NAMES } from './names';
import { genPlayer, personality, devType, POOL_LEAGUES, weightedCountry } from './gen';
import { autoLines, emptyLines, teamPower } from './lines';
import { getState, hash01, int, next, normal, pick, seedState, useState_ } from './rng';
import { emptyRecord } from './standings';
import type { Contract, League, Player, Settings, Team } from './types';
import { addDays, ageOn, clamp } from './util';
import { generateDraftClass } from './draft';
import { updateStrategies } from './ai';
import { ownerGoalFor } from './owner';
import { pushMsg, pushNews } from './news';

export interface WorldJson {
  meta: {
    snapshot: string;
    season: number;
    seasonStart: string;
    cap: Record<number, number>;
    floor: Record<number, number>;
    minSalary: Record<number, number>;
    champion: string;
    rivals: [string, string][];
  };
  teams: (Omit<Team, 'lines' | 'rec' | 'strategy' | 'coach' | 'fans' | 'rel' | 'staff' | 'captain' | 'alts' | 'cups' | 'retired' | 'budget'> & { coach: number })[];
  schedule: [number, number, number][];
  players: (Omit<Player, 'real' | 'morale' | 'form' | 'inj' | 'pers' | 'dev' | 'stats' | 'hist' | 'awards' | 'teams' | 'c'> & { c: Contract | null })[];
}

// Stanley Cup titles through the 2025-26 season.
const CUPS: Record<string, number> = {
  MTL: 24, TOR: 13, DET: 11, BOS: 6, CHI: 6, EDM: 5, PIT: 5, NYI: 4, NYR: 4, NJD: 3, COL: 3, TBL: 3,
  FLA: 2, LAK: 2, PHI: 2, CAR: 2, ANA: 1, CGY: 1, DAL: 1, STL: 1, VGK: 1, WSH: 1,
};

export interface NewCareerOpts {
  team: string;
  gmName: string;
  seed?: number;
  settings?: Partial<Settings>;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'real',
  ironman: false,
  worldSize: 'standard',
  sound: false,
  autoLines: true,
  assistant: true,
  stopOnUserGames: false,
  watchGames: false,
  hideMedia: false,
};

export function newCareer(world: WorldJson, o: NewCareerOpts): League {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  useState_(seedState(seed));
  const season = world.meta.season;
  const start = world.meta.seasonStart;
  const L: League = {
    v: 1,
    seed,
    rng: getState(),
    season,
    date: addDays(start, -1),
    phase: 'preseason',
    seasonStart: start,
    regularEnd: start,
    deadline: firstFridayOfMarch(season + 1),
    user: o.team,
    gm: { name: o.gmName || 'GM', rep: 50, seasons: 0, cups: 0, hiredSeason: season, history: [], fired: false },
    owner: { name: pick(OWNER_NAMES), trust: 60, goal: 'playoffs', goalText: '', patience: 2, warnings: 0 },
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
    teams: {},
    players: {},
    nextId: 9_000_000,
    games: [],
    nextGameId: 1,
    playoffs: null,
    picks: [],
    draft: null,
    fa: null,
    negotiations: {},
    news: [],
    inbox: [],
    nextMsgId: 1,
    offers: [],
    trades: [],
    history: [],
    achievements: {},
    scouting: { know: {}, scouts: [], board: [], sentThisWeek: 0 },
    watch: [],
    rivals: world.meta.rivals,
    meta: { cap: { ...world.meta.cap }, floor: { ...world.meta.floor }, minSalary: { ...world.meta.minSalary }, snapshot: world.meta.snapshot, champion: world.meta.champion },
    stops: [],
    album: [],
    flags: {},
    lotteryWins: {},
    dead: [],
    tmpl: [],
    seasonLog: { trades: 0, signings: 0, spent: 0, userGames: { w: 0, l: 0 } },
  };

  // Teams
  for (const t of world.teams) {
    const coachName = `${pick(COACH_FIRST)} ${pick(COACH_LAST)}`;
    L.teams[t.id] = {
      ...t,
      conf: t.conf as 'E' | 'W',
      div: t.div as Team['div'],
      lines: emptyLines(),
      rec: emptyRecord(),
      strategy: 'bubble',
      coach: { name: coachName, rating: t.coach, style: pick(['offense', 'defense', 'balanced', 'development'] as const), age: int(42, 64), salary: int(15, 45) * 100_000 },
      fans: 60,
      rel: 50,
      staff: { med: 2, analytics: 2, scouting: 2 },
      captain: null,
      alts: [],
      cups: CUPS[t.id] ?? 0,
      retired: [],
      budget: 100,
    };
  }

  // Real players
  for (const w of world.players) {
    const p: Player = {
      ...w,
      real: true,
      morale: 70,
      form: 0,
      inj: null,
      pers: personality(w.id),
      dev: devType(w.id),
      stats: {},
      hist: [[season, w.ovr]],
      awards: [],
      teams: w.team ? [w.team] : [],
      c: w.c ? { ...w.c, signed: w.c.signed ?? season - 1 } : null,
    };
    if ((w as { ltir?: boolean }).ltir) {
      const days = 90 + Math.floor(hash01(w.id, 5) * 120);
      p.inj = { type: 'Длительная травма (LTIR)', days, total: days };
    }
    delete (p as { ltir?: boolean }).ltir;
    // Draft rights for unsigned prospects expire at 22 (new CBA) — at least one more season.
    if (p.team && !p.c && (p.st === 'JR' || p.st === 'NCAA' || p.st === 'EUR')) {
      const by = Number(p.bd.slice(0, 4));
      p.rightsUntil = Math.max(season, by + 21);
    }
    L.players[p.id] = p;
  }

  generatePool(L);
  generateDraftClass(L, season + 1);

  // Draft picks for the next three drafts
  for (let y = season + 1; y <= season + 3; y++) {
    for (const t of Object.keys(L.teams)) {
      for (let r = 1; r <= 7; r++) L.picks.push({ id: `${y}-${r}-${t}`, season: y, round: r, orig: t, owner: t });
    }
  }

  // Schedule
  const ids = world.teams.map((t) => t.id);
  L.tmpl = world.schedule.map(([d, h, a]) => [d, ids[h], ids[a]]);
  buildSeasonGames(L, start, false);

  for (const t of Object.values(L.teams)) {
    autoLines(L, t);
    pickCaptain(L, t);
  }
  updateStrategies(L);

  // Owner, scouting, intro messages
  const goal = ownerGoalFor(L, L.user);
  L.owner.goal = goal.goal;
  L.owner.goalText = goal.text;
  L.owner.patience = goal.goal === 'cup' || goal.goal === 'final' ? 1 : 2;
  L.scouting.scouts = [
    { name: `${pick(COACH_FIRST)} ${pick(COACH_LAST)}`, region: 'CHL', skill: int(55, 80) },
    { name: `${pick(COACH_FIRST)} ${pick(COACH_LAST)}`, region: 'EUR', skill: int(55, 80) },
    { name: `${pick(COACH_FIRST)} ${pick(COACH_LAST)}`, region: 'USA', skill: int(55, 80) },
  ];
  const ut = L.teams[L.user];
  for (const p of Object.values(L.players)) if (p.team === L.user) L.album.push(p.id);
  pushMsg(L, {
    from: `${L.owner.name}, владелец`,
    kind: 'owner',
    title: `Добро пожаловать в ${ut.name}`,
    body: `Рад видеть вас в роли генерального менеджера. Мои ожидания на сезон ${season}-${String((season + 1) % 100).padStart(2, '0')}: ${goal.text}. Решения за вами — но я буду следить за результатом.`,
  });
  pushMsg(L, {
    from: 'Ассистент GM',
    kind: 'staff',
    title: 'С чего начать',
    body: 'Загляните во вкладку «Состав», чтобы увидеть звенья, и в «Рынок» — там обмены и свободные агенты. Большая кнопка «Продолжить» двигает время вперёд до следующего важного события. Если встретите незнакомый термин — нажмите на него или откройте «Ещё → Словарь».',
  });
  pushNews(L, { kind: 'league', title: `Стартует сезон ${season}-${String((season + 1) % 100).padStart(2, '0')}`, body: `Действующий обладатель Кубка Стэнли — ${L.teams[L.meta.champion]?.name ?? L.meta.champion}. Сезон впервые состоит из 84 матчей.` });
  L.rng = getState();
  return L;
}

export function firstFridayOfMarch(year: number) {
  for (let d = 1; d <= 7; d++) {
    const iso = `${year}-03-0${d}`;
    if (new Date(iso + 'T12:00:00Z').getUTCDay() === 5) return iso;
  }
  return `${year}-03-05`;
}

/** Creates regular-season games from the template. Later seasons flip home and away. */
export function buildSeasonGames(L: League, start: string, flip: boolean) {
  L.games = [];
  let last = start;
  for (const [d, h, a] of L.tmpl) {
    const day = addDays(start, d);
    if (day > last) last = day;
    L.games.push({ id: L.nextGameId++, day, h: flip ? a : h, a: flip ? h : a });
  }
  L.games.sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : x.id - y.id));
  L.seasonStart = start;
  L.regularEnd = last;
  // Winter Classic on (or closest after) January 1st
  const wc = L.games.find((g) => g.day >= `${Number(start.slice(0, 4)) + 1}-01-01`);
  if (wc) wc.special = 'classic';
}

export function pickCaptain(L: League, t: Team) {
  const roster = Object.values(L.players).filter((p) => p.team === t.id && p.st === 'NHL' && p.pos !== 'G');
  const score = (p: Player) => p.pers.lead * 2 + p.ovr * 0.6 + ageOn(p.bd, L.date) * 0.8 + (p.tr.includes('leader') ? 10 : 0);
  roster.sort((a, b) => score(b) - score(a));
  t.captain = roster[0]?.id ?? null;
  t.alts = roster.slice(1, 3).map((p) => p.id);
}

function generatePool(L: League) {
  const total = L.settings.worldSize === 'compact' ? 300 : L.settings.worldSize === 'huge' ? 5600 : 2200;
  for (const lg of POOL_LEAGUES) {
    const n = Math.round(total * lg.share);
    for (let i = 0; i < n; i++) {
      const age = int(lg.age[0], lg.age[1]);
      // Skewed towards the lower end: few stars, many depth players.
      const u = next();
      let ovr = lg.ovr[0] + (lg.ovr[1] - lg.ovr[0]) * u * u + normal(0, 1.5);
      if (age <= 21) ovr -= 3;
      let pot = ovr;
      if (age <= 20) pot += 6 + next() * 14;
      else if (age <= 23) pot += 2 + next() * 9;
      else if (age <= 25) pot += next() * 4;
      genPlayer(L, { age, country: weightedCountry(lg.countries), ovr: clamp(ovr, 45, 80), pot, league: lg.lg, status: lg.status });
    }
  }
}

export function seasonOfDate(iso: string) {
  const y = Number(iso.slice(0, 4));
  return iso.slice(5) >= '07-01' ? y : y - 1;
}

export function powerRanking(L: League) {
  return Object.values(L.teams)
    .map((t) => ({ t, p: teamPower(L, t) }))
    .sort((a, b) => b.p - a.p);
}
