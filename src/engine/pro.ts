// Player career: the user creates one player and lives his career — from a KHL club to the NHL
// and beyond. Every club (including the player's own) is run by the AI; the user decides on
// contracts (offers come through the agent), training focus, and can ask the coach or the GM.
// Fairness: the player develops, plays and is selected by the same rules as everybody else.
import { genPlayer } from './gen';
import { capSpace, elcTerms, preferredYearsFor, roundSalary, salaryText, signContract, signELC, valueFor } from './contracts';
import { pushMsg, pushNews, social } from './news';
import { hash01, next, pick, poisson } from './rng';
import { retire } from './progression';
import { line, statKey } from './stats';
import type { GoalieLine, League, Player, ProOffer, SkaterLine } from './types';
import type { ProCreate } from './world';
import { addDays, ageOn, clamp, daysBetween } from './util';
import { LG_RU, lgOf, proPlayer } from './leagues';
import { foreignCount, isForeignFor } from './khlData';
import { KHL_FOREIGN_LIMIT } from './leagues';
import { unlock } from './achievements';
import { tradePlayerAway } from './trades';
import type { Country } from './names';

const AGENTS = ['Илья Ковальчук-младший', 'Дэн Милстейн', 'Пэт Брисон', 'Андрей Сулейманов', 'Марк Гандлер', 'Сергей Березин'];

/** Starting level by difficulty: rating now and the ceiling the player can grow to. */
export const PRO_START: Record<'rookie' | 'real' | 'hard', { ovr: number; pot: number }> = {
  rookie: { ovr: 72, pot: 90 },
  real: { ovr: 70, pot: 87 },
  hard: { ovr: 68, pot: 84 },
};

export function createProPlayer(L: League, o: ProCreate) {
  const club = L.teams[o.team] ? o.team : 'SKA';
  const lv = PRO_START[L.settings.difficulty];
  const country = (o.ctry || 'RUS') as Country;
  const p = genPlayer(L, { pos: o.pos, age: 18, country, ovr: lv.ovr, pot: lv.pot, league: lgOf(L.teams[club]), status: 'NHL', team: club });
  p.fn = o.fn.trim() || 'Иван';
  p.ln = o.ln.trim() || 'Петров';
  p.sh = o.sh ?? p.sh;
  p.num = o.num ?? 17 + (p.id % 70);
  // Born in 2008 (18 at the start): eligible for the 2027 NHL draft as a re-entry prospect.
  p.bd = `${L.season - 18}-${String(1 + (p.id % 8)).padStart(2, '0')}-${String(1 + (p.id % 27)).padStart(2, '0')}`;
  p.dy = L.season + 1;
  p.pers = { lead: 12, prof: 15, loy: 12, greed: 8, win: 15 };
  p.dev = 'N';
  p.morale = 75;
  p.ovr = lv.ovr;
  p.hist = [[L.season, p.ovr]];
  const khl = lgOf(L.teams[club]) === 'KHL';
  const aav = roundSalary(valueFor(L, p, club, L.season) * 1.1, khl ? 'KHL' : 'NHL');
  p.c = { aav, last: L.season + 1, type: 'STD', clause: null, exp: 'RFA', signed: L.season };
  p.lg = khl ? 'KHL' : 'NHL';
  L.pro = { pid: p.id, agent: pick(AGENTS), season0: L.season, offers: [], trust: 55, log: [] };
  L.gm.name = `${p.fn} ${p.ln}`;
  const t = L.teams[club];
  pushMsg(L, {
    from: `Главный тренер ${t.short}`, kind: 'staff',
    title: `Добро пожаловать в ${t.name}`,
    body: `Тебе 18, и у тебя контракт с основной командой на два сезона. Место в составе придётся выгрызать: тренер ставит в звенья по уровню игры. Летом ${L.season + 1} года — драфт НХЛ, скауты уже смотрят на тебя.`,
  });
  pushMsg(L, {
    from: `Агент ${L.pro.agent}`, kind: 'agent',
    title: 'Ваш агент на связи',
    body: 'Я веду ваши контракты. Когда клубы КХЛ или НХЛ сделают предложения, они появятся во вкладке «Контракт». Совет: тренируйте сильные стороны — фокус тренировок применяется в летнем лагере.',
  });
  pushNews(L, { kind: 'sign', title: `${t.short} подписывают 18-летнего ${p.fn} ${p.ln}`, team: club, players: [p.id] });
  return p;
}

