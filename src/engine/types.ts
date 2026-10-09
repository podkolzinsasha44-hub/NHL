export type Pos = 'C' | 'L' | 'R' | 'D' | 'G';
export type Status = 'NHL' | 'AHL' | 'JR' | 'NCAA' | 'EUR' | 'FA' | 'RET';
export type Difficulty = 'rookie' | 'real' | 'hard';
/** Club competitions simulated by the engine. Teams and games without `lg` belong to the NHL. */
export type LeagueId = 'NHL' | 'KHL';
export type Strategy = 'contend' | 'bubble' | 'rebuild';

export interface SkaterAttrs {
  sk: number; // skating
  sh: number; // shooting
  pa: number; // passing
  ha: number; // puck handling
  oi: number; // offensive IQ
  di: number; // defensive IQ
  ph: number; // physical
  fo: number; // faceoffs
  dc: number; // discipline
  du: number; // durability
}
export interface GoalieAttrs {
  po: number; // positioning
  rf: number; // reflexes
  rb: number; // rebound control
  pk: number; // puck playing
  cs: number; // consistency
  mn: number; // mental
  du: number;
}
export type Attrs = SkaterAttrs | GoalieAttrs;

export interface Contract {
  aav: number;
  /** Start year of the final season of the deal (2026 = 2026-27). */
  last: number;
  type: 'ELC' | 'STD';
  clause: 'NMC' | 'NTC' | null;
  exp: 'RFA' | 'UFA';
  real?: boolean;
  twoWay?: boolean;
  /** Season the deal was signed. */
  signed?: number;
  /** Salary retained by a previous team (they keep paying it). */
  retainedBy?: { team: string; amount: number }[];
}

export interface SkaterLine {
  gp: number; g: number; a: number; pts: number; pm: number; pim: number; sog: number;
  ppg: number; ppp: number; gwg: number; toi: number; hits: number; blk: number;
}
export interface GoalieLine {
  gp: number; gs: number; w: number; l: number; otl: number; sa: number; ga: number; so: number; toi: number;
}
export type StatLine = SkaterLine | GoalieLine;

export interface Injury {
  type: string;
  days: number;
  total: number;
}

export interface Personality {
  lead: number; // 1-20
  prof: number;
  loy: number;
  greed: number;
  win: number;
}

export interface Player {
  id: number;
  fn: string;
  ln: string;
  pos: Pos;
  sh: 'L' | 'R';
  bd: string;
  ctry: string;
  ht: number;
  wt: number;
  num: number | null;
  img: string | null;
  real: boolean;
  team: string | null;
  st: Status;
  ovr: number;
  pot: number;
  r: Attrs;
  tr: string[];
  dr?: { y: number; r: number; p: number; t: string };
  /** Real NHL career totals before the game started. */
  car?: { gp: number; g?: number; a?: number; p?: number; w?: number; so?: number };
  /** Real recent seasons: [season, team, ...line]. */
  h?: (string | number)[][];
  lg?: string | null;
  c: Contract | null;
  morale: number;
  form: number;
  inj: Injury | null;
  pers: Personality;
  dev: 'E' | 'N' | 'L';
  /** Stats keyed by season and type: "2026r", "2026p". */
  stats: Record<string, StatLine>;
  /** In-game OVR history: [season, ovr]. */
  hist: [number, number][];
  awards: string[];
  teams: string[];
  spd?: number;
  shs?: number;
  /** Draft rights expire after this season (unsigned draftees). */
  rightsUntil?: number;
  /** Suspension games remaining. */
  susp?: number;
  /** Player asked for a trade. */
  wantsTrade?: boolean;
  retired?: number;
  /** Number retired by team */
  jerseyRetired?: string[];
  /** Signed extension that starts after the current contract. */
  ext?: Contract;
  /** NHL club holding the draft rights of a player under contract with a non-NHL club (e.g. KHL). */
  rights?: string;
  /** National team appearances and medals: "wc:2027:gold", "og:2030:silver"... */
  intl?: string[];
  /** Draft year this player is eligible for (generated prospects). */
  dy?: number;
  /** Development focus set by the GM. */
  focus?: keyof SkaterAttrs | keyof GoalieAttrs | null;
  /** Days remaining for an ongoing negotiation lockout after talks broke down. */
  talksBlockedUntil?: string;
}

