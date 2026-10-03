// Offseason calendar: awards → lottery/draft → qualifying offers → July 1 rollover & free agency →
// training camp → new season. Called at the end of every simulated day.
import { autoLines } from './lines';
import { announceAwards, computeAwards, staffAwards } from './awards';
import { activateExtensions, allCapHits, buyout, capFor, capHit, capSpace, contractCount, floorFor, minSalaryFor, preferredYearsFor, roundSalary, salaryText, signContract, signELC, makeFreeAgent, valueFor } from './contracts';
import { countSigning, freeAgents, signFA, signingBlock } from './fa';
import { foreignCounts } from './khlData';
import { isGM, isNhlGM, leagueTeamIds, lgOf, userTeam } from './leagues';
import { buildKhlSeason, khlYouthIntake } from './khl';
import { applyOlympicBreak } from './intl';
import { proNewLeagueYear } from './pro';
import { finalizeDraftOrder, runDraftUntilUser, runLottery } from './draft';
import { faDay, faWeekly, openFreeAgency, sendUnsignedAbroad } from './fa';
import { pushMsg, pushNews, social } from './news';
import { evaluateSeason, ownerGoalFor, ownerReact } from './owner';
import { playoffResultOf } from './playoffs';
import { replenishPool, retirements, trainingCamp } from './progression';
import { next } from './rng';
import { sortedTeams } from './standings';
import { statKey } from './stats';
import type { League, LeagueId, Player, SkaterLine } from './types';
import { addDays, ageOn, clamp } from './util';
import { buildSeasonGames, pickCaptain } from './world';
import { updateStrategies } from './ai';
import { regradeTrades, weeklyTradeActivity } from './trades';
import { checkAchievements } from './achievements';

const md = (L: League) => L.date.slice(5);

export function offseasonDaily(L: League) {
  const s = L.season;
  // Lottery in early May (during the playoffs)
  if (L.phase === 'playoffs' && md(L) >= '05-05' && (!L.draft || L.draft.year !== s + 1)) runLottery(L);

  if (L.phase === 'playoffs' && L.playoffs?.champion && !L.flags[`post${s}`]) {
    L.flags[`post${s}`] = true;
    postSeason(L);
    return;
  }
  if (L.phase === 'regular' && md(L) >= '01-01' && md(L) < '06-01' && new Date(L.date + 'T12:00:00Z').getUTCDay() === 3) aiExtensions(L, 0.06);

  // Draft on June 26 (or right after a late Cup final, e.g. in Olympic seasons).
  if (L.phase === 'offseason' && md(L) >= '06-26' && md(L) < '07-01' && L.draft && !L.draft.done) {
    L.phase = 'draft';
    if (!L.draft.order.length) finalizeDraftOrder(L);
    runDraftUntilUser(L);
    if (isNhlGM(L)) L.stops.push('draft');
    return;
  }
  if (L.phase === 'draft') {
    for (let i = 0; i < 4; i++) weeklyTradeActivity(L);
    if (L.draft && !L.draft.done) runDraftUntilUser(L, true);
    L.phase = 'offseason';
    aiSignDraftees(L);
    return;
  }
  if (L.phase === 'offseason' && md(L) >= '06-30' && md(L) < '07-10' && L.draft?.done !== false && !L.flags[`qo${s}`]) {
    L.flags[`qo${s}`] = true;
    aiExtensions(L, 1);
    expireRights(L);
    aiSignDraftees(L);
    signRights(L);
    remindUser(L);
    return;
  }
  // July 1 — new league year
  if (L.phase === 'offseason' && md(L) >= '07-01' && md(L) < '07-10' && L.flags[`qo${s}`] && !L.flags[`ly${s + 1}`]) {
    L.flags[`ly${s + 1}`] = true;
    newLeagueYear(L);
    return;
  }
  if (L.phase === 'freeagency') {
    faDay(L);
    if (md(L) >= '07-14') {
      L.phase = 'offseason';
      pushNews(L, { kind: 'fa', title: 'Главная волна свободных агентов позади' });
    }
    return;
  }
  if (L.phase === 'offseason' && md(L) >= '07-15' && md(L) < '09-30') {
    const dow = new Date(L.date + 'T12:00:00Z').getUTCDay();
    if (dow === 1) faWeekly(L);
    if (md(L) === '09-01' && !L.flags[`camp${s}`]) {
      L.flags[`camp${s}`] = true;
      camp(L);
    }
  }
  if (L.phase === 'preseason' && md(L) === '09-25' && !L.flags[`cuts${s}`]) {
    L.flags[`cuts${s}`] = true;
    sendUnsignedAbroad(L);
    aiCapCompliance(L);
  }
}

