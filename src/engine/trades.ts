// Trades: asset valuation, AI decision-making, AI↔AI deals and offers to the user.
import { autoLines, teamPower, validateLines } from './lines';
import { beforeNewLeagueYear, capSpace, contractCount, marketValue } from './contracts';
import { hash01, next, pick, shuffle } from './rng';
import { pushMsg, pushNews, social } from './news';
import { projectOvr } from './progression';
import { sortedTeams } from './standings';
import type { DraftPick, League, Player, Strategy, TradeAsset, TradeOffer, TradeRecord } from './types';
import { addDays, ageOn, clamp, fullName } from './util';
import { careerSkater } from './stats';

const STRAT: Record<Strategy, { d: number; ice: number; sur: number; pick: number }> = {
  contend: { d: 0.62, ice: 1.0, sur: 0.35, pick: 0.75 },
  bubble: { d: 0.8, ice: 0.8, sur: 0.5, pick: 1.0 },
  rebuild: { d: 0.93, ice: 0.55, sur: 0.6, pick: 1.3 },
};

export const W = (ovr: number) => Math.pow(Math.max(0, ovr - 64), 1.9) / 10;

export function tradesOpen(L: League) {
  if (L.phase === 'playoffs') return false;
  if (L.phase === 'regular' && L.date > L.deadline) return false;
  if (L.phase === 'freeagency' && L.fa?.day && L.fa.day < 1) return false;
  return true;
}

function seasonFraction(L: League) {
  if (L.phase !== 'regular') return 1;
  const played = L.teams[L.user]?.rec.gp ?? 0;
  return Math.max(0.1, (84 - played) / 84);
}

/** Value of a player for a given team (strategy-dependent). */
export function playerValue(L: League, p: Player, team: string): number {
  const strat = STRAT[L.teams[team]?.strategy ?? 'bubble'];
  const a = ageOn(p.bd, L.date);
  // AI scouting noise on potential (each club evaluates differently)
  const noise = (hash01(p.id, team.charCodeAt(0) * 13 + team.charCodeAt(1)) - 0.5) * 4;
  const q: Player = { ...p, pot: clamp(p.pot + noise, p.ovr, 99) };
  let v = 0;
  const c = p.c ?? p.ext;
  const startSeason = beforeNewLeagueYear(L) ? L.season + 1 : L.season;
  if (c && c.last >= startSeason) {
    const yrs = c.last - startSeason + 1 + (p.ext && p.c ? p.ext.last - p.c.last : 0);
    let control = yrs;
    if (c.exp === 'RFA' && a + yrs < 27) control += 2;
    for (let t = 0; t < Math.min(control, 8); t++) {
      const ovr = projectOvr(q, a, t);
      const frac = t === 0 ? seasonFraction(L) : 1;
      const injured = t === 0 && p.inj ? Math.max(0, 1 - p.inj.days / 170) : 1;
      const aav = t < yrs ? (p.ext && p.c && startSeason + t > p.c.last ? p.ext.aav : c.aav) : marketValue(L, { ...p, ovr } as Player);
      const mv = marketValue(L, { ...p, ovr: Math.round(ovr) } as Player);
      const surplus = ((mv - aav) / 1e6) * 3;
      v += Math.pow(strat.d, t) * (strat.ice * W(ovr) * frac * injured + strat.sur * surplus * frac);
    }
  } else {
    // Unsigned prospect / draft rights
    const delay = Math.max(0, Math.ceil((72 - p.ovr) / 4));
    for (let t = delay; t < delay + 4; t++) {
      const ovr = projectOvr(q, a, t);
      v += Math.pow(strat.d, t) * strat.ice * W(ovr) * 0.75;
    }
  }
  if (strat === STRAT.rebuild) {
    if (a <= 24) v *= 1.15;
    else if (a >= 31) v *= 0.7;
  }
  if (p.wantsTrade && p.team === team) v *= 0.85;
  return v;
}

