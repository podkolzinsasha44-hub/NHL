import { DRAFT_COUNTRIES, type Country } from './names';
import { genPlayer, weightedCountry } from './gen';
import { hash01, int, next, normal, weighted } from './rng';
import { pushMsg, pushNews, social } from './news';
import { compareTeams } from './standings';
import type { DraftState, League, Player } from './types';
import { ageOn, clamp } from './util';

export const LOTTERY_ODDS = [18.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6.0, 5.0, 3.5, 3.0, 2.5, 2.0, 1.5, 0.5, 0.5];

const JR_LEAGUE: Record<string, [string, number][]> = {
  CAN: [['OHL', 0.4], ['WHL', 0.35], ['QMJHL', 0.22], ['BCHL', 0.03]],
  USA: [['USHL', 0.45], ['NTDP', 0.3], ['OHL', 0.1], ['NCAA', 0.1], ['WHL', 0.05]],
  SWE: [['J20 Nationell', 0.6], ['SHL', 0.2], ['HockeyAllsvenskan', 0.2]],
  FIN: [['U20 SM-sarja', 0.6], ['Liiga', 0.25], ['Mestis', 0.15]],
  RUS: [['MHL', 0.65], ['KHL', 0.15], ['VHL', 0.2]],
  CZE: [['Czechia U20', 0.55], ['Czechia', 0.2], ['OHL', 0.15], ['WHL', 0.1]],
  SVK: [['Slovakia', 0.5], ['OHL', 0.25], ['QMJHL', 0.25]],
};

const DRAFT_CURVE: [number, number][] = [[0, 92], [0.008, 89], [0.03, 86], [0.09, 81], [0.22, 76], [0.45, 71], [0.7, 66], [1, 57]];
const curve = (x: number) => {
  for (let i = 1; i < DRAFT_CURVE.length; i++) {
    if (x <= DRAFT_CURVE[i][0]) {
      const [x0, y0] = DRAFT_CURVE[i - 1], [x1, y1] = DRAFT_CURVE[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 57;
};

/** Creates the prospects eligible for the June draft of `year` (they are ~17 now). */
export function generateDraftClass(L: League, year: number) {
  const n = 330;
  const strength = normal(0, 1.4); // some classes are deeper than others
  const generational = next() < 0.14;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const country = weightedCountry(DRAFT_COUNTRIES as [Country, number][]);
    const leagues = JR_LEAGUE[country] ?? [['Juniors', 1]];
    const lg = weighted(leagues.map((x) => x[0]), leagues.map((x) => x[1]));
    let pot = curve(i / n) + strength + normal(0, 2.2);
    if (i === 0 && generational) pot = 95 + next() * 2;
    pot = clamp(pot, 52, 97);
    const ageNow = ageOn(`${year - 18}-0${int(1, 8)}-15`, L.date); // turns 18 before draft day
    const ovr = pot - 17 - next() * 9 + (lg === 'KHL' || lg === 'SHL' || lg === 'Liiga' ? 2 : 0);
    const p = genPlayer(L, {
      age: Math.max(16, ageNow),
      country,
      ovr: clamp(ovr, 40, 74),
      pot,
      league: lg,
      status: lg === 'NCAA' ? 'NCAA' : ['SHL', 'Liiga', 'KHL', 'VHL', 'HockeyAllsvenskan', 'Czechia', 'Slovakia', 'Mestis'].includes(lg) ? 'EUR' : 'JR',
    });
    // Birthdate inside the eligibility window (born in year-18 before Sept 15)
    p.bd = `${year - 18}-${String(int(1, 9)).padStart(2, '0')}-${String(int(1, 14)).padStart(2, '0')}`;
    p.dy = year;
    ids.push(p.id);
  }
  return ids;
}

export const draftYearOf = (p: Player) => p.dy;

/** Public "Central Scouting" style ranking: noisy but stable. */
export function publicRank(L: League, year: number): Player[] {
  const pool = draftPool(L, year);
  return pool.sort((a, b) => publicScore(b, year) - publicScore(a, year));
}
export function publicScore(p: Player, year: number) {
  return p.pot * 0.78 + p.ovr * 0.22 + (hash01(p.id, year) - 0.5) * 9;
}

export function draftPool(L: League, year: number): Player[] {
  const out: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team || p.st === 'RET' || p.st === 'NHL' || p.st === 'AHL') continue;
    const dy = draftYearOf(p);
    if (dy === year) out.push(p);
    else if (dy && dy < year && ageOn(p.bd, `${year}-09-15`) <= 20) out.push(p);
  }
  return out;
}