function postSeason(L: League) {
  const po = L.playoffs!;
  const champ = L.teams[po.champion!];
  champ.cups++;
  const final = po.series.find((x) => x.round === 4)!;
  const finalist = final.winner === final.hi ? final.lo : final.hi;
  pushNews(L, { kind: 'league', title: `🏆 ${champ.name} — обладатели Кубка Стэнли ${L.season + 1}!`, body: `В финале обыграны ${L.teams[finalist].name} (${Math.max(final.wHi, final.wLo)}–${Math.min(final.wHi, final.wLo)}).`, team: champ.id, important: true });
  // Conn Smythe: best playoff performer on the finalists (mostly the champion)
  const pk = statKey(L.season, true);
  let conn: Player | null = null, cv = -1;
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team !== champ.id && p.team !== finalist) continue;
    const st = p.stats[pk];
    if (!st) continue;
    const v = p.pos === 'G'
      ? ('sa' in st && st.sa ? ((st.sa - st.ga) / st.sa - 0.9) * 600 + st.w * 1.5 : 0)
      : (st as SkaterLine).pts * 1.2 + (st as SkaterLine).g * 0.4;
    const vv = v * (p.team === champ.id ? 1 : 0.7);
    if (vv > cv) { cv = vv; conn = p; }
  }
  const awards = computeAwards(L);
  if (conn) awards.conn = conn.id;
  announceAwards(L, awards);
  po.conn = conn?.id;
  const prevPts: Record<string, number> = {};
  for (const t of Object.values(L.teams)) prevPts[t.id] = t.last?.pts ?? t.rec.pts;
  const gmYear = staffAwards(L, prevPts);

  // User evaluation (NHL GMs; KHL GMs are reviewed after the Gagarin Cup final)
  const nhlGM = isNhlGM(L);
  const result = nhlGM ? playoffResultOf(L, L.user) : 0;
  if (nhlGM) {
    const ut = L.teams[L.user];
    const delta = evaluateSeason(L, result, ut.rec.pts, ut.last?.pts ?? null);
    const resText = ['не попали в плей-офф', 'вылет в 1-м раунде', 'вылет во 2-м раунде', 'финал конференции', 'финал Кубка', 'КУБОК СТЭНЛИ'][result];
    L.gm.history.push({ season: L.season, team: L.user, result: resText });
    L.gm.seasons++;
    L.gm.rep = clamp(L.gm.rep + (result - 1.5) * 4 + (gmYear ? 6 : 0), 0, 100);
    if (result === 5) {
      L.gm.cups++;
      L.stops.push('champion');
      social(L, `ЧЕМПИОНЫ! ${ut.name} выигрывают Кубок Стэнли! Парад в ${ut.city} уже завтра 🏆🎉`, { kind: 'fan', team: L.user });
    }
    pushMsg(L, {
      from: `${L.owner.name}, владелец`, kind: 'owner',
      title: `Итоги сезона: ${resText}`,
      body: `${delta >= 0 ? 'Я доволен' : 'Я разочарован'}. Доверие ${delta >= 0 ? '+' : ''}${delta} → ${L.owner.trust}/100.`,
      ref: { type: 'screen', id: 'wrapped' },
    });
  } else if (!isGM(L) && L.playoffs?.champion && L.playoffs.champion === userTeam(L)) {
    L.stops.push('champion');
  }
  const myTeam = userTeam(L);
  const ut = myTeam ? L.teams[myTeam] : null;
  const myLg = lgOf(ut);
  const place = ut ? sortedTeams(L, undefined, myLg).findIndex((t) => t.id === ut.id) + 1 : 0;
  // History
  const st = sortedTeams(L);
  const sk = Object.values(L.players).filter((p) => p.pos !== 'G' && p.stats[statKey(L.season, false)]);
  const top = sk.sort((a, b) => (b.stats[statKey(L.season, false)] as SkaterLine).pts - (a.stats[statKey(L.season, false)] as SkaterLine).pts)[0];
  L.history.unshift({
    season: L.season,
    champion: champ.id,
    finalist,
    presidents: st[0].id,
    awards,
    userRecord: ut ? { w: ut.rec.w, l: ut.rec.l, otl: ut.rec.otl, pts: ut.rec.pts, place, playoffRound: result } : { w: 0, l: 0, otl: 0, pts: 0, place: 0, playoffRound: 0 },
    standings: st.map((t) => ({ id: t.id, pts: t.rec.pts })),
    topScorer: top ? { id: top.id, name: `${top.fn} ${top.ln}`, pts: (top.stats[statKey(L.season, false)] as SkaterLine).pts } : undefined,
    conn: conn?.id,
  });
  for (const t of Object.values(L.teams)) if (lgOf(t) === 'NHL') t.last = { w: t.rec.w, l: t.rec.l, otl: t.rec.otl, pts: t.rec.pts, gf: t.rec.gf, ga: t.rec.ga };
  finalizeDraftOrder(L);
  retirements(L);
  regradeTrades(L);
  checkAchievements(L);
  if (nhlGM) ownerReact(L);
  L.phase = 'offseason';
}