export function projectedSlot(L: League, pk: DraftPick) {
  const draftYear = L.draft && !L.draft.done ? L.draft.year : L.season + 1;
  if (pk.slot) return pk.slot;
  const ahead = pk.season - draftYear;
  let rank: number;
  if (L.phase === 'regular' && (L.teams[pk.orig]?.rec.gp ?? 0) > 10) {
    const st = sortedTeams(L);
    rank = 32 - st.findIndex((t) => t.id === pk.orig);
  } else {
    const pw = Object.values(L.teams).map((t) => ({ id: t.id, p: teamPower(L, t) })).sort((a, b) => a.p - b.p);
    rank = pw.findIndex((x) => x.id === pk.orig) + 1;
  }
  const reg = ahead <= 0 ? 1 : ahead === 1 ? 0.5 : 0.25;
  const slot = 16.5 + (rank - 16.5) * reg;
  return Math.round(slot + (pk.round - 1) * 32);
}

export function pickValue(L: League, pk: DraftPick, team: string) {
  const strat = STRAT[L.teams[team]?.strategy ?? 'bubble'];
  const slot = projectedSlot(L, pk);
  const draftYear = L.draft && !L.draft.done ? L.draft.year : L.season + 1;
  const ahead = Math.max(0, pk.season - draftYear);
  const base = 45 * Math.exp(-(slot - 1) / 10) + 6 * Math.exp(-(slot - 1) / 60);
  return base * strat.pick * Math.pow(0.85, ahead);
}

export function packageValue(L: League, a: TradeAsset, team: string) {
  const vals: number[] = [];
  for (const id of a.players) {
    const p = L.players[id];
    let v = playerValue(L, p, team);
    const ret = a.retain?.[id] ?? 0;
    if (ret && p.c) v += (((p.c.aav * ret) / 1e6) * 3 * STRAT[L.teams[team]?.strategy ?? 'bubble'].sur) * Math.max(1, p.c.last - L.season + 1) * 0.8;
    vals.push(v);
  }
  for (const id of a.picks) {
    const pk = L.picks.find((x) => x.id === id);
    if (pk) vals.push(pickValue(L, pk, team));
  }
  const pos = vals.filter((v) => v > 0);
  const neg = vals.filter((v) => v < 0).reduce((x, y) => x + y, 0);
  const P = 1.5;
  const agg = Math.pow(pos.reduce((x, v) => x + Math.pow(v, P), 0), 1 / P);
  return agg + neg;
}

export interface TradeCheck {
  ok: boolean;
  reason?: string;
}