/** How well the user's staff knows a player (0..1). */
export function knowOf(L: League, p: Player) {
  const analytics = L.teams[L.user]?.staff.analytics ?? 2;
  const nhlExp = (p.car?.gp ?? 0) >= 50 || p.st === 'NHL';
  return L.scouting.know[p.id] ?? (nhlExp ? 0.78 + analytics * 0.05 : p.team === L.user ? 0.5 : 0.08 + analytics * 0.05);
}

/** The user's view of a prospect's potential: a range that narrows with scouting. */
export function potRange(L: League, p: Player): [number, number] {
  if (p.team === L.user && p.st === 'NHL') return [p.pot, p.pot];
  const know = knowOf(L, p);
  const width = Math.round((1 - know) * 14) + 2;
  const bias = (hash01(p.id, 77) - 0.5) * (1 - know) * 10;
  const center = p.pot + bias;
  const lo = Math.round(Math.max(p.ovr, center - width / 2));
  const hi = Math.round(Math.min(97, Math.max(lo + 1, center + width / 2)));
  return [lo, hi];
}

// ---------- Lottery & order ----------

export function lotteryTeams(L: League): string[] {
  const playoffTeams = new Set<string>();
  for (const s of L.playoffs?.series ?? []) if (s.round === 1) { playoffTeams.add(s.hi); playoffTeams.add(s.lo); }
  return Object.values(L.teams)
    .filter((t) => !playoffTeams.has(t.id))
    .sort((a, b) => -compareTeams(a, b)) // worst first
    .map((t) => t.id);
}

export function runLottery(L: League) {
  const year = L.season + 1;
  const order = lotteryTeams(L);
  const hist = L.lotteryWins;
  const results: { team: string; from: number; to: number }[] = [];
  const original = [...order];
  for (let draw = 1; draw <= 2; draw++) {
    let winner: string;
    let tries = 0;
    do {
      const cands = original.filter((t) => !results.some((r) => r.team === t));
      winner = weighted(cands, cands.map((t) => LOTTERY_ODDS[original.indexOf(t)]));
      tries++;
    } while ((hist[winner] ?? []).filter((y) => y > year - 5).length >= 2 && tries < 50);
    const pos = order.indexOf(winner);
    const target = Math.max(draw - 1, pos - 10);
    order.splice(pos, 1);
    order.splice(target, 0, winner);
    results.push({ team: winner, from: original.indexOf(winner) + 1, to: target + 1 });
    if (target === draw - 1) (hist[winner] ??= []).push(year);
  }
  L.draft = { year, order: [], pool: [], current: 0, lottery: results, done: false, lotteryOrder: order };
  const first = order[0];
  pushNews(L, { kind: 'draft', title: `Лотерея драфта: первый выбор у ${L.teams[first].name}`, body: results.map((r, i) => `${i + 1}-й розыгрыш: ${L.teams[r.team].short} (с ${r.from}-го места → ${r.to}-й выбор)`).join('\n'), important: true });
  if (order.slice(0, 2).includes(L.user)) social(L, `${L.teams[L.user].short} выигрывают лотерею! Фанаты уже покупают свитера будущей звезды`, { kind: 'fan', team: L.user });
  return results;
}

/** Final draft order once the playoffs are over. */
export function finalizeDraftOrder(L: League) {
  if (!L.draft) runLottery(L);
  const D = L.draft as DraftState;
  const year = D.year;
  const lottery = D.lotteryOrder ?? lotteryTeams(L);
  const po = L.playoffs!;
  const roundOut = (t: string) => {
    let r = 0;
    for (const s of po.series) if (s.hi === t || s.lo === t) r = Math.max(r, s.round + (s.winner === t ? 1 : 0));
    return r; // 1 lost R1 ... 4 lost final, 5 champion
  };
  const playoffTeams = Object.keys(L.teams).filter((t) => !lottery.includes(t));
  playoffTeams.sort((a, b) => {
    const ra = Math.min(roundOut(a), 3), rb = Math.min(roundOut(b), 3);
    if (ra !== rb) return ra - rb;
    const ra2 = roundOut(a), rb2 = roundOut(b);
    if (ra2 !== rb2) return ra2 - rb2;
    return -compareTeams(L.teams[a], L.teams[b]);
  });
  const teamOrder = [...lottery, ...playoffTeams];
  const order: string[] = [];
  for (let r = 1; r <= 7; r++) {
    teamOrder.forEach((t, i) => {
      const pk = L.picks.find((p) => p.season === year && p.round === r && p.orig === t);
      if (pk) {
        pk.slot = (r - 1) * 32 + i + 1;
        order.push(pk.id);
      }
    });
  }
  D.order = order;
  D.pool = draftPool(L, year).map((p) => p.id);
  D.current = 0;
  D.mocks = [
    { name: 'Ник Ледовой', picks: mock(L, year, 1) },
    { name: 'Prospect Watch', picks: mock(L, year, 2) },
  ];
}