export interface Lines {
  f: number[][]; // 4 lines × [LW, C, RW]
  d: number[][]; // 3 pairs × [LD, RD]
  g: number[]; // [starter, backup]
  pp: number[][]; // 2 units × 5
  pk: number[][]; // 2 units × 4
  auto: boolean;
}

export interface Record_ {
  gp: number; w: number; l: number; otl: number; pts: number; gf: number; ga: number;
  rw: number; row: number; hw: number; hl: number; hotl: number; streak: string; l10: ('W' | 'L' | 'O')[];
  ppo: number; ppg: number; pko: number; pkga: number; sf: number; sa: number;
}

export interface Coach {
  name: string;
  rating: number; // 50-95
  style: 'offense' | 'defense' | 'balanced' | 'development';
  age: number;
  salary: number;
}

export interface Team {
  id: string;
  /** League the club plays in (undefined = NHL). */
  lg?: LeagueId;
  name: string;
  city: string;
  short: string;
  conf: 'E' | 'W';
  /** NHL division; KHL clubs only use conferences ('X'). */
  div: 'A' | 'M' | 'C' | 'P' | 'X';
  primary: string;
  secondary: string;
  accent: string;
  taxFree: boolean;
  canada: boolean;
  bigMarket: boolean;
  lastGame?: string;
  /** Playing style set by the coach/GM. */
  tactic?: 'attack' | 'balanced' | 'defense';
  last: { w: number; l: number; otl: number; pts: number; gf: number; ga: number } | null;
  lines: Lines;
  rec: Record_;
  strategy: Strategy;
  coach: Coach;
  fans: number; // 0-100 mood
  /** Relationship of this AI GM with the user (0-100). */
  rel: number;
  /** Medical staff / analytics / scouting budget levels 1-3 */
  staff: { med: number; analytics: number; scouting: number };
  captain: number | null;
  alts: number[];
  cups: number;
  /** Retired numbers [num, playerName, season]. */
  retired: [number, string, number][];
  /** Victoria Cups won. */
  vc?: number;
  /** Season-long revenue proxy */
  budget: number;
  custom?: boolean;
  logo?: string;
}

export interface Game {
  id: number;
  /** League of the game (undefined = NHL). */
  lg?: LeagueId;
  day: string; // ISO date
  h: string;
  a: string;
  played?: boolean;
  hs?: number;
  as?: number;
  ot?: 'OT' | 'SO' | null;
  shH?: number;
  shA?: number;
  stars?: number[];
  /** Playoff series id */
  series?: string;
  special?: 'classic' | 'allstar' | 'stadium';
  /** One-off cup game outside the league calendar (the Victoria Cup between the two champions). */
  cup?: 'victoria';
  /** Attendance (home games of the user's club and cup games). */
  att?: number;
}

export interface PlayoffSeries {
  id: string;
  round: number;
  conf: 'E' | 'W' | 'F';
  hi: string; // higher seed (home ice)
  lo: string;
  wHi: number;
  wLo: number;
  games: number[]; // game ids
  winner?: string;
  next?: string;
}

export interface Playoffs {
  season: number;
  series: PlayoffSeries[];
  round: number;
  champion?: string;
  conn?: number; // Conn Smythe
}

export interface DraftPick {
  id: string;
  season: number; // draft year (2027 = June 2027 draft)
  round: number;
  orig: string;
  owner: string;
  /** overall slot once known */
  slot?: number;
  used?: number; // player id
}

export interface DraftState {
  year: number;
  order: string[]; // pick ids in order
  pool: number[]; // player ids
  current: number;
  lottery?: { team: string; from: number; to: number }[];
  done: boolean;
  lotteryOrder?: string[];
  /** Mock draft lists from "experts". */
  mocks?: { name: string; picks: number[] }[];
}

export type NewsKind = 'trade' | 'sign' | 'injury' | 'game' | 'award' | 'draft' | 'rumor' | 'owner' | 'milestone' | 'fa' | 'league' | 'social' | 'suspension' | 'retire' | 'achievement';

export interface News {
  id: number;
  date: string;
  kind: NewsKind;
  title: string;
  body?: string;
  team?: string;
  players?: number[];
  /** Social post author (fictional). */
  author?: string;
  handle?: string;
  likes?: number;
  grade?: string;
  important?: boolean;
}