// ---------- Season-level helpers ----------

/** Season totals of the player across leagues (regular season). */
export function proSeasonLine(p: Player, season: number) {
  const out: { lg: 'NHL' | 'KHL'; gp: number; g: number; a: number; pts: number; w?: number; sv?: number }[] = [];
  for (const lg of ['NHL', 'KHL'] as const) {
    const s = p.stats[statKey(season, false, lg)];
    if (!s || !s.gp) continue;
    if (p.pos === 'G') {
      const g = s as GoalieLine;
      out.push({ lg, gp: g.gp, g: 0, a: 0, pts: 0, w: g.w, sv: g.sa ? (g.sa - g.ga) / g.sa : 0 });
    } else {
      const k = s as SkaterLine;
      out.push({ lg, gp: k.gp, g: k.g, a: k.a, pts: k.pts });
    }
  }
  return out;
}

/** Line the coach currently uses the player on: 1..4 (F), 1..3 (D), 1..2 (G), 0 = not dressed. */
export function proRole(L: League, p: Player) {
  const t = p.team ? L.teams[p.team] : null;
  if (!t || p.st !== 'NHL') return 0;
  if (p.pos === 'G') return t.lines.g[0] === p.id ? 1 : t.lines.g.includes(p.id) ? 2 : 0;
  const lines = p.pos === 'D' ? t.lines.d : t.lines.f;
  const i = lines.findIndex((l) => l.includes(p.id));
  return i + 1;
}

/** Rating needed to move one line up (the weakest player of the line above). */
export function nextLineTarget(L: League, p: Player) {
  const t = p.team ? L.teams[p.team] : null;
  const role = proRole(L, p);
  if (!t || p.pos === 'G' || role <= 1) return null;
  const lines = p.pos === 'D' ? t.lines.d : t.lines.f;
  const above = role === 0 ? lines[lines.length - 1] : lines[role - 2];
  const ovrs = (above ?? []).map((id) => L.players[id]?.ovr ?? 0).filter((x) => x > 0);
  return ovrs.length ? Math.min(...ovrs) : null;
}

// ---------- Offers ----------

const grp = (p: Player) => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');

/** Would the club use the player? Interest 0..1+ from role, age/potential, rights, current club. */
function interest(L: League, p: Player, team: string) {
  const t = L.teams[team];
  const lg = lgOf(t);
  if (lg === 'NHL' && p.rights && p.rights !== team) return 0;
  // An NHL restricted free agent can only re-sign with his club (offer sheets are not modelled).
  const cur = p.team ? L.teams[p.team] : null;
  if (lg === 'NHL' && cur && lgOf(cur) === 'NHL' && p.c?.exp === 'RFA' && team !== p.team) return 0;
  if (lg === 'KHL' && isForeignFor(p, team) && foreignCount(L, team, p.id) >= KHL_FOREIGN_LIMIT) return 0;
  const slots = { F: 12, D: 6, G: 2 }[grp(p)];
  let better = 0;
  for (const id in L.players) {
    const x = L.players[id];
    if (x.team === team && x.st === 'NHL' && x.id !== p.id && grp(x) === grp(p) && x.ovr > p.ovr) better++;
  }
  const a = ageOn(p.bd, L.date);
  let want = better < slots - 2 ? 1.1 : better < slots ? 0.8 : better < slots + 3 ? 0.45 : 0.1;
  if (a <= 22 && p.pot >= (lg === 'NHL' ? 80 : 74)) want += 0.35;
  if (team === p.rights) want += 0.5;
  if (team === p.team) want += 0.25;
  // NHL clubs rarely sign players far from NHL level.
  if (lg === 'NHL' && p.ovr < 66 && !(a <= 21 && p.pot >= 82)) want -= 0.6;
  return want;
}

/** The season a newly agreed deal starts (deals agreed before July 1 start next season). */
function nextSeasonDeal(L: League) {
  return L.date.slice(5) < '07-01' && L.date.slice(5) >= '04-15';
}

/** Is the player looking for a club (contract ending, or no contract)? */
export function proOnMarket(L: League, p: Player) {
  if (L.pro?.pending) return false;
  if (!p.c || !p.team) return true;
  if (p.ext) return false;
  // Final season of the deal: talks open in May (after the KHL final) and run until July 1.
  const md = L.date.slice(5);
  return p.c.last <= L.season && md >= '05-01' && md < '07-01';
}

