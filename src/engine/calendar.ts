// Seasonal events: player of the month, All-Star Game, World Juniors.
import { pushMsg, pushNews, social } from './news';
import { draftPool } from './draft';
import { statKey } from './stats';
import type { GoalieLine, League, SkaterLine } from './types';
import { clamp } from './util';
import { next } from './rng';
import { isOlympicYear } from './intl';

export function calendarEvents(L: League) {
  const md = L.date.slice(5);
  if (L.phase !== 'regular') return;
  if (md.endsWith('-01') && L.date > L.seasonStart) playerOfMonth(L);
  if (md === '01-06' && !L.flags[`wjc${L.season}`]) worldJuniors(L);
  // No All-Star Game in Olympic seasons (the league pauses for the Olympics instead).
  if (md === '01-31' && !L.flags[`asg${L.season}`] && !isOlympicYear(L.season + 1)) allStar(L);
}

function playerOfMonth(L: League) {
  const key = statKey(L.season, false);
  const snap = L.monthSnap ?? {};
  let best: { id: number; v: number } | null = null;
  let bestG: { id: number; v: number } | null = null;
  const nextSnap: Record<number, number> = {};
  for (const id in L.players) {
    const p = L.players[id];
    const s = p.stats[key];
    if (!s) continue;
    if (p.pos === 'G') {
      const g = s as GoalieLine;
      const v = g.w * 2 + g.so * 3;
      nextSnap[p.id] = v;
      const d = v - (snap[p.id] ?? 0);
      if (!bestG || d > bestG.v) bestG = { id: p.id, v: d };
    } else {
      const v = (s as SkaterLine).pts;
      nextSnap[p.id] = v;
      const d = v - (snap[p.id] ?? 0);
      if (!best || d > best.v) best = { id: p.id, v: d };
    }
  }
  L.monthSnap = nextSnap;
  if (!best || best.v < 8) return;
  const months = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const m = (Number(L.date.slice(5, 7)) + 10) % 12;
  const tag = `${L.date.slice(0, 7)}`;
  for (const w of [best, bestG]) {
    if (!w) continue;
    const p = L.players[w.id];
    p.awards.push(`potm:${tag}`);
    p.morale = clamp(p.morale + 6, 0, 100);
  }
  const p = L.players[best.id];
  pushNews(L, { kind: 'award', title: `Игрок месяца: ${p.fn} ${p.ln} (${p.team}) — ${best.v} очков в ${months[m]}`, players: [p.id], team: p.team ?? undefined, important: p.team === L.user });
  if (p.team === L.user) social(L, `${p.ln} — игрок месяца в НХЛ! Его карточка теперь особенная ✨`, { kind: 'fan', team: L.user, players: [p.id] });
}

function worldJuniors(L: League) {
  L.flags[`wjc${L.season}`] = true;
  const pool = draftPool(L, L.season + 1).sort((a, b) => b.pot - a.pot).slice(0, 40);
  const drafted = Object.values(L.players).filter((p) => p.team && p.st !== 'NHL' && p.st !== 'RET' && p.dr && Number(L.date.slice(0, 4)) - Number(p.bd.slice(0, 4)) <= 19);
  const cands = [...pool, ...drafted];
  if (!cands.length) return;
  // A couple of prospects break out on the big stage; one disappoints.
  const shuffled = cands.sort(() => next() - 0.5);
  const up = shuffled.slice(0, 2), down = shuffled[2];
  for (const p of up) { p.pot = Math.min(97, p.pot + 2); p.ovr = Math.min(p.pot, p.ovr + 1); }
  if (down) down.pot = Math.max(down.ovr, down.pot - 2);
  const mvp = up[0];
  pushNews(L, { kind: 'league', title: `МЧМ: MVP турнира — ${mvp.fn} ${mvp.ln} (${mvp.ctry})${mvp.team ? `, проспект ${mvp.team}` : ''}`, body: `Ещё один проспект, поднявший акции: ${up[1]?.fn ?? ''} ${up[1]?.ln ?? ''}. Скауты переписывают рейтинги.`, players: up.map((p) => p.id) });
  if (up.some((p) => p.team === L.user)) social(L, 'Наш проспект зажёг на молодёжном чемпионате мира! Будущее выглядит ярко', { kind: 'fan', team: L.user });
}

function allStar(L: League) {
  L.flags[`asg${L.season}`] = true;
  const key = statKey(L.season, false);
  const stars = Object.values(L.players)
    .filter((p) => p.st === 'NHL' && p.stats[key])
    .sort((a, b) => b.ovr * 2 + ((b.stats[key] as SkaterLine).pts ?? 0) - (a.ovr * 2 + ((a.stats[key] as SkaterLine).pts ?? 0)))
    .slice(0, 44);
  const mine = stars.filter((p) => p.team === L.user);
  for (const p of stars) p.morale = clamp(p.morale + 3, 0, 100);
  const mvp = stars[Math.floor(next() * Math.min(12, stars.length))];
  pushNews(L, { kind: 'league', title: `Матч всех звёзд: MVP — ${mvp.fn} ${mvp.ln}`, body: `От вашего клуба: ${mine.map((p) => p.ln).join(', ') || 'никого'}.`, important: mine.length > 0 });
  if (mine.length) pushMsg(L, { from: 'НХЛ', kind: 'league', title: 'Ваши игроки на Матче всех звёзд', body: `${mine.map((p) => `${p.fn} ${p.ln}`).join(', ')} представят клуб на Матче всех звёзд.` });
}