export interface Message {
  id: number;
  date: string;
  from: string;
  title: string;
  body: string;
  read: boolean;
  kind: 'owner' | 'trade' | 'player' | 'staff' | 'league' | 'agent' | 'media';
  /** Optional action reference */
  ref?: { type: 'trade' | 'player' | 'press' | 'medical' | 'screen'; id: number | string };
  choices?: { label: string; effect: string }[];
  resolved?: string;
}

export interface TradeAsset {
  players: number[];
  picks: string[];
  retain?: Record<number, number>; // player id -> retained fraction 0..0.5
}

export interface TradeOffer {
  id: number;
  date: string;
  from: string; // AI team proposing to the user
  give: TradeAsset; // what AI gives
  get: TradeAsset; // what AI wants
  note: string;
  expires: string;
}

export interface TradeRecord {
  id: number;
  date: string;
  season: number;
  a: string;
  b: string;
  aGets: TradeAsset & { names: string[] };
  bGets: TradeAsset & { names: string[] };
  grades?: { a: string; b: string };
  /** grades revisited 3 years later */
  regrade?: { a: string; b: string; note: string };
  user: boolean;
}

export interface Negotiation {
  player: number;
  team: string;
  ask: { aav: number; years: number };
  floor: number; // hidden minimum aav
  patience: number; // 0-100
  rounds: number;
  history: { aav: number; years: number; clause: string | null; result: string }[];
  status: 'open' | 'signed' | 'broken';
  kind: 'extend' | 'fa' | 'rfa';
}

export interface FAOffer {
  team: string;
  aav: number;
  years: number;
  clause: 'NMC' | 'NTC' | null;
  day: string;
}

export interface FAState {
  open: boolean;
  day: number;
  offers: Record<number, FAOffer[]>;
  decided: number[];
}

export interface SeasonSummary {
  season: number;
  champion: string;
  finalist: string;
  presidents: string;
  awards: Record<string, number>;
  userRecord: { w: number; l: number; otl: number; pts: number; place: number; playoffRound: number };
  standings: { id: string; pts: number; w?: number }[];
  topScorer?: { id: number; name: string; pts: number };
  conn?: number;
}

export interface OwnerState {
  name: string;
  trust: number; // 0-100
  goal: 'playoffs' | 'round2' | 'final' | 'cup' | 'develop' | 'improve';
  goalText: string;
  patience: number; // 1-3
  warnings: number;
}

export interface GMState {
  name: string;
  rep: number; // 0-100
  seasons: number;
  cups: number;
  hiredSeason: number;
  history: { season: number; team: string; result: string }[];
  fired: boolean;
  offers?: string[]; // teams offering a job after being fired
  /** Job offers from other clubs while employed (summer, after a strong season). */
  calls?: JobOffer[];
  /** Date of the last team meeting. */
  meeting?: string;
}

export interface JobOffer {
  team: string;
  /** Last day to answer. */
  until: string;
  note: string;
}

export interface Settings {
  difficulty: Difficulty;
  ironman: boolean;
  worldSize: 'compact' | 'standard' | 'huge';
  sound: boolean;
  autoLines: boolean;
  assistant: boolean;
  stopOnUserGames: boolean;
  watchGames: boolean;
  hideMedia: boolean;
  /** The owner never fires the GM (trust is still tracked). */
  noFiring?: boolean;
  /** Russia and Belarus take part in IIHF tournaments (suspended in reality since 2022). */
  intlRussia?: boolean;
}

export interface Scouting {
  /** player id -> knowledge 0..1 */
  know: Record<number, number>;
  scouts: { name: string; region: Region; skill: number }[];
  board: number[];
  sentThisWeek: number;
}
export type Region = 'CHL' | 'USA' | 'EUR' | 'RUS';

export interface Phase {
  name: 'preseason' | 'regular' | 'playoffs' | 'draft' | 'offseason' | 'freeagency';
}