function makeOffer(L: League, p: Player, team: string, note: string): ProOffer | null {
  const lg = lgOf(L.teams[team]);
  const season = nextSeasonDeal(L) ? L.season + 1 : L.season;
  // Entry-level contract: first NHL deal of a player under 25.
  const hadNhlDeal = p.teams.some((t) => lgOf(L.teams[t]) === 'NHL') || p.c?.type === 'ELC' || Object.keys(p.stats).some((k) => /^\d{4}[rp]$/.test(k));
  const firstNhl = lg === 'NHL' && !hadNhlDeal && ageOn(p.bd, L.date) <= 24;
  let aav: number, years: number, kind: ProOffer['kind'];
  if (firstNhl) {
    const e = elcTerms(L, p);
    aav = e.aav; years = e.years; kind = 'ELC';
  } else {
    aav = roundSalary(valueFor(L, p, team, season) * (0.92 + next() * 0.2), lg);
    years = clamp(preferredYearsFor(L, p, team) + (next() < 0.3 ? -1 : 0), 1, lg === 'KHL' ? 4 : 6);
    kind = 'STD';
  }
  if (capSpace(L, team, season) < aav) return null;
  return { id: L.nextMsgId++, team, aav, years, kind, expires: addDays(L.date, 12), note };
}

/** Weekly: clubs interested in the player make offers through the agent. */
function refreshOffers(L: League, p: Player) {
  const P = L.pro!;
  P.offers = P.offers.filter((o) => o.expires >= L.date && L.teams[o.team]);
  if (!proOnMarket(L, p)) { P.offers = []; return; }
  const have = new Set(P.offers.map((o) => o.team));
  const cands = Object.values(L.teams)
    .filter((t) => !have.has(t.id))
    .map((t) => ({ t, w: interest(L, p, t.id) + (hash01(p.id, t.id.charCodeAt(0) * 31 + t.id.charCodeAt(2) + L.season) - 0.5) * 0.3 }))
    .filter((x) => x.w >= 0.6)
    .sort((a, b) => b.w - a.w)
    .slice(0, 6);
  const fresh: ProOffer[] = [];
  for (const { t, w } of cands) {
    if (P.offers.length + fresh.length >= 6) break;
    if (next() > clamp(w * 0.55, 0, 0.85)) continue;
    const note = t.id === p.rights ? 'клуб, владеющий вашими правами в НХЛ' : t.id === p.team ? 'ваш нынешний клуб' : t.strategy === 'contend' ? 'претендент на титул' : t.strategy === 'rebuild' ? 'перестройка: много игрового времени' : 'середняк лиги';
    const o = makeOffer(L, p, t.id, note);
    if (o) fresh.push(o);
  }
  if (fresh.length) {
    P.offers.push(...fresh);
    pushMsg(L, {
      from: `Агент ${P.agent}`, kind: 'agent',
      title: fresh.length === 1 ? `Предложение от ${L.teams[fresh[0].team].short}` : `${fresh.length} новых предложения`,
      body: fresh.map((o) => `${L.teams[o.team].name} (${LG_RU[lgOf(L.teams[o.team])]}): ${o.years} × ${salaryText(o.aav, lgOf(L.teams[o.team]))}${o.kind === 'ELC' ? ', контракт новичка' : ''} — ${o.note}`).join('\n') + '\nПредложения действуют 12 дней. Решение — во вкладке «Контракт».',
      ref: { type: 'screen', id: 'pro-contract' },
    });
    L.stops.push('pro-offer');
  }
}