/** Legal checks for a trade between teams a (gives aGives) and b (gives bGives). */
export function checkTrade(L: League, a: string, b: string, aGives: TradeAsset, bGives: TradeAsset): TradeCheck {
  if (!tradesOpen(L)) return { ok: false, reason: L.phase === 'playoffs' ? 'Во время плей-офф обмены запрещены.' : 'Дедлайн обменов прошёл. Обмены откроются после плей-офф.' };
  if (!aGives.players.length && !aGives.picks.length) return { ok: false, reason: 'Добавьте, что вы отдаёте.' };
  if (!bGives.players.length && !bGives.picks.length) return { ok: false, reason: 'Добавьте, что вы получаете.' };
  const season = beforeNewLeagueYear(L) ? L.season + 1 : L.season;
  const aav = (ids: number[], ret?: Record<number, number>) =>
    ids.reduce((s, id) => {
      const p = L.players[id];
      const c = p.c && p.c.last >= season ? p.c : null;
      return s + (c && (p.st === 'NHL' || season > L.season) ? c.aav * (1 - (ret?.[id] ?? 0)) : 0);
    }, 0);
  const retainedOut = (ids: number[], ret?: Record<number, number>) => ids.reduce((s, id) => s + (L.players[id].c?.aav ?? 0) * (ret?.[id] ?? 0), 0);
  const aIn = aav(bGives.players, bGives.retain), aOut = aav(aGives.players, aGives.retain) + 0;
  const bIn = aav(aGives.players, aGives.retain), bOut = aav(bGives.players, bGives.retain);
  const aSpace = capSpace(L, a, season) + aOut - aIn - retainedOut(aGives.players, aGives.retain) * 0;
  const bSpace = capSpace(L, b, season) + bOut - bIn;
  if (aSpace < 0) return { ok: false, reason: `${L.teams[a].short}: сделка не помещается под потолок (−$${(-aSpace / 1e6).toFixed(2)}M).` };
  if (bSpace < 0) return { ok: false, reason: `${L.teams[b].short}: у них не хватает места под потолком (−$${(-bSpace / 1e6).toFixed(2)}M). Попробуйте удержать часть зарплаты.` };
  const cnt = (t: string, inN: number, outN: number) => contractCount(L, t) + inN - outN;
  const signed = (ids: number[]) => ids.filter((id) => L.players[id].c).length;
  if (cnt(a, signed(bGives.players), signed(aGives.players)) > 50) return { ok: false, reason: `${L.teams[a].short}: превышен лимит 50 контрактов.` };
  if (cnt(b, signed(aGives.players), signed(bGives.players)) > 50) return { ok: false, reason: `${L.teams[b].short}: превышен лимит 50 контрактов.` };
  for (const [g, side] of [[aGives, a], [bGives, b]] as const) {
    const ret = Object.entries(g.retain ?? {}).filter(([, v]) => v > 0);
    if (ret.some(([, v]) => v > 0.5)) return { ok: false, reason: 'Удержать можно не больше 50% зарплаты.' };
    const existing = Object.values(L.players).filter((p) => p.c?.retainedBy?.some((r) => r.team === side)).length;
    if (existing + ret.length > 3) return { ok: false, reason: `${L.teams[side].short}: не больше 3 контрактов с удержанием одновременно.` };
  }
  for (const id of [...aGives.players, ...bGives.players]) {
    const p = L.players[id];
    const dest = aGives.players.includes(id) ? b : a;
    if (p.c?.clause === 'NTC' && ntcBlocks(p, dest)) return { ok: false, reason: `${fullName(p)}: ${L.teams[dest].short} в его списке запрещённых клубов (NTC).` };
  }
  return { ok: true };
}

export function ntcBlocks(p: Player, team: string) {
  return hash01(p.id, team.charCodeAt(0) * 7 + team.charCodeAt(1) * 3 + team.charCodeAt(2)) < 0.3;
}

/** Players with an NMC must approve. Deterministic per player/destination so retries don't reroll. */
export function nmcConsent(L: League, p: Player, dest: string) {
  if (p.c?.clause !== 'NMC') return true;
  const t = L.teams[dest];
  const base = t.strategy === 'contend' ? 0.65 : t.strategy === 'bubble' ? 0.4 : 0.15;
  const unhappy = p.wantsTrade ? 0.4 : p.morale < 40 ? 0.15 : 0;
  return hash01(p.id, dest.charCodeAt(0) + dest.charCodeAt(2) * 11 + L.season) < base + unhappy;
}

export interface AIResponse {
  accept: boolean;
  message: string;
  counter?: TradeAsset; // additional assets requested from the user
  mood: number; // -1..1 for the UI meter
}

function margin(L: League, give: number, team: string) {
  const d = L.settings.difficulty;
  const rel = L.teams[team].rel;
  const base = d === 'rookie' ? 0.0 : d === 'hard' ? 0.14 : 0.07;
  const relAdj = (50 - rel) / 500;
  return Math.max(d === 'rookie' ? 0 : 1.5, give * (base + relAdj));
}

/** The AI team `ai` evaluates receiving `get` and giving `give`. */
export function evaluateForAI(L: League, ai: string, give: TradeAsset, get: TradeAsset): AIResponse {
  const vGive = packageValue(L, give, ai);
  const vGet = packageValue(L, get, ai);
  // Roster spots: taking more bodies than you send costs a little
  const extra = Math.max(0, get.players.length - give.players.length);
  const gain = vGet - vGive - extra * 1.5;
  const need = margin(L, vGive, ai);
  const mood = clamp((gain - need) / Math.max(8, vGive * 0.4), -1, 1);
  for (const id of give.players) {
    const p = L.players[id];
    if (!nmcConsent(L, p, L.user)) return { accept: false, message: `${fullName(p)} отказывается снимать запрет на обмен (NMC).`, mood: -1 };
  }
  if (gain >= need) return { accept: true, message: pick(['По рукам!', 'Нас это устраивает. Сделка.', 'Хорошая сделка для обеих сторон.']), mood };
  // Counter: ask for one more asset from the user's side
  const deficit = need - gain;
  const counter = findFiller(L, ai, deficit, get, give);
  if (counter && deficit < vGive * 0.6 + 10) {
    const names = [...counter.players.map((id) => fullName(L.players[id])), ...counter.picks.map((id) => pickLabel(L, id))];
    return { accept: false, message: `Почти. Добавьте ${names.join(' и ')} — и мы договоримся.`, counter, mood };
  }
  return { accept: false, message: gain < -vGive * 0.4 ? 'Это несерьёзное предложение.' : 'Нам этого недостаточно.', mood };
}