/** Second club league simulated next to the NHL (the KHL), with its own calendar. */
export interface SubLeague {
  phase: 'preseason' | 'regular' | 'playoffs' | 'offseason';
  seasonStart: string;
  regularEnd: string;
  /** Last day trades between clubs are allowed. */
  deadline: string;
  playoffs: Playoffs | null;
  /** Reigning champion. */
  champion: string;
  history: SubSeason[];
}
export interface SubSeason {
  season: number;
  champion: string;
  finalist: string;
  /** Regular-season winner. */
  regular: string;
  topScorer?: { id: number; name: string; pts: number };
  mvp?: number;
  standings: { id: string; pts: number }[];
}

/** Player career: the user is one player; every club is run by the AI. */
export interface ProState {
  pid: number;
  agent: string;
  season0: number;
  /** Contract offers on the table (from AI clubs). */
  offers: ProOffer[];
  /** Coach's trust in the player 0..100: rises with good play, falls with complaints. */
  trust: number;
  /** Season-level log written at the end of every season. */
  log: { season: number; team: string; lg: string; gp: number; g: number; a: number; pts: number; ovr: number; note?: string }[];
  /** Last date the player asked the coach / GM for something (cool-down). */
  asked?: string;
  /** Weeks in a row as a healthy scratch; games played at the last weekly check. */
  scratch?: number;
  gpMark?: number;
  /** Deal agreed in spring with a new club; takes effect on July 1. */
  pending?: { team: string; aav: number; years: number; kind: 'ELC' | 'STD' };
  retired?: boolean;
}
export interface ProOffer {
  id: number;
  team: string;
  aav: number;
  years: number;
  kind: 'ELC' | 'STD';
  expires: string;
  note: string;
}

export type IntlKind = 'wc' | 'og';
export interface IntlGame {
  id: number;
  day: string;
  h: string;
  a: string;
  /** 'A'/'B'/'C' group games, 'q' qualification, 'qf', 'sf', 'bronze', 'final'. */
  stage: string;
  played?: boolean;
  hs?: number;
  as?: number;
  ot?: 'OT' | 'SO' | null;
  shH?: number;
  shA?: number;
  stars?: number[];
}
export interface IntlRecord { gp: number; w: number; otw: number; otl: number; l: number; pts: number; gf: number; ga: number }
export interface Tournament {
  id: string;
  kind: IntlKind;
  year: number;
  name: string;
  host: string;
  start: string;
  /** Last scheduled day (medal games). */
  end: string;
  /** Rosters are named on this date. */
  select: string;
  /** Rosters have been named. */
  named?: boolean;
  teams: string[];
  groups: Record<string, string[]>;
  rosters: Record<string, number[]>;
  games: IntlGame[];
  table: Record<string, IntlRecord>;
  phase: 'upcoming' | 'group' | 'playoff' | 'done';
  medals?: string[];
  /** Final ranking 1..n (filled at the end). */
  rank?: string[];
  mvp?: number;
}
export interface IntlState {
  /** Nation coached by the user (GM careers, optional). */
  coach?: string;
  /** Top-division field for the next World Championship. */
  field: string[];
  current: Tournament | null;
  /** Last finished tournament, kept in full for the results screen. */
  prev?: Tournament;
  history: { id: string; kind: IntlKind; year: number; name: string; medals: string[]; mvp?: number; topScorer?: { id: number; name: string; pts: number }; coach?: string; coachRank?: number }[];
  /** World ranking (best first), updated after every tournament. */
  ranking: string[];
  /** Recent final placements per nation (most recent first). */
  recent: Record<string, number[]>;
  nextGameId: number;
}

/** One season of the user's club finances (reference model: real club books are not public). */
export interface FinanceLine {
  season: number;
  team: string;
  /** Revenue: tickets, food & merchandise at the arena, media rights, sponsors, playoff gates & prizes. */
  gate: number;
  extra: number;
  media: number;
  sponsor: number;
  playoff: number;
  /** Expenses: player salaries, coaches & club services, arena & travel, fan events. */
  payroll: number;
  staff: number;
  ops: number;
  events: number;
  homeGames: number;
  /** Total attendance of regular-season home games and the number of sellouts. */
  att: number;
  sellouts: number;
}
export interface FinanceState {
  /** Ticket price level −2..+2 (×0.7 … ×1.3 of the club's base price). */
  price: number;
  cur: FinanceLine;
  hist: FinanceLine[];
  /** Recent home games of the user's club: [date, attendance, capacity]. */
  games: [string, number, number][];
  /** Date of the last fan event. */
  promo?: string;
}