/** The user accepts an offer. Deals agreed in spring start on July 1. */
export function acceptProOffer(L: League, offerId: number): { ok: boolean; message: string } {
  const P = L.pro, p = proPlayer(L);
  if (!P || !p) return { ok: false, message: 'Нет карьеры игрока.' };
  const o = P.offers.find((x) => x.id === offerId);
  if (!o || o.expires < L.date) return { ok: false, message: 'Предложение больше не действует.' };
  const t = L.teams[o.team];
  const lg = lgOf(t);
  if (nextSeasonDeal(L) && p.team && p.c && p.c.last >= L.season) {
    if (o.team === p.team && o.kind !== 'ELC') {
      signContract(L, p, o.team, { aav: o.aav, years: o.years, clause: null }, 'extend');
    } else {
      P.pending = { team: o.team, aav: o.aav, years: o.years, kind: o.kind };
    }
  } else if (o.kind === 'ELC') {
    signELC(L, p, o.team);
  } else {
    signContract(L, p, o.team, { aav: o.aav, years: o.years, clause: null }, 'new');
  }
  P.offers = [];
  pushNews(L, { kind: 'sign', important: true, title: `${p.fn} ${p.ln} подписывает контракт с ${t.name}: ${o.years} × ${salaryText(o.aav, lg)}`, team: o.team, players: [p.id] });
  const when = P.pending ? ' Переход состоится 1 июля.' : '';
  return { ok: true, message: `Контракт с ${t.short} подписан!${when}` };
}

export function declineProOffer(L: League, offerId: number) {
  if (L.pro) L.pro.offers = L.pro.offers.filter((o) => o.id !== offerId);
}

/** July 1: an agreed move to a new club takes effect. Called after the new league year begins. */
export function proNewLeagueYear(L: League) {
  const P = L.pro, p = proPlayer(L);
  if (!P || !p || !P.pending) return;
  const d = P.pending;
  delete P.pending;
  if (d.kind === 'ELC') signELC(L, p, d.team);
  else signContract(L, p, d.team, { aav: d.aav, years: d.years, clause: null }, 'new');
  pushMsg(L, { from: `Агент ${P.agent}`, kind: 'agent', title: `Вы — игрок ${L.teams[d.team].name}`, body: `С сегодняшнего дня действует ваш новый контракт (${d.years} × ${salaryText(d.aav, lgOf(L.teams[d.team]))}).` });
}

// ---------- Requests ----------

const COOLDOWN = 21;

export function proCanAsk(L: League) {
  const P = L.pro;
  return !!P && !P.retired && (!P.asked || daysBetween(P.asked, L.date) >= COOLDOWN);
}

/** "Coach, I want more ice time": an honest answer based on the depth chart. */
export function askIceTime(L: League): string {
  const P = L.pro!, p = proPlayer(L)!;
  P.asked = L.date;
  const role = proRole(L, p);
  const target = nextLineTarget(L, p);
  if (p.st !== 'NHL') {
    P.trust = clamp(P.trust - 3, 0, 100);
    return 'Тренер: «Пока ты в фарме. Набирай форму — как только станешь сильнее кого-то из основы, вернём тебя».';
  }
  if (role === 1) {
    P.trust = clamp(P.trust + 2, 0, 100);
    return 'Тренер: «Ты и так в первом звене. Продолжай в том же духе».';
  }
  if (target != null && p.ovr >= target - 1) {
    P.trust = clamp(P.trust + 3, 0, 100);
    p.morale = clamp(p.morale + 4, 0, 100);
    return `Тренер: «Ты почти дотягиваешь до звена выше (нужен уровень ~${target}). Добавь — и место твоё».`;
  }
  P.trust = clamp(P.trust - 4, 0, 100);
  p.morale = clamp(p.morale - 3, 0, 100);
  return `Тренер: «Рано. Чтобы подняться выше, нужен уровень ~${target ?? p.ovr + 3}. Работай на тренировках».`;
}

/** Ask the GM for a trade: the club looks for a partner in the same league. */
export function askTrade(L: League): string {
  const P = L.pro!, p = proPlayer(L)!;
  P.asked = L.date;
  if (!p.team || !p.c) return 'У вас нет клуба — агент ищет варианты.';
  const to = tradePlayerAway(L, p);
  if (!to) {
    P.trust = clamp(P.trust - 6, 0, 100);
    return 'GM: «Мы послушали рынок — достойных вариантов нет. Ты остаёшься».';
  }
  L.stops.push('pro-traded');
  return `Вас обменяли в ${L.teams[to].name}!`;
}

/** Ends the career (in the off-season, or at any time after 35). */
export function retirePro(L: League) {
  const P = L.pro, p = proPlayer(L);
  if (!P || !p) return;
  P.retired = true;
  P.offers = [];
  logSeason(L, L.season);
  retire(L, p);
  pushNews(L, { kind: 'retire', important: true, title: `${p.fn} ${p.ln} завершает карьеру`, players: [p.id] });
}