/** Finds the cheapest additional user asset that closes the value gap for the AI team. */
function findFiller(L: League, ai: string, deficit: number, already: TradeAsset, give: TradeAsset): TradeAsset | null {
  const user = L.user;
  const cands: { asset: TradeAsset; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team !== user || already.players.includes(p.id) || p.st === 'RET') continue;
    if (p.c?.clause === 'NMC') continue;
    const v = playerValue(L, p, ai);
    if (v > 0) cands.push({ asset: { players: [p.id], picks: [] }, v });
  }
  for (const pk of L.picks) {
    if (pk.owner !== user || already.picks.includes(pk.id) || pk.used) continue;
    cands.push({ asset: { players: [], picks: [pk.id] }, v: pickValue(L, pk, ai) });
  }
  // p-norm aggregation: adding v to a package of value V increases it less than v
  const base = packageValue(L, already, ai);
  const ok = cands
    .map((c) => ({ ...c, added: packageValue(L, { players: [...already.players, ...c.asset.players], picks: [...already.picks, ...c.asset.picks] }, ai) - base }))
    .filter((c) => c.added >= deficit)
    .sort((a, b) => a.added - b.added);
  void give;
  return ok[0]?.asset ?? null;
}

/** "What would you want for X?" — AI builds a request from the user's assets. */
export function askPrice(L: League, ai: string, want: TradeAsset): TradeAsset | null {
  const vWant = packageValue(L, want, ai);
  const target = vWant + margin(L, vWant, ai) + 0.5;
  const user = L.user;
  const assets: { a: TradeAsset; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team !== user || p.st === 'RET' || p.c?.clause === 'NMC') continue;
    const v = playerValue(L, p, ai);
    if (v > 1) assets.push({ a: { players: [p.id], picks: [] }, v });
  }
  for (const pk of L.picks) if (pk.owner === user && !pk.used) assets.push({ a: { players: [], picks: [pk.id] }, v: pickValue(L, pk, ai) });
  assets.sort((a, b) => b.v - a.v);
  // Single asset close to the target?
  const single = assets.filter((x) => x.v >= target).sort((a, b) => a.v - b.v)[0];
  if (single && single.v <= target * 1.5) return single.a;
  // Greedy build: biggest assets that don't overshoot too much
  const res: TradeAsset = { players: [], picks: [] };
  for (const x of assets) {
    const cur = packageValue(L, res, ai);
    if (cur >= target) break;
    const nextV = packageValue(L, { players: [...res.players, ...x.a.players], picks: [...res.picks, ...x.a.picks] }, ai);
    if (nextV > target * 1.6 && cur > 0) continue;
    res.players.push(...x.a.players);
    res.picks.push(...x.a.picks);
    if (res.players.length + res.picks.length >= 4) break;
  }
  return packageValue(L, res, ai) >= target ? res : single?.a ?? null;
}

export function pickLabel(L: League, id: string) {
  const pk = L.picks.find((p) => p.id === id);
  if (!pk) return id;
  const own = pk.orig !== pk.owner ? ` (${pk.orig})` : '';
  return `${pk.round}-й раунд ${pk.season}${own}`;
}

function grade(v: number) {
  if (v >= 18) return 'A+';
  if (v >= 9) return 'A';
  if (v >= 4) return 'B+';
  if (v >= -4) return 'B';
  if (v >= -9) return 'C';
  if (v >= -18) return 'D';
  return 'F';
}