/** Victoria Cup: the Stanley Cup champion meets the Gagarin Cup champion in Europe in early October. */
export interface SuperCupGame {
  season: number;
  day: string;
  nhl: string;
  khl: string;
  venue: string;
  hs?: number;
  as?: number;
  ot?: 'OT' | 'SO' | null;
  winner?: string;
  mvp?: number;
  gameId?: number;
  att?: number;
}
export interface SuperCupState {
  next: SuperCupGame | null;
  history: SuperCupGame[];
}

/** Hall of Fame member (inducted in the game world). */
export interface HallEntry {
  id: number;
  name: string;
  pos: Pos;
  ctry: string;
  year: number;
  team: string | null;
  line: string;
}

export interface League {
  v: number;
  /** 'gm' (default): the user runs `user` club. 'player': the user is `pro.pid`, `user` is ''. */
  mode?: 'gm' | 'player';
  khl?: SubLeague;
  pro?: ProState;
  intl?: IntlState;
  seed: number;
  rng: [number, number, number, number];
  season: number; // 2026 = 2026-27
  date: string;
  phase: Phase['name'];
  seasonStart: string;
  regularEnd: string;
  deadline: string;
  user: string;
  gm: GMState;
  owner: OwnerState;
  settings: Settings;
  teams: Record<string, Team>;
  players: Record<number, Player>;
  nextId: number;
  games: Game[];
  nextGameId: number;
  playoffs: Playoffs | null;
  picks: DraftPick[];
  draft: DraftState | null;
  fa: FAState | null;
  negotiations: Record<number, Negotiation>;
  news: News[];
  inbox: Message[];
  nextMsgId: number;
  offers: TradeOffer[];
  trades: TradeRecord[];
  history: SeasonSummary[];
  achievements: Record<string, string>;
  scouting: Scouting;
  watch: number[];
  rivals: [string, string][];
  meta: { cap: Record<number, number>; floor: Record<number, number>; minSalary: Record<number, number>; snapshot: string; champion: string };
  /** Pending stop-reasons for the sim loop. */
  stops: string[];
  /** Last user game id to open in match center. */
  lastUserGame?: number;
  /** Album: all players who played for the user's team. */
  album: number[];
  lotteryWins: Record<string, number[]>;
  /** Points snapshot at the start of the month (player of the month). */
  monthSnap?: Record<number, number>;
  /** Weekly projection history for the user team: [date, playoffs, cup]. */
  oddsHist?: [string, number, number][];
  /** Dead cap from buyouts. */
  dead: { team: string; season: number; amount: number; name: string }[];
  /** Seen glossary / tutorial flags */
  flags: Record<string, boolean>;
  /** Persistent stats for GM wrapped */
  /** Regular-season schedule template: [dayOffset, home, away]. */
  tmpl: [number, string, string][];
  seasonLog: { trades: number; signings: number; spent: number; bestTrade?: number; userGames: { w: number; l: number } };
  /** Club finances of the user's club (GM careers). */
  fin?: FinanceState;
  /** Victoria Cup between the champions of the NHL and the KHL. */
  supercup?: SuperCupState;
  /** Hall of Fame inductees, newest first. */
  hof?: HallEntry[];
}

export interface GameEvent {
  t: number; // seconds from start
  p: number; // period 1..
  type: 'goal' | 'penalty' | 'save' | 'shot' | 'injury' | 'period' | 'end' | 'timeout' | 'pull' | 'so' | 'hit' | 'fight';
  team: string;
  text: string;
  players?: number[];
  score?: [number, number];
  x?: number;
  y?: number;
  strength?: 'EV' | 'PP' | 'SH' | 'EN' | '3v3';
}

export interface GameResult {
  hs: number;
  as: number;
  ot: 'OT' | 'SO' | null;
  shH: number;
  shA: number;
  events: GameEvent[];
  stars: number[];
  ppH: [number, number];
  ppA: [number, number];
  gH: number; // goalie ids
  gA: number;
  /** Shot map points for both teams: [x, y, goal?] in 0..1 rink coordinates (attacking right). */
  shotsMap: { team: string; x: number; y: number; goal: boolean }[];
  injuries: { id: number; days: number; type: string }[];
  momentum: number[]; // per 5 minutes, home minus away shot share
}