// ---------- Daily routine ----------

function logSeason(L: League, season: number) {
  const P = L.pro!, p = proPlayer(L)!;
  if (P.log.some((x) => x.season === season)) return;
  const lines = proSeasonLine(p, season);
  if (!lines.length) return;
  for (const x of lines) {
    const team = p.teams.slice().reverse().find((t) => lgOf(L.teams[t]) === x.lg) ?? p.team ?? '';
    P.log.push({ season, team, lg: x.lg, gp: x.gp, g: x.g, a: x.a, pts: x.pts, ovr: p.hist.find((h) => h[0] === season)?.[1] ?? p.ovr });
  }
}

interface Snap { team: string | null; st: string; inj: boolean; rights?: string; gp: number; g: number; nhlGp: number; pts: number; role: number }

function snap(L: League, p: Player): Snap {
  let gp = 0, g = 0, nhlGp = 0, pts = 0;
  for (const [k, v] of Object.entries(p.stats)) {
    if (!/^\d{4}[rp]K?$/.test(k)) continue;
    gp += v.gp;
    if ('g' in v) { g += v.g; pts += v.pts; }
    if (!k.endsWith('K')) nhlGp += v.gp;
  }
  return { team: p.team, st: p.st, inj: !!p.inj, rights: p.rights, gp, g, nhlGp, pts, role: proRole(L, p) };
}

let last: { pid: number; s: Snap } | null = null;

/** Called at the end of every simulated day. */
export function proDaily(L: League) {
  const P = L.pro, p = proPlayer(L);
  if (!P || !p || P.retired) return;
  const s = snap(L, p);
  const prev = last && last.pid === p.id ? last.s : s;
  last = { pid: p.id, s };
  farmGame(L, p);
  if (s.gp > 0) unlock(L, 'pro_debut');
  if (s.g > 0) unlock(L, 'pro_goal');
  if (s.nhlGp > 0) unlock(L, 'pro_nhl');
  if (s.pts >= 100) unlock(L, 'pro_100');
  if (prev.nhlGp === 0 && s.nhlGp > 0) {
    pushNews(L, { kind: 'milestone', important: true, title: `${p.fn} ${p.ln} дебютирует в НХЛ!`, players: [p.id], team: p.team ?? undefined });
    social(L, `Ещё один парень из КХЛ добрался до НХЛ: ${p.fn} ${p.ln} провёл первый матч 👏`, { kind: 'insider', players: [p.id] });
  }
  if (!prev.rights && s.rights && p.dr) {
    unlock(L, 'pro_drafted');
    pushMsg(L, { from: `Агент ${P.agent}`, kind: 'agent', title: `Вас выбрали на драфте НХЛ: №${p.dr.p}, ${L.teams[s.rights].name}`, body: `Права на вас принадлежат ${L.teams[s.rights].short} до ${(p.rightsUntil ?? L.season) + 1} года. Когда закончится ваш контракт в КХЛ, они смогут предложить контракт новичка.` });
    L.stops.push('pro-drafted');
  }
  if (prev.team !== s.team && s.team && prev.team) {
    pushMsg(L, { from: `Агент ${P.agent}`, kind: 'agent', title: `Новый клуб: ${L.teams[s.team].name}`, body: `Теперь вы играете за ${L.teams[s.team].name} (${LG_RU[lgOf(L.teams[s.team])]}).` });
    P.trust = 50;
  }
  if (!prev.inj && s.inj && p.inj) {
    pushMsg(L, { from: 'Медицинский штаб', kind: 'staff', title: `Травма: ${p.inj.type}`, body: `Восстановление займёт около ${p.inj.days} дн. Пропустите матчи до выздоровления.` });
    L.stops.push('injury');
  }
  if (prev.st !== s.st && s.team) {
    const farm = lgOf(L.teams[s.team]) === 'KHL' ? 'ВХЛ' : 'АХЛ';
    if (s.st === 'AHL') pushMsg(L, { from: `Главный тренер ${L.teams[s.team].short}`, kind: 'staff', title: `Вас отправили в фарм (${farm})`, body: 'Сейчас в основе есть игроки сильнее. Прогрессируй — и вернёшься.' });
    if (s.st === 'NHL' && prev.st === 'AHL') pushMsg(L, { from: `Главный тренер ${L.teams[s.team].short}`, kind: 'staff', title: 'Вас вызвали в основной состав', body: 'Ты заслужил шанс. Не упусти его.' });
  }
  if (s.role !== prev.role && s.role > 0 && prev.role > 0 && s.team === prev.team) {
    const up = s.role < prev.role;
    pushMsg(L, { from: `Главный тренер ${L.teams[s.team!].short}`, kind: 'staff', title: up ? `Повышение: ${s.role}-е звено` : `Вас опустили в ${s.role}-е звено`, body: up ? 'Доверие тренера растёт.' : 'Конкуренция в составе — нужно прибавлять.' });
  }
  // Weekly: coach trust follows form; the agent works the phones.
  if (new Date(L.date + 'T12:00:00Z').getUTCDay() === 1) {
    P.trust = clamp(Math.round(P.trust + p.form * 6 + (p.morale - 60) / 20), 0, 100);
    refreshOffers(L, p);
    // A healthy scratch is sent to the farm club for game time (he comes back once he beats a regular):
    // two weeks in a row in which the club played but he did not.
    const t = p.team ? L.teams[p.team] : null;
    const clubPlayed = !!t?.lastGame && t.lastGame >= addDays(L.date, -6);
    const scratched = !!t && p.st === 'NHL' && !p.inj && clubPlayed && s.gp === (P.gpMark ?? -1);
    P.gpMark = s.gp;
    if (scratched && (P.scratch = (P.scratch ?? 0) + 1) >= 2) {
      p.st = 'AHL';
      P.scratch = 0;
    } else if (!scratched) P.scratch = 0;
  }
  // Season log at training camp; titles at the end of each league's season.
  if (L.date.slice(5) === '09-01') logSeason(L, L.season - 1);
  const ut = p.team;
  if (ut && L.khl?.playoffs?.champion === ut && !L.flags[`progag${L.season}`] && p.stats[statKey(L.season, true, 'KHL')]) {
    L.flags[`progag${L.season}`] = true;
    unlock(L, 'pro_gagarin');
  }
  if (ut && L.playoffs?.champion === ut && !L.flags[`procup${L.season}`] && p.stats[statKey(L.season, true)]) {
    L.flags[`procup${L.season}`] = true;
    unlock(L, 'pro_cup');
  }
  if (p.awards.some((a) => !a.startsWith('potm') && !a.startsWith('khl-cup'))) unlock(L, 'pro_award');
  // Late career: the body says when.
  if (ageOn(p.bd, L.date) >= 42 && L.date.slice(5) === '07-02') retirePro(L);
}

