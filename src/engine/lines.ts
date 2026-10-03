import type { League, Lines, Player, SkaterAttrs, Team } from './types';
import { sk } from './util';

export const emptyLines = (): Lines => ({ f: [[], [], [], []], d: [[], [], []], g: [], pp: [[], []], pk: [[], []], auto: true });

export function available(p: Player) {
  return !p.inj && !(p.susp && p.susp > 0);
}

export function nhlRoster(L: League, teamId: string): Player[] {
  const out: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === teamId && p.st === 'NHL') out.push(p);
  }
  return out;
}

export function orgPlayers(L: League, teamId: string): Player[] {
  const out: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === teamId && p.st !== 'RET') out.push(p);
  }
  return out;
}

const offVal = (p: Player) => {
  const a = sk(p);
  return 0.3 * a.oi + 0.28 * a.sh + 0.27 * a.pa + 0.15 * a.ha;
};
const defVal = (p: Player) => {
  const a = sk(p);
  return 0.6 * a.di + 0.2 * a.sk + 0.2 * a.ph;
};

/** Builds standard lines from the healthy NHL roster. Mutates team.lines. */
export function autoLines(L: League, team: Team, nhl?: Player[]) {
  const roster = (nhl ?? nhlRoster(L, team.id)).filter((p) => p.st === 'NHL' && p.team === team.id && available(p));
  buildLines(team, roster);
}

/** Builds lines from an explicit list of healthy players (also used by national teams). */
export function buildLines(team: Team, roster: Player[]) {
  const fwd = roster.filter((p) => p.pos !== 'D' && p.pos !== 'G').sort((a, b) => b.ovr - a.ovr);
  const def = roster.filter((p) => p.pos === 'D').sort((a, b) => b.ovr - a.ovr);
  const gls = roster.filter((p) => p.pos === 'G').sort((a, b) => b.ovr - a.ovr);

  // If short on D, use forwards (and vice versa) — rare, only with many injuries.
  while (def.length < 6 && fwd.length > 12) def.push(fwd.pop()!);
  const top12 = fwd.slice(0, 12);
  const dTop = def.slice(0, 6);

  const centers = top12
    .filter((p) => p.pos === 'C')
    .sort((a, b) => b.ovr + (sk(b).fo - 70) * 0.05 - (a.ovr + (sk(a).fo - 70) * 0.05));
  const cSel = centers.slice(0, 4);
  // Fill missing centers with best faceoff wingers
  const rest = top12.filter((p) => !cSel.includes(p));
  while (cSel.length < 4 && rest.length) {
    rest.sort((a, b) => sk(b).fo + b.ovr - (sk(a).fo + a.ovr));
    cSel.push(rest.shift()!);
  }
  cSel.sort((a, b) => b.ovr - a.ovr);
  const wings = top12.filter((p) => !cSel.includes(p)).sort((a, b) => b.ovr - a.ovr);
  const f: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const pair = wings.slice(i * 2, i * 2 + 2);
    let lw = pair.find((p) => p.pos === 'L') ?? pair[0];
    let rw = pair.find((p) => p !== lw) ?? pair[1];
    if (lw && rw && lw.pos === 'R' && rw.pos === 'L') [lw, rw] = [rw, lw];
    f.push([lw?.id, cSel[i]?.id, rw?.id].filter((x): x is number => x != null));
  }
  const d: number[][] = [];
  for (let i = 0; i < 3; i++) {
    const pair = dTop.slice(i * 2, i * 2 + 2);
    const l = pair.find((p) => p.sh === 'L') ?? pair[0];
    const r = pair.find((p) => p !== l) ?? pair[1];
    d.push([l?.id, r?.id].filter((x): x is number => x != null));
  }
  const g = gls.slice(0, 2).map((p) => p.id);

  const ppF = [...top12].sort((a, b) => offVal(b) - offVal(a));
  const ppD = [...dTop].sort((a, b) => offVal(b) - offVal(a));
  const pp = [
    [...ppF.slice(0, 4), ppD[0]].filter(Boolean).map((p) => p.id),
    [...ppF.slice(4, 7), ...ppD.slice(1, 3)].filter(Boolean).map((p) => p.id),
  ];
  const pkF = [...top12].sort((a, b) => defVal(b) - defVal(a));
  const pkD = [...dTop].sort((a, b) => defVal(b) - defVal(a));
  const pk = [
    [...pkF.slice(0, 2), ...pkD.slice(0, 2)].map((p) => p.id),
    [...pkF.slice(2, 4), ...pkD.slice(2, 4)].map((p) => p.id),
  ];
  team.lines = { f, d, g, pp, pk, auto: team.lines?.auto ?? true };
}

