import { autoLines, available, teamPower, validateLines } from './lines';
import { pushMsg, pushNews } from './news';
import { sortedTeams } from './standings';
import type { League, Player, Team } from './types';
import { genPlayer } from './gen';
import { ageOn } from './util';
import { leagueTeams } from './leagues';
import { minSalaryFor } from './contracts';

export function groupByTeam(L: League): Map<string, Player[]> {
  const m = new Map<string, Player[]>();
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || p.st === 'RET') continue;
    let arr = m.get(p.team);
    if (!arr) m.set(p.team, (arr = []));
    arr.push(p);
  }
  return m;
}

export function updateStrategies(L: League) {
  for (const lg of ['NHL', 'KHL'] as const) {
    const teams = leagueTeams(L, lg);
    if (!teams.length) continue;
    const power = teams
      .map((t) => ({ t, p: teamPower(L, t) }))
      .sort((a, b) => b.p - a.p);
    const standing = sortedTeams(L, undefined, lg);
    const gp = teams[0]?.rec.gp ?? 0;
    const n = teams.length;
    for (let i = 0; i < power.length; i++) {
      const t = power[i].t;
      let rank = i + 1;
      if (gp >= 25) {
        const sRank = standing.findIndex((x) => x.id === t.id) + 1;
        rank = Math.round(rank * 0.4 + sRank * 0.6);
      }
      // Same shares as the NHL's 10 / 11 / 11 split.
      t.strategy = rank <= Math.round(n * 0.31) ? 'contend' : rank <= Math.round(n * 0.66) ? 'bubble' : 'rebuild';
    }
  }
}

export const needsWaivers = (L: League, p: Player) => {
  const a = ageOn(p.bd, L.date);
  const gp = (p.car?.gp ?? 0) + Object.entries(p.stats).filter(([k]) => k.endsWith('r')).reduce((s, [, v]) => s + v.gp, 0);
  return a >= 25 || gp >= 160 || (p.c && p.c.signed != null && L.season - p.c.signed >= 4);
};

/**
 * Keeps an AI roster legal and healthy: calls up replacements for injuries,
 * sends extras down, refreshes lines. Returns notes for the user team.
 */
export function manageRoster(L: League, team: Team, org: Player[], isUser: boolean): string[] {
  const notes: string[] = [];
  const nhl = org.filter((p) => p.st === 'NHL');
  const healthy = nhl.filter(available);
  const need = { F: 12, D: 6, G: 2 };
  const grp = (p: Player) => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');
  const have = { F: 0, D: 0, G: 0 };
  for (const p of healthy) have[grp(p)]++;
  const ahl = org.filter((p) => p.st === 'AHL' && p.c && available(p)).sort((a, b) => b.ovr - a.ovr);
  for (const g of ['F', 'D', 'G'] as const) {
    while (have[g] < need[g]) {
      const up = ahl.find((p) => grp(p) === g && p.st === 'AHL') ?? (g !== 'G' ? ahl.find((p) => grp(p) !== 'G' && p.st === 'AHL') : undefined);
      if (!up) break;
      up.st = 'NHL';
      have[g]++;
      nhl.push(up);
      if (isUser) notes.push(`Из АХЛ вызван ${up.fn} ${up.ln} (${up.pos})`);
    }
  }
  // Emergency: no healthy goalie anywhere in the organisation → sign one (like an EBUG call).
  while (have.G < 2) {
    const g = emergencyGoalie(L, team.id);
    nhl.push(g);
    have.G++;
    if (isUser) notes.push(`Экстренно подписан вратарь ${g.fn} ${g.ln}`);
  }
  // Roster limit: 23 healthy players (injured players don't count, like IR).
  const healthyNow = nhl.filter(available);
  if (!isUser && healthyNow.length > 23) {
    const extra = healthyNow.length - 23;
    // Never send down the players who make the lineup (top 12 F, 6 D, 2 G), waiver-exempt or not.
    const core = new Set<number>();
    for (const [g, n] of [['F', 12], ['D', 6], ['G', 2]] as const) {
      healthyNow.filter((p) => grp(p) === g).sort((a, b) => b.ovr - a.ovr).slice(0, n).forEach((p) => core.add(p.id));
    }
    const cands = healthyNow
      .filter((p) => !needsWaivers(L, p) && !core.has(p.id))
      .sort((a, b) => a.ovr - b.ovr);
    const counts = { F: 0, D: 0, G: 0 };
    for (const p of healthyNow) counts[grp(p)]++;
    let sent = 0;
    for (const p of cands) {
      if (sent >= extra) break;
      const g = grp(p);
      if (counts[g] <= need[g] + (g === 'F' ? 1 : g === 'D' ? 1 : 0)) continue;
      p.st = 'AHL';
      counts[g]--;
      sent++;
    }
    // If still too many, waive the lowest-rated veteran (AI teams rarely claim).
    if (sent < extra) {
      const vets = healthyNow.filter((p) => p.st === 'NHL' && !core.has(p.id)).sort((a, b) => a.ovr - b.ovr);
      for (const p of vets) {
        if (sent >= extra) break;
        const g = grp(p);
        if (counts[g] <= need[g] + (g === 'G' ? 0 : 1)) continue;
        p.st = 'AHL';
        counts[g]--;
        sent++;
      }
    }
  }
  // Promote clearly better AHL players for AI teams (weekly-ish via caller).
  if (team.lines.auto || !isUser) autoLines(L, team, nhl);
  else notes.push(...validateLines(L, team, nhl));
  return notes;
}