/** Executes a trade: a gives aGives to b, b gives bGives to a. */
export function executeTrade(L: League, a: string, b: string, aGives: TradeAsset, bGives: TradeAsset): TradeRecord {
  // Neutral grades (from each team's own perspective)
  const gA = packageValue(L, bGives, a) - packageValue(L, aGives, a);
  const gB = packageValue(L, aGives, b) - packageValue(L, bGives, b);
  const move = (ids: number[], from: string, to: string, ret?: Record<number, number>) => {
    for (const id of ids) {
      const p = L.players[id];
      const r = ret?.[id] ?? 0;
      if (r > 0 && p.c) {
        (p.c.retainedBy ??= []).push({ team: from, amount: Math.round(p.c.aav * r) });
      }
      p.team = to;
      if (!p.teams.includes(to)) p.teams.push(to);
      if (p.st === 'NHL' || p.st === 'AHL') p.st = p.ovr >= 70 ? 'NHL' : p.st;
      p.wantsTrade = false;
      p.morale = clamp(p.morale + (L.teams[to].strategy === 'contend' ? 5 : -3), 0, 100);
      delete L.negotiations[id];
      if (to === L.user && !L.album.includes(id)) L.album.push(id);
    }
  };
  move(aGives.players, a, b, aGives.retain);
  move(bGives.players, b, a, bGives.retain);
  for (const id of aGives.picks) { const pk = L.picks.find((x) => x.id === id); if (pk) pk.owner = b; }
  for (const id of bGives.picks) { const pk = L.picks.find((x) => x.id === id); if (pk) pk.owner = a; }
  for (const t of [a, b]) {
    const team = L.teams[t];
    const removed = new Set([...aGives.players, ...bGives.players]);
    team.lines.f = team.lines.f.map((l) => l.filter((x) => !removed.has(x) || L.players[x].team === t));
    team.lines.d = team.lines.d.map((l) => l.filter((x) => !removed.has(x) || L.players[x].team === t));
    team.lines.g = team.lines.g.filter((x) => !removed.has(x) || L.players[x].team === t);
    if (t !== L.user || team.lines.auto) autoLines(L, team);
    else validateLines(L, team);
    if (team.captain && L.players[team.captain]?.team !== t) team.captain = null;
  }
  const names = (x: TradeAsset) => [...x.players.map((id) => fullName(L.players[id])), ...x.picks.map((id) => pickLabel(L, id))];
  const rec: TradeRecord = {
    id: L.nextMsgId++, date: L.date, season: L.season, a, b,
    aGets: { ...bGives, names: names(bGives) },
    bGets: { ...aGives, names: names(aGives) },
    grades: { a: grade(gA), b: grade(gB) },
    user: a === L.user || b === L.user,
  };
  L.trades.unshift(rec);
  const ta = L.teams[a], tb = L.teams[b];
  pushNews(L, {
    kind: 'trade',
    title: `Обмен: ${ta.short} ↔ ${tb.short}`,
    body: `${ta.short} получают: ${rec.aGets.names.join(', ')}\n${tb.short} получают: ${rec.bGets.names.join(', ')}`,
    team: a, players: [...aGives.players, ...bGives.players],
    important: rec.user, grade: `${ta.short} ${rec.grades!.a} · ${tb.short} ${rec.grades!.b}`,
  });
  if (rec.user) {
    L.seasonLog.trades++;
    const other = a === L.user ? b : a;
    const userGrade = a === L.user ? rec.grades!.a : rec.grades!.b;
    L.teams[other].rel = clamp(L.teams[other].rel + (userGrade.startsWith('A') ? -6 : userGrade === 'B' || userGrade === 'B+' ? 2 : 4), 0, 100);
    const top = [...aGives.players, ...bGives.players].map((id) => L.players[id]).sort((x, y) => y.ovr - x.ovr)[0];
    social(L, `Оценка сделки: ${L.teams[L.user].short} — ${userGrade}. ${userGrade.startsWith('A') ? 'Грабёж средь бела дня!' : userGrade.startsWith('B') ? 'Разумный обмен.' : 'Фанаты в недоумении.'}`, { kind: 'analyst', team: L.user, players: top ? [top.id] : [] });
  }
  return rec;
}