/** AI teams re-sign their own expiring players (probability per call). */
function aiExtensions(L: League, prob: number) {
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || p.team === L.user || !p.c || p.c.last !== L.season || p.ext || p.st === 'RET') continue;
    if (L.pro?.pid === p.id) continue; // the user's own player decides himself
    if (next() > prob) continue;
    const t = L.teams[p.team];
    const khl = t.lg === 'KHL';
    // A KHL player whose NHL club wants him is not re-signed in Russia.
    if (khl && p.rights && wantsRightsPlayer(L, p)) continue;
    const a = ageOn(p.bd, L.date);
    const mv = valueFor(L, p, t.id, L.season + 1);
    const keep = khl
      ? p.ovr >= 64 || (a <= 23 && p.pot >= 70) || (p.pos === 'G' && p.ovr >= 64)
      : p.ovr >= 74 || (a <= 24 && p.pot >= 76) || (p.pos === 'G' && p.ovr >= 72);
    if (!keep) continue;
    if (t.strategy === 'rebuild' && a >= 31) continue;
    if (capSpace(L, t.id, L.season + 1) < mv * 0.9) continue;
    const years = Math.min(preferredYearsFor(L, p, t.id), 7);
    const aav = roundSalary(mv * (0.93 + next() * 0.14), khl ? 'KHL' : 'NHL');
    signContract(L, p, t.id, { aav, years, clause: !khl && aav >= 6_000_000 && a >= 27 && next() < 0.5 ? 'NMC' : null }, 'extend', aav < (khl ? 700_000 : 6_000_000));
  }
}

function aiSignDraftees(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || p.team === L.user || p.c || !p.dr || L.pro?.pid === p.id) continue;
    const a = ageOn(p.bd, L.date);
    if (p.ovr >= 64 || a >= 20 || (p.dr.r === 1 && p.dr.y < L.season + 1)) {
      if (contractCount(L, p.team) < 48) signELC(L, p, p.team);
    }
  }
}

/** AI NHL clubs decide whether to bring over a drafted player whose KHL contract is ending. */
function wantsRightsPlayer(L: League, p: Player) {
  const a = ageOn(p.bd, L.date);
  return p.ovr >= 68 || (a <= 22 && p.pot >= 76 && p.ovr >= 62);
}

function signRights(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    const holder = p.rights;
    if (!holder || p.st === 'RET' || L.pro?.pid === p.id) continue;
    // Still under contract in the KHL for next season: the NHL club has to wait.
    if (p.c && p.c.last > L.season) continue;
    if (holder === L.user) {
      if (isNhlGM(L)) pushMsg(L, { from: 'Скаутский отдел', kind: 'staff', title: `${p.fn} ${p.ln} свободен от контракта в КХЛ`, body: `Права на игрока у нас до ${(p.rightsUntil ?? L.season) + 1} года. Его контракт в КХЛ истекает — можно предложить контракт (в разделе «Состав → Права»).`, ref: { type: 'player', id: p.id } });
      continue;
    }
    if (!wantsRightsPlayer(L, p) || contractCount(L, holder) >= 48) continue;
    const from = p.team;
    if (ageOn(p.bd, L.date) <= 24) signELC(L, p, holder);
    else signContract(L, p, holder, { aav: valueFor(L, p, holder, L.season + 1), years: 2, clause: null }, 'new', true);
    delete p.rights;
    if (from && L.teams[from]?.lg === 'KHL') pushNews(L, { kind: 'sign', title: `${p.fn} ${p.ln} уезжает из ${L.teams[from].short} в НХЛ: контракт с ${L.teams[holder].short}`, team: holder, players: [p.id], important: from === userTeam(L) });
  }
}