function emergencyGoalie(L: League, team: string): Player {
  let best: Player | null = null;
  for (const id in L.players) {
    const p = L.players[id];
    if (p.pos === 'G' && !p.team && p.st === 'FA' && !p.inj && (!best || p.ovr > best.ovr)) best = p;
  }
  const g = best ?? genPlayer(L, { pos: 'G', age: 27, country: 'CAN', ovr: 58, pot: 58, league: 'ECHL', status: 'FA' });
  g.team = team;
  g.st = 'NHL';
  g.c = { aav: minSalaryFor(L, team), last: L.season, type: 'STD', clause: null, exp: 'UFA', signed: L.season };
  if (!g.teams.includes(team)) g.teams.push(team);
  pushNews(L, { kind: 'sign', title: `${L.teams[team].short} экстренно подписывают вратаря ${g.fn} ${g.ln}`, team, players: [g.id] });
  return g;
}

/** AI-only: swap an AHL player who is clearly better than the worst NHL regular. */
export function aiPromote(L: League, org: Player[]) {
  const nhl = org.filter((p) => p.st === 'NHL' && available(p));
  const ahl = org.filter((p) => p.st === 'AHL' && p.c && available(p));
  for (const g of ['F', 'D'] as const) {
    const isG = (p: Player) => (g === 'D' ? p.pos === 'D' : p.pos !== 'D' && p.pos !== 'G');
    const worst = nhl.filter(isG).sort((a, b) => a.ovr - b.ovr)[0];
    const best = ahl.filter(isG).sort((a, b) => b.ovr - a.ovr)[0];
    // A clearly better farm player takes the spot; a veteran is exposed to waivers only for a big upgrade.
    if (worst && best && best.ovr >= worst.ovr + 3 && (!needsWaivers(L, worst) || best.ovr >= worst.ovr + 6)) {
      worst.st = 'AHL';
      best.st = 'NHL';
    }
  }
}

export function notifyUser(L: League, notes: string[]) {
  if (!notes.length) return;
  pushMsg(L, { from: 'Ассистент GM', kind: 'staff', title: 'Изменения в составе', body: notes.join('\n') });
}

export function announce(L: League, title: string, team?: string) {
  pushNews(L, { kind: 'league', title, team });
}