function mock(L: League, year: number, salt: number) {
  const pool = draftPool(L, year).sort((a, b) => publicScore(b, year) + (hash01(b.id, salt) - 0.5) * 6 - publicScore(a, year) - (hash01(a.id, salt) - 0.5) * 6);
  return pool.slice(0, 32).map((p) => p.id);
}

let gNeedCache: { date: string; need: Record<string, boolean> } | null = null;
function goalieNeed(L: League, team: string) {
  if (!gNeedCache || gNeedCache.date !== L.date) {
    const cnt: Record<string, number> = {};
    for (const id in L.players) {
      const x = L.players[id];
      if (x.team && x.pos === 'G' && ageOn(x.bd, L.date) <= 25) cnt[x.team] = (cnt[x.team] ?? 0) + 1;
    }
    const need: Record<string, boolean> = {};
    for (const t of Object.keys(L.teams)) need[t] = (cnt[t] ?? 0) < 2;
    gNeedCache = { date: L.date, need };
  }
  return gNeedCache.need[team];
}

/** AI team's valuation of a prospect (team-specific noise models different scouting staffs). */
function aiValue(L: League, team: string, p: Player, year: number) {
  const scout = L.teams[team].staff.scouting;
  const noise = (hash01(p.id, team.charCodeAt(0) * 31 + team.charCodeAt(1) * 7 + team.charCodeAt(2)) - 0.5) * (12 - scout * 2.5);
  const t = L.teams[team];
  const needG = goalieNeed(L, team);
  let v = p.pot * 0.8 + p.ovr * 0.2 + noise;
  if (p.pos === 'G') v -= needG ? 1 : 4; // goalies are risky picks
  if (t.strategy === 'contend') v += (p.ovr - 60) * 0.05;
  v += (publicScore(p, year) - p.pot) * 0.25; // herd behaviour
  return v;
}

export function currentPick(L: League) {
  const D = L.draft;
  if (!D || D.done) return null;
  const id = D.order[D.current];
  return L.picks.find((p) => p.id === id) ?? null;
}

export function makePick(L: League, playerId: number) {
  const D = L.draft!;
  const pk = currentPick(L)!;
  const p = L.players[playerId];
  pk.used = p.id;
  p.team = pk.owner;
  p.teams = [pk.owner];
  p.dr = { y: D.year, r: pk.round, p: pk.slot ?? D.current + 1, t: pk.owner };
  p.rightsUntil = Math.max(D.year, Number(p.bd.slice(0, 4)) + 21);
  D.pool = D.pool.filter((x) => x !== p.id);
  D.current++;
  if (pk.owner === L.user) {
    L.album.push(p.id);
    L.scouting.know[p.id] = Math.max(L.scouting.know[p.id] ?? 0, 0.6);
  }
  if ((pk.slot ?? 99) <= 5 || pk.owner === L.user) {
    pushNews(L, { kind: 'draft', title: `№${pk.slot} — ${p.fn} ${p.ln} (${p.pos}, ${p.lg}) → ${L.teams[pk.owner].short}`, team: pk.owner, players: [p.id] });
  }
  if (D.current >= D.order.length) finishDraft(L);
}

export function aiPickFor(L: League, team: string): number {
  const D = L.draft!;
  const pool = D.pool.map((id) => L.players[id]);
  let best = pool[0], bv = -Infinity;
  for (const p of pool) {
    const v = aiValue(L, team, p, D.year);
    if (v > bv) { bv = v; best = p; }
  }
  return best.id;
}

/** Runs AI picks until it is the user's turn (or the draft ends). */
export function runDraftUntilUser(L: League, includeUser = false) {
  const D = L.draft;
  if (!D) return;
  while (!D.done) {
    const pk = currentPick(L);
    if (!pk) break;
    if (pk.owner === L.user && !includeUser) break;
    makePick(L, aiPickFor(L, pk.owner));
  }
}