function expireRights(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (p.rights && p.rightsUntil != null && p.rightsUntil < L.season + 1) {
      if (p.rights === L.user) pushMsg(L, { from: 'Скаутский отдел', kind: 'staff', title: `Истекли права на ${p.fn} ${p.ln}`, body: 'Игрок так и не приехал из КХЛ — права на него больше не действуют.' });
      delete p.rights;
      delete p.rightsUntil;
      continue;
    }
    if (p.team && !p.c && p.rightsUntil != null && p.rightsUntil < L.season + 1) {
      const t = p.team;
      p.team = null;
      p.st = ageOn(p.bd, L.date) >= 20 ? 'FA' : p.st;
      delete p.rightsUntil;
      if (t === L.user) pushMsg(L, { from: 'Скаутский отдел', kind: 'staff', title: `Истекли права на ${p.fn} ${p.ln}`, body: 'Мы не подписали проспекта вовремя — теперь он свободный агент.' });
    }
  }
}

function remindUser(L: League) {
  const exp = Object.values(L.players).filter((p) => p.team === L.user && p.c && p.c.last === L.season && !p.ext);
  if (!exp.length) return;
  const ufa = exp.filter((p) => p.c!.exp === 'UFA');
  const rfa = exp.filter((p) => p.c!.exp === 'RFA');
  pushMsg(L, {
    from: 'Ассистент GM', kind: 'staff',
    title: 'Завтра 1 июля — истекают контракты',
    body: `${ufa.length ? `Неограниченно свободные (уйдут на рынок): ${ufa.map((p) => p.ln).join(', ')}. ` : ''}${rfa.length ? `Ограниченно свободные (сохраним права квалификационным предложением): ${rfa.map((p) => p.ln).join(', ')}.` : ''}`,
    ref: { type: 'screen', id: 'extensions' },
  });
  L.stops.push('expiring');
}

function newLeagueYear(L: League) {
  const old = L.season;
  L.season = old + 1;
  activateExtensions(L);
  proNewLeagueYear(L);
  // Expiring contracts
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.c || p.c.last >= L.season || p.st === 'RET') continue;
    const team = p.team;
    const khl = !!team && L.teams[team]?.lg === 'KHL';
    const qualifies = khl ? p.ovr >= 60 || ageOn(p.bd, L.date) <= 22 : p.ovr >= 66 || ageOn(p.bd, L.date) <= 23;
    // The user's own player (player career) is never auto-qualified: he picks his next club.
    if (p.c.exp === 'RFA' && team && qualifies && L.pro?.pid !== p.id && !(khl && p.rights)) {
      // Qualifying offer: one more year at the same salary (min +5% for low salaries)
      const low = khl ? 120_000 : 1_000_000;
      const qo = Math.max(minSalaryFor(L, team), p.c.aav <= low ? roundSalary(p.c.aav * 1.05, khl ? 'KHL' : 'NHL') : p.c.aav);
      p.c = { aav: qo, last: L.season, type: 'STD', clause: null, exp: ageOn(p.bd, `${L.season + 1}-07-01`) >= 27 ? 'UFA' : 'RFA', signed: L.season };
      if (team === L.user) pushNews(L, { kind: 'sign', title: `${p.fn} ${p.ln} подписал квалификационное предложение: 1 × ${salaryText(qo, khl ? 'KHL' : 'NHL')}`, team, players: [p.id] });
    } else {
      makeFreeAgent(L, p);
    }
  }
  // Picks for a new draft year
  const y = L.season + 3;
  for (const t of leagueTeamIds(L, 'NHL')) for (let r = 1; r <= 7; r++) L.picks.push({ id: `${y}-${r}-${t}`, season: y, round: r, orig: t, owner: t });
  L.picks = L.picks.filter((p) => p.season >= L.season);
  // Next season's schedule
  let start = `${L.season}-09-29`;
  while (new Date(start + 'T12:00:00Z').getUTCDay() !== 2) start = addDays(start, 1);
  buildSeasonGames(L, start, L.season % 2 === 1);
  buildKhlSeason(L);
  applyOlympicBreak(L);
  L.deadline = (() => {
    const yy = L.season + 1;
    for (let d = 1; d <= 7; d++) {
      const iso = `${yy}-03-0${d}`;
      if (new Date(iso + 'T12:00:00Z').getUTCDay() === 5) return iso;
    }
    return `${yy}-03-05`;
  })();
  L.seasonLog = { trades: 0, signings: 0, spent: 0, userGames: { w: 0, l: 0 } };
  L.phase = 'freeagency';
  openFreeAgency(L);
  faDay(L);
  L.stops.push('fa');
}