/** Revisit user trades made three seasons ago. */
export function regradeTrades(L: League) {
  for (const t of L.trades) {
    if (!t.user || t.regrade || L.season - t.season < 3) continue;
    const impact = (ids: number[]) =>
      ids.reduce((s, id) => {
        const p = L.players[id];
        if (!p) return s;
        let v = 0;
        for (let y = t.season; y <= L.season; y++) {
          const st = p.stats[`${y}r`];
          if (st && p.teams.includes(t.a === L.user ? t.a : t.b)) v += 'pts' in st ? st.pts : st.w * 2;
        }
        return s + v + p.ovr * 0.2;
      }, 0);
    const a = impact(t.aGets.players), b = impact(t.bGets.players);
    const diff = a - b;
    t.regrade = { a: grade(diff / 4), b: grade(-diff / 4), note: `Спустя 3 года: ${L.teams[t.a].short} ${diff >= 0 ? 'выиграли' : 'проиграли'} обмен` };
    pushNews(L, { kind: 'trade', title: `Пересмотр сделки ${t.season}: ${t.regrade.note}`, body: `${L.teams[t.a].short}: ${t.grades?.a} → ${t.regrade.a} · ${L.teams[t.b].short}: ${t.grades?.b} → ${t.regrade.b}` });
  }
}

// ---------- Weekly AI activity ----------

export function weeklyTradeActivity(L: League) {
  if (!tradesOpen(L)) return;
  const nearDeadline = L.phase === 'regular' && L.date >= addDays(L.deadline, -14);
  const n = nearDeadline ? 3 : 1;
  for (let i = 0; i < n; i++) if (next() < 0.55) aiToAiTrade(L);
  if (next() < (nearDeadline ? 0.6 : 0.3)) offerToUser(L);
  // Expire old offers
  L.offers = L.offers.filter((o) => o.expires >= L.date);
}

function aiToAiTrade(L: League) {
  const teams = Object.values(L.teams).filter((t) => t.id !== L.user);
  const buyers = shuffle(teams.filter((t) => t.strategy === 'contend'));
  const sellers = shuffle(teams.filter((t) => t.strategy === 'rebuild' || t.strategy === 'bubble'));
  const buyer = buyers[0], seller = sellers[0];
  if (!buyer || !seller) return;
  const vets = Object.values(L.players).filter((p) => {
    if (p.team !== seller.id || p.st !== 'NHL' || p.ovr < 76 || !p.c || p.c.clause === 'NMC') return false;
    const a = ageOn(p.bd, L.date);
    // Rebuilding clubs sell veterans, not their young core
    return a >= 27 && !(p.ovr >= 86 && a <= 28);
  });
  if (!vets.length) return;
  const target = pick(vets);
  const give: TradeAsset = { players: [target.id], picks: [] };
  const price = askPriceFrom(L, seller.id, buyer.id, give);
  if (!price) return;
  if (!checkTrade(L, seller.id, buyer.id, give, price).ok) return;
  const gSeller = packageValue(L, price, seller.id) - packageValue(L, give, seller.id);
  const gBuyer = packageValue(L, give, buyer.id) - packageValue(L, price, buyer.id);
  const vGive = packageValue(L, give, buyer.id);
  // Both sides must gain by their own valuation, and nobody gets fleeced by a wide margin.
  if (gSeller >= 0 && gBuyer >= -1 && gBuyer <= vGive * 0.35) executeTrade(L, seller.id, buyer.id, give, price);
}