export function finishDraft(L: League) {
  const D = L.draft!;
  D.done = true;
  const top = D.order.slice(0, 3).map((id) => L.picks.find((p) => p.id === id)!).map((pk) => L.players[pk.used!]);
  pushNews(L, { kind: 'draft', title: `Драфт ${D.year} завершён`, body: `Первые номера: ${top.map((p) => `${p.fn} ${p.ln}`).join(', ')}.` });
  const mine = D.order.map((id) => L.picks.find((p) => p.id === id)!).filter((pk) => pk.owner === L.user && pk.used);
  if (mine.length) {
    pushMsg(L, { from: 'Скаутский отдел', kind: 'staff', title: 'Итоги драфта', body: `Мы выбрали: ${mine.map((pk) => `№${pk.slot} ${L.players[pk.used!].fn} ${L.players[pk.used!].ln}`).join(', ')}. Права на неподписанных проспектов действуют до 22 лет — не забудьте предложить им контракт новичка (ELC).` });
  }
  // Next year's class appears in the junior leagues.
  generateDraftClass(L, D.year + 1);
}

// ---------- Scouting ----------

export function weeklyScouting(L: League) {
  const year = L.draft && !L.draft.done ? L.draft.year : L.season + 1;
  const pool = draftPool(L, year);
  const regionOf = (p: Player) => (['CAN'].includes(p.ctry) ? 'CHL' : p.ctry === 'USA' ? 'USA' : p.ctry === 'RUS' || p.ctry === 'BLR' || p.ctry === 'KAZ' ? 'RUS' : 'EUR');
  const budget = L.teams[L.user].staff.scouting;
  for (const s of L.scouting.scouts) {
    const mine = pool.filter((p) => regionOf(p) === s.region || (s.region === 'EUR' && regionOf(p) === 'RUS'));
    const board = new Set(L.scouting.board);
    mine.sort((a, b) => (board.has(b.id) ? 1 : 0) - (board.has(a.id) ? 1 : 0) || publicScore(b, year) - publicScore(a, year));
    const k = 4 + budget * 2;
    for (let i = 0; i < Math.min(k, mine.length); i++) {
      const p = i < 3 ? mine[i] : mine[Math.floor(next() * mine.length)];
      const cur = L.scouting.know[p.id] ?? 0.15;
      L.scouting.know[p.id] = Math.min(0.95, cur + (0.06 + s.skill / 1000) * (1 - cur) * 2);
    }
  }
  L.scouting.sentThisWeek = 0;
}

export function sendScout(L: League, playerId: number) {
  const cap = 1 + L.teams[L.user].staff.scouting;
  if (L.scouting.sentThisWeek >= cap) return false;
  const cur = L.scouting.know[playerId] ?? 0.15;
  L.scouting.know[playerId] = Math.min(0.97, cur + 0.35);
  L.scouting.sentThisWeek++;
  return true;
}

export function scoutReport(L: League, p: Player): string {
  const a = p.r as unknown as Record<string, number>;
  const know = knowOf(L, p);
  if (know < 0.3) return 'Мы видели его слишком мало, чтобы делать выводы. Отправьте скаута.';
  const lines: string[] = [];
  if (p.pos === 'G') {
    lines.push(a.rf >= p.ovr + 3 ? 'Феноменальная реакция, вытаскивает «мёртвые» шайбы.' : 'Играет позиционно, без лишних движений.');
    lines.push(a.mn >= p.ovr + 3 ? 'Хладнокровен в концовках.' : 'Иногда «плывёт» после пропущенных голов.');
  } else {
    if (a.sk >= p.ovr + 4) lines.push('Катается легко и быстро — один из лучших конькобежцев класса.');
    else if (a.sk <= p.ovr - 4) lines.push('Катание — главный вопрос: первый шаг медленный.');
    if (a.sh >= p.ovr + 4) lines.push('Бросок готов для НХЛ уже сейчас.');
    if (a.pa >= p.ovr + 4) lines.push('Видит площадку, отдаёт пасы, которые другие не видят.');
    if (a.ph >= p.ovr + 5) lines.push('Не боится борьбы у бортов, играет жёстко.');
    else if (a.ph <= p.ovr - 5) lines.push('Боится контакта, проигрывает борьбу у бортов.');
    if (a.di >= p.ovr + 4) lines.push('Ответственен в обороне — тренеры таких любят.');
    if (lines.length < 2) lines.push('Разносторонний игрок без явных слабостей.');
  }
  lines.push(p.pers.prof >= 15 ? 'Трудоголик: первым приходит на лёд.' : p.pers.prof <= 6 ? 'Есть вопросы к характеру и режиму.' : 'Характер — без замечаний.');
  return lines.join(' ');
}