function camp(L: League) {
  trainingCamp(L);
  replenishPool(L);
  khlYouthIntake(L);
  L.phase = 'preseason';
  for (const t of Object.values(L.teams)) {
    autoLines(L, t);
    if (t.id !== L.user || !t.captain) pickCaptain(L, t);
  }
  updateStrategies(L);
  if (isGM(L)) {
    const goal = ownerGoalFor(L, L.user);
    L.owner.goal = goal.goal;
    L.owner.goalText = goal.text;
    pushMsg(L, { from: `${L.owner.name}, владелец`, kind: 'owner', title: `Цели на сезон ${L.season}-${String((L.season + 1) % 100).padStart(2, '0')}`, body: `Мои ожидания: ${goal.text}.` });
  }
  L.stops.push('camp');
}

/** AI teams over the cap bury their worst contracts in the AHL (KHL: the farm club). */
export function aiCapCompliance(L: League, floor = true, only?: LeagueId) {
  const hits = allCapHits(L);
  for (const t of Object.values(L.teams)) {
    if (t.id === L.user || (only && lgOf(t) !== only)) continue;
    // Most clubs are fine: skip the expensive per-club work for them.
    const over = hits[t.id] > capFor(L, t.id);
    const under = floor && hits[t.id] < floorFor(L, t.id);
    if (!over && !under) continue;
    const khl = lgOf(t) === 'KHL';
    let guard = 0;
    // KHL farm contracts still count against the cap, so burying barely helps there.
    while (!khl && capSpace(L, t.id) < 0 && guard++ < 6) {
      const cand = Object.values(L.players)
        .filter((p) => p.team === t.id && p.st === 'NHL' && p.c && p.c.clause !== 'NMC')
        .sort((a, b) => (a.ovr - b.ovr) * 1 - (a.c!.aav - b.c!.aav) / 1e6)[0];
      if (!cand) break;
      cand.st = 'AHL';
    }
    // Still over: buy out the worst value contract (KHL: terminate it, at any time of year)
    let cut = 0;
    while ((floor || khl) && capSpace(L, t.id) < 0 && cut++ < (khl ? 3 : 1)) {
      const worst = Object.values(L.players)
        .filter((p) => p.team === t.id && p.c && p.c.clause !== 'NMC' && p.c.type !== 'ELC' && p.id !== L.pro?.pid)
        .sort((a, b) => (b.c!.aav - valueFor(L, b, t.id)) - (a.c!.aav - valueFor(L, a, t.id)))[0];
      if (!worst) break;
      buyout(L, worst);
    }
    // Under the floor: sign one-year deals until compliant
    const fl = floorFor(L, t.id);
    let g2 = 0;
    if (floor && capHit(L, t.id) < fl) {
      const foreign = foreignCounts(L);
      const pool = freeAgents(L);
      while (capHit(L, t.id) < fl && g2++ < 14 && contractCount(L, t.id) < 50) {
        const fa = pool.find((p) => !p.team && p.ovr >= (khl ? 60 : 64) && !signingBlock(L, p, t.id, foreign) && L.pro?.pid !== p.id);
        if (!fa) break;
        const aav = Math.max(minSalaryFor(L, t.id), roundSalary(Math.min(fl - capHit(L, t.id) + (khl ? 50_000 : 500_000), valueFor(L, fa, t.id) * 1.7), khl ? 'KHL' : 'NHL'));
        signFA(L, fa, { team: t.id, aav, years: 1, clause: null, day: L.date });
        countSigning(foreign, fa, t.id);
      }
    }
    if (floor || guard > 1 || cut) autoLines(L, t);
  }
}