/** Like askPrice but between two AI teams: what `seller` wants from `buyer`. */
function askPriceFrom(L: League, seller: string, buyer: string, want: TradeAsset): TradeAsset | null {
  const target = packageValue(L, want, seller) * 1.03;
  const assets: { a: TradeAsset; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team !== buyer || p.st === 'RET' || p.c?.clause === 'NMC') continue;
    if (p.st === 'NHL' && p.ovr >= 80) continue; // contenders keep their core
    const v = playerValue(L, p, seller);
    if (v > 1) assets.push({ a: { players: [p.id], picks: [] }, v });
  }
  for (const pk of L.picks) if (pk.owner === buyer && !pk.used && pk.round <= 3) assets.push({ a: { players: [], picks: [pk.id] }, v: pickValue(L, pk, seller) });
  assets.sort((a, b) => b.v - a.v);
  const res: TradeAsset = { players: [], picks: [] };
  for (const x of assets) {
    if (packageValue(L, res, seller) >= target) break;
    const nv = packageValue(L, { players: [...res.players, ...x.a.players], picks: [...res.picks, ...x.a.picks] }, seller);
    if (nv > target * 1.5) continue;
    res.players.push(...x.a.players);
    res.picks.push(...x.a.picks);
    if (res.players.length + res.picks.length >= 3) break;
  }
  return packageValue(L, res, seller) >= target ? res : null;
}

function offerToUser(L: League) {
  const user = L.user;
  const mine = Object.values(L.players).filter((p) => p.team === user && (p.st === 'NHL' || p.st === 'AHL') && p.c && p.c.clause !== 'NMC' && p.ovr >= 72);
  if (!mine.length) return;
  const target = pick(mine);
  const teams = shuffle(Object.values(L.teams).filter((t) => t.id !== user));
  for (const t of teams.slice(0, 6)) {
    const want: TradeAsset = { players: [target.id], picks: [] };
    const vTarget = playerValue(L, target, t.id);
    if (vTarget < 6) continue;
    // AI offers assets it values a bit less than the target
    const assets: { a: TradeAsset; v: number }[] = [];
    for (const id in L.players) {
      const p = L.players[id];
      if (p.team !== t.id || p.st === 'RET' || p.c?.clause === 'NMC') continue;
      const v = playerValue(L, p, t.id);
      if (v > 1 && v < vTarget) assets.push({ a: { players: [p.id], picks: [] }, v });
    }
    for (const pk of L.picks) if (pk.owner === t.id && !pk.used && pk.round <= 4) assets.push({ a: { players: [], picks: [pk.id] }, v: pickValue(L, pk, t.id) });
    shuffle(assets);
    const give: TradeAsset = { players: [], picks: [] };
    for (const x of assets) {
      const nv = packageValue(L, { players: [...give.players, ...x.a.players], picks: [...give.picks, ...x.a.picks] }, t.id);
      if (nv > vTarget * 0.95) continue;
      give.players.push(...x.a.players);
      give.picks.push(...x.a.picks);
      if (packageValue(L, give, t.id) > vTarget * 0.8 || give.players.length + give.picks.length >= 3) break;
    }
    if (!give.players.length && !give.picks.length) continue;
    if (!checkTrade(L, user, t.id, want, give).ok) continue;
    const offer: TradeOffer = {
      id: L.nextMsgId++,
      date: L.date,
      from: t.id,
      give,
      get: want,
      note: `${t.name} интересуются ${fullName(target)}`,
      expires: addDays(L.date, 4),
    };
    L.offers.push(offer);
    pushMsg(L, {
      from: `GM ${t.name}`, kind: 'trade',
      title: `Предложение обмена: ${fullName(target)}`,
      body: `Мы готовы отдать: ${[...give.players.map((id) => `${fullName(L.players[id])} (${L.players[id].ovr})`), ...give.picks.map((id) => pickLabel(L, id))].join(', ')}. Предложение действует 4 дня.`,
      ref: { type: 'trade', id: offer.id },
    });
    L.stops.push('offer');
    return;
  }
}

export function acceptOffer(L: League, offerId: number) {
  const o = L.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'Предложение больше не действует.' };
  const chk = checkTrade(L, L.user, o.from, o.get, o.give);
  if (!chk.ok) return chk;
  executeTrade(L, L.user, o.from, o.get, o.give);
  L.offers = L.offers.filter((x) => x.id !== offerId);
  return { ok: true };
}

/** Trade block: AI teams interested in a player and what they'd give (rough). */
export function interestIn(L: League, p: Player) {
  return Object.values(L.teams)
    .filter((t) => t.id !== p.team)
    .map((t) => ({ t, v: playerValue(L, p, t.id) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);
}

export { careerSkater };
