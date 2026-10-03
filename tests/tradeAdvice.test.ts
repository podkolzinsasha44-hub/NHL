import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { newCareer, type WorldJson } from '../src/engine/world';
import { setDetail } from '../src/engine/season';
import { leagueTeamIds } from '../src/engine/leagues';
import { recommended, teamLean, tradeAdvice } from '../src/engine/tradeAdvice';
import type { League } from '../src/engine/types';

const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
setDetail(false);

describe('trade advisor', () => {
  let L: League;
  beforeAll(() => {
    L = newCareer(world, { team: 'CHI', gmName: 't', seed: 11, settings: { worldSize: 'compact' } });
  });

  it('is read-only: no state change, no random numbers drawn', () => {
    const before = JSON.stringify(L);
    tradeAdvice(L);
    expect(JSON.stringify(L)).toBe(before);
  });

  it('lists only signed players of other clubs in the same league, never NMC holders who stay put', () => {
    const a = tradeAdvice(L);
    const nhl = new Set(leagueTeamIds(L, 'NHL'));
    expect(a.targets.length).toBeGreaterThan(20);
    for (const t of a.targets) {
      expect(t.team).not.toBe(L.user);
      expect(t.p.team).toBe(t.team);
      expect(nhl.has(t.team)).toBe(true);
      expect(t.p.c).toBeTruthy();
      if (t.p.c!.clause === 'NMC') expect(t.p.wantsTrade).toBe(true);
    }
  });

  it("keeps contenders' leaders off the list unless they ask out", () => {
    const a = tradeAdvice(L);
    const listed = new Set(a.targets.map((t) => t.p.id));
    for (const id of leagueTeamIds(L, 'NHL')) {
      const t = L.teams[id];
      if (id === L.user || t.strategy !== 'contend') continue;
      const best = Object.values(L.players).filter((p) => p.team === id && p.st === 'NHL').sort((x, y) => y.ovr - x.ovr)[0];
      if (!best.wantsTrade) expect(listed.has(best.id), `${id} ${best.ln}`).toBe(false);
    }
  });

  it('spots a weak net and recommends a starting goalie', () => {
    const M = structuredClone(L);
    for (const p of Object.values(M.players)) if (p.team === M.user && p.pos === 'G') p.ovr = 55;
    const a = tradeAdvice(M);
    expect(a.needs[0].id).toBe('G0');
    const top = recommended(a, 3);
    expect(top.some((t) => t.p.pos === 'G' && t.slot === 'основной вратарь' && t.needs.includes('G0'))).toBe(true);
    // Upgrades come with a projected gain from the same model as the standings odds.
    expect(top[0].dPower).toBeGreaterThan(0);
    expect(top[0].dPts).toBeGreaterThan(0);
  });

  it('follows the tactic: attacking teams prefer attacking profiles', () => {
    const M = structuredClone(L);
    M.teams[M.user].tactic = 'attack';
    expect(teamLean(M.teams[M.user])).toBe('off');
    const off = tradeAdvice(M);
    M.teams[M.user].tactic = 'defense';
    const def = tradeAdvice(M);
    const byId = new Map(def.targets.map((t) => [t.p.id, t.style]));
    const skaters = off.targets.filter((t) => t.p.pos !== 'G');
    // The same player fits one lean exactly as much as he misfits the other.
    for (const t of skaters.slice(0, 30)) expect(t.style).toBeCloseTo(-(byId.get(t.p.id) ?? 0), 5);
    expect(off.style).toContain('Атака');
  });

  it('works for a KHL club with KHL clubs only', () => {
    const K = newCareer(world, { team: 'SKA', gmName: 't', seed: 11, settings: { worldSize: 'compact' } });
    const a = tradeAdvice(K);
    const khl = new Set(leagueTeamIds(K, 'KHL'));
    expect(a.targets.length).toBeGreaterThan(0);
    expect(a.targets.every((t) => khl.has(t.team))).toBe(true);
  });
});
