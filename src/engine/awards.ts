import { pushMsg, pushNews, social } from './news';
import { statKey, svPct } from './stats';
import type { GoalieLine, League, Player, SkaterLine } from './types';
import { ageOn } from './util';
import { sortedTeams } from './standings';

export const AWARD_NAMES: Record<string, string> = {
  hart: 'Харт Трофи — MVP',
  ross: 'Арт Росс Трофи — лучший бомбардир',
  richard: 'Морис Ришар Трофи — лучший снайпер',
  vezina: 'Везина Трофи — лучший вратарь',
  norris: 'Джеймс Норрис Трофи — лучший защитник',
  calder: 'Колдер Трофи — лучший новичок',
  selke: 'Фрэнк Селки Трофи — лучший оборонительный нападающий',
  conn: 'Конн Смайт Трофи — MVP плей-офф',
  adams: 'Джек Адамс Эворд — тренер года',
  gm: 'GM года',
  cup: 'Кубок Стэнли',
};

export function isRookie(p: Player, season: number) {
  const prior = (p.car?.gp ?? 0) + Object.entries(p.stats).filter(([k]) => k.endsWith('r') && Number(k.slice(0, 4)) < season).reduce((a, [, v]) => a + v.gp, 0);
  return prior < 25 && ageOn(p.bd, `${season}-09-15`) <= 26;
}

export function computeAwards(L: League): Record<string, number> {
  const key = statKey(L.season, false);
  const sk: { p: Player; s: SkaterLine }[] = [];
  const gk: { p: Player; s: GoalieLine }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    const s = p.stats[key];
    if (!s || !s.gp) continue;
    if (p.pos === 'G') gk.push({ p, s: s as GoalieLine });
    else sk.push({ p, s: s as SkaterLine });
  }
  const teamPts = (p: Player) => (p.team ? L.teams[p.team]?.rec.pts ?? 80 : 80);
  const top = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((b, x) => (f(x) > f(b) ? x : b), arr[0]);
  const res: Record<string, number> = {};
  if (!sk.length) return res;
  res.ross = top(sk, (x) => x.s.pts * 100 + x.s.g).p.id;
  res.richard = top(sk, (x) => x.s.g * 100 + x.s.pts).p.id;
  const goaliesQ = gk.filter((x) => x.s.gp >= 40);
  const vez = goaliesQ.length ? top(goaliesQ, (x) => (svPct(x.s) - 0.9) * 2000 + x.s.w * 0.6 + x.s.so) : null;
  if (vez) res.vezina = vez.p.id;
  const hartScore = (x: { p: Player; s: SkaterLine }) => x.s.pts * 1.0 + x.s.g * 0.3 + (teamPts(x.p) - 90) * 0.35 + x.p.ovr * 0.3;
  let hart = top(sk, hartScore);
  if (vez && (svPct(vez.s) - 0.9) * 2000 + vez.s.w * 1.2 > hartScore(hart) * 0.95 + 25) hart = { p: vez.p, s: hart.s };
  res.hart = hart.p.id;
  const ds = sk.filter((x) => x.p.pos === 'D' && x.s.gp >= 50);
  if (ds.length) res.norris = top(ds, (x) => x.s.pts * 0.9 + x.p.ovr * 1.2 + x.s.pm * 0.3).p.id;
  const rookies = [...sk.filter((x) => isRookie(x.p, L.season) && x.s.gp >= 40), ...gk.filter((x) => isRookie(x.p, L.season) && x.s.gp >= 25)];
  if (rookies.length) res.calder = top(rookies as { p: Player; s: SkaterLine | GoalieLine }[], (x) => ('pts' in x.s ? x.s.pts : (svPct(x.s) - 0.9) * 1500 + x.s.w)).p.id;
  const fw = sk.filter((x) => x.p.pos !== 'D' && x.s.gp >= 60);
  if (fw.length) res.selke = top(fw, (x) => ((x.p.r as { di: number }).di - 70) * 1.5 + x.s.pm * 0.8 + x.s.pts * 0.2).p.id;
  return res;
}

export function announceAwards(L: League, awards: Record<string, number>) {
  const lines: string[] = [];
  for (const [k, id] of Object.entries(awards)) {
    const p = L.players[id];
    if (!p) continue;
    p.awards.push(`${k}:${L.season}`);
    lines.push(`${AWARD_NAMES[k]}: ${p.fn} ${p.ln} (${p.team ?? '—'})`);
    if (p.team === L.user) social(L, `${p.fn} ${p.ln} получает ${AWARD_NAMES[k].split(' — ')[0]}! 🏆`, { kind: 'fan', team: L.user, players: [p.id] });
  }
  pushNews(L, { kind: 'award', title: `Награды НХЛ ${L.season}-${String((L.season + 1) % 100).padStart(2, '0')}`, body: lines.join('\n'), important: true });
}

/** Coach of the year & GM of the year: biggest improvement vs. last season and preseason expectations. */
export function staffAwards(L: League, prevPts: Record<string, number>) {
  const st = sortedTeams(L);
  const scored = st.map((t) => ({ t, v: t.rec.pts - (prevPts[t.id] ?? t.rec.pts) + t.rec.pts * 0.2 }));
  scored.sort((a, b) => b.v - a.v);
  const coachT = scored[0].t;
  const gmT = scored.find((x) => x.t.rec.pts >= 95)?.t ?? scored[0].t;
  pushNews(L, { kind: 'award', title: `Тренер года — ${coachT.coach.name} (${coachT.short}). GM года — ${gmT.id === L.user ? L.gm.name : `GM ${gmT.short}`}`, team: gmT.id });
  if (gmT.id === L.user) {
    L.gm.rep = Math.min(100, L.gm.rep + 8);
    pushMsg(L, { from: 'НХЛ', kind: 'league', title: 'Вы — GM года!', body: 'Лига признала вашу работу лучшей в сезоне. Агенты и игроки это заметили.' });
    return true;
  }
  return false;
}