// ---------- Farm games ----------

/** Farm (AHL/VHL) games are not simulated; the player gets an estimated line when his club plays. */
export const farmKey = (season: number) => `${season}rF`;

function farmGame(L: League, p: Player) {
  const t = p.team ? L.teams[p.team] : null;
  if (!t || p.st !== 'AHL' || p.inj || t.lastGame !== L.date) return;
  const level = lgOf(t) === 'KHL' ? 62 : 66;
  const l = line(p, farmKey(L.season));
  if (p.pos === 'G') {
    if (next() > 0.6) return; // goalies split the net
    const g = l as GoalieLine;
    const sa = 22 + Math.floor(next() * 14);
    const sv = clamp(0.905 + (p.ovr - level) * 0.0015 + (next() - 0.5) * 0.06, 0.82, 0.97);
    const ga = Math.round(sa * (1 - sv));
    g.gp++; g.gs++; g.sa += sa; g.ga += ga; g.toi += 3600;
    if (next() < clamp(0.5 + (p.ovr - level) * 0.012, 0.3, 0.75)) g.w++; else g.l++;
    if (ga === 0) g.so++;
    return;
  }
  if (next() > 0.86) return; // farm leagues play fewer games than the parent club
  const k = l as SkaterLine;
  const lam = clamp(0.35 + (p.ovr - level) * 0.045, 0.08, 1.2) * (p.pos === 'D' ? 0.6 : 1);
  const pts = poisson(lam);
  let g = 0;
  for (let i = 0; i < pts; i++) if (next() < (p.pos === 'D' ? 0.3 : 0.42)) g++;
  k.gp++; k.g += g; k.a += pts - g; k.pts += pts; k.toi += 900 + Math.floor(next() * 400);
}