/** Ensures a (possibly user-edited) lineup only contains healthy roster players; patches holes. */
export function validateLines(L: League, team: Team, nhl?: Player[]): string[] {
  const notes: string[] = [];
  const ok = (id: number) => {
    const p = L.players[id];
    return p && p.team === team.id && p.st === 'NHL' && available(p);
  };
  const ln = team.lines;
  const all = [...ln.f.flat(), ...ln.d.flat(), ...ln.g];
  const broken = all.some((id) => !ok(id)) || ln.f.flat().length < 12 || ln.d.flat().length < 6 || ln.g.length < 2;
  if (!broken) {
    // keep special teams valid
    ln.pp = ln.pp.map((u) => u.filter(ok));
    ln.pk = ln.pk.map((u) => u.filter(ok));
    if (ln.pp[0].length < 5 || ln.pk[0].length < 4) {
      const keep = { f: ln.f, d: ln.d, g: ln.g };
      autoLines(L, team);
      team.lines = { ...team.lines, ...keep, auto: ln.auto };
    }
    return notes;
  }
  if (ln.auto) {
    autoLines(L, team, nhl);
    return notes;
  }
  // Manual lines: replace only broken slots with the best available extras.
  const used = new Set(all.filter(ok));
  const roster = (nhl ?? nhlRoster(L, team.id)).filter((p) => p.st === 'NHL' && p.team === team.id && available(p));
  const extras = (pred: (p: Player) => boolean) => roster.filter((p) => !used.has(p.id) && pred(p)).sort((a, b) => b.ovr - a.ovr);
  const fill = (arr: number[], size: number, pred: (p: Player) => boolean) => {
    for (let i = 0; i < size; i++) {
      if (arr[i] == null || !ok(arr[i])) {
        const sub = extras(pred)[0] ?? extras((p) => p.pos !== 'G')[0];
        if (sub) {
          const old = arr[i] != null ? L.players[arr[i]] : null;
          if (old) notes.push(`${old.ln} → ${sub.ln}`);
          arr[i] = sub.id;
          used.add(sub.id);
        }
      }
    }
  };
  ln.f.forEach((line) => fill(line, 3, (p) => p.pos !== 'D' && p.pos !== 'G'));
  ln.d.forEach((pair) => fill(pair, 2, (p) => p.pos === 'D'));
  fill(ln.g, 2, (p) => p.pos === 'G');
  ln.pp = ln.pp.map((u) => u.filter(ok));
  ln.pk = ln.pk.map((u) => u.filter(ok));
  if (ln.pp[0].length < 5 || ln.pk[0].length < 4) {
    const keep = { f: ln.f, d: ln.d, g: ln.g };
    autoLines(L, team);
    team.lines = { ...team.lines, ...keep, auto: false };
  }
  return notes;
}

/** Team power used by projections and AI: 0-100 scale. */
export function teamPower(L: League, team: Team): number {
  const ln = team.lines;
  const P = (id: number) => L.players[id];
  const fl = ln.f.map((line) => line.map(P).filter(Boolean));
  const dp = ln.d.map((pair) => pair.map(P).filter(Boolean));
  const avg = (arr: Player[]) => (arr.length ? arr.reduce((a, p) => a + p.ovr, 0) / arr.length : 60);
  const fw = [0.36, 0.31, 0.21, 0.12];
  const dw = [0.42, 0.34, 0.24];
  let f = 0, d = 0;
  fl.forEach((line, i) => (f += fw[i] * avg(line)));
  dp.forEach((pair, i) => (d += dw[i] * avg(pair)));
  const g = ln.g[0] ? P(ln.g[0])?.ovr ?? 70 : 70;
  return f * 0.5 + d * 0.27 + g * 0.23 + (team.coach.rating - 72) * 0.06;
}

export const skaterOff = (a: SkaterAttrs) => 0.27 * a.sh + 0.25 * a.oi + 0.2 * a.pa + 0.15 * a.ha + 0.13 * a.sk;
export const skaterDef = (a: SkaterAttrs, isD: boolean) =>
  isD ? 0.55 * a.di + 0.15 * a.sk + 0.2 * a.ph + 0.1 * a.pa : 0.5 * a.di + 0.2 * a.sk + 0.2 * a.ph + 0.1 * a.pa;
