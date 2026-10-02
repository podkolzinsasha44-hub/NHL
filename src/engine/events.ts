import type { MatchBox } from './match';
import { pushMsg, pushNews, social } from './news';
import { careerSkater } from './stats';
import type { League, Player } from './types';
import { ageOn, clamp } from './util';
import { next } from './rng';

const GOAL_MS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const PTS_MS = [500, 1000, 1500];
const GP_MS = [500, 1000, 1500];

export function checkMilestones(L: League, box: MatchBox) {
  for (const s of box.skaters) {
    if (!s.g && !s.a && s.p.team !== L.user && s.p.ovr < 85) continue;
    const c = careerSkater(s.p);
    const prev = { g: c.g - s.g, pts: c.pts - s.g - s.a, gp: c.gp - 1 };
    const hit = (arr: number[], before: number, now: number) => arr.find((m) => before < m && now >= m);
    const mg = hit(GOAL_MS, prev.g, c.g);
    const mp = hit(PTS_MS, prev.pts, c.pts);
    const mgp = hit(GP_MS, prev.gp, c.gp);
    const name = `${s.p.fn} ${s.p.ln}`;
    if (mg) milestone(L, s.p, `${name}: ${mg}-й гол в карьере в НХЛ!`);
    if (mp) milestone(L, s.p, `${name} набирает ${mp}-е очко в карьере!`);
    if (mgp) milestone(L, s.p, `${name} проводит ${mgp}-й матч в НХЛ`);
  }
}

function milestone(L: League, p: Player, title: string) {
  pushNews(L, { kind: 'milestone', title, players: [p.id], team: p.team ?? undefined, important: p.team === L.user });
  if (p.team === L.user) social(L, `${title} Арена аплодирует стоя 👏`, { kind: 'fan', team: L.user, players: [p.id] });
}

/** Morale reacts to ice time, team results and contract situation. */
export function weeklyMorale(L: League) {
  const teamWin: Record<string, number> = {};
  for (const t of Object.values(L.teams)) {
    const l10 = t.rec.l10;
    teamWin[t.id] = l10.length ? l10.filter((x) => x === 'W').length / l10.length : 0.5;
  }
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || (p.st !== 'NHL' && p.st !== 'AHL')) continue;
    const t = L.teams[p.team];
    let target = 62 + (teamWin[p.team] - 0.5) * 30;
    if (p.st === 'AHL' && p.ovr >= 74 && ageOn(p.bd, L.date) >= 23) target -= 18; // wants to be in the NHL
    if (p.st === 'NHL') {
      const inLines = t.lines.f.flat().includes(p.id) || t.lines.d.flat().includes(p.id) || t.lines.g[0] === p.id;
      if (!inLines && !p.inj) target -= 14; // healthy scratch
      const top = t.lines.f[0]?.includes(p.id) || t.lines.d[0]?.includes(p.id);
      if (top) target += 6;
    }
    if (t.captain === p.id) target += 5;
    target += (p.pers.prof - 10) * 0.6;
    p.morale = clamp(Math.round(p.morale * 0.75 + target * 0.25), 0, 100);
    if (p.team === L.user && !p.wantsTrade && p.morale < 32 && p.ovr >= 74 && next() < 0.25) {
      p.wantsTrade = true;
      pushMsg(L, {
        from: `Агент ${p.fn} ${p.ln}`, kind: 'agent',
        title: `${p.ln} просит обмен`,
        body: `Мой клиент недоволен ролью в команде и хотел бы сменить обстановку. Просим рассмотреть варианты обмена.`,
        ref: { type: 'player', id: p.id },
      });
      social(L, `Инсайд: ${p.fn} ${p.ln} попросил ${L.teams[L.user].short} об обмене`, { kind: 'insider', team: L.user, players: [p.id] });
    }
  }
}
