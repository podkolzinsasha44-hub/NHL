import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newCareer, type WorldJson } from '../src/engine/world';
import { advanceDay, setDetail } from '../src/engine/season';
import { capSpace } from '../src/engine/contracts';
import { LOTTERY_ODDS } from '../src/engine/draft';
import { sortedTeams } from '../src/engine/standings';

const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
setDetail(false);

describe('engine', () => {
  it('is deterministic for a given seed and decisions', () => {
    const run = () => {
      const L = newCareer(world, { team: 'TOR', gmName: 't', seed: 123, settings: { worldSize: 'compact' } });
      for (let i = 0; i < 40; i++) { L.stops = []; advanceDay(L); }
      return sortedTeams(L).map((t) => `${t.id}:${t.rec.pts}:${t.rec.gf}`).join(',');
    };
    expect(run()).toBe(run());
  });

  it('match engine has no notion of the user team (no rubber-banding)', () => {
    const src = fs.readFileSync('src/engine/match.ts', 'utf8');
    expect(src).not.toMatch(/\.user\b/);
    expect(src).not.toMatch(/isUser|userTeam/);
    expect(src).not.toMatch(/Math\.random/);
  });

  it('engine randomness only comes from the seeded RNG', () => {
    for (const f of fs.readdirSync('src/engine')) {
      const src = fs.readFileSync(`src/engine/${f}`, 'utf8');
      const uses = src.match(/Math\.random\(\)/g)?.length ?? 0;
      // world.ts may pick a seed for a brand-new career
      expect(uses, f).toBeLessThanOrEqual(f === 'world.ts' ? 1 : 0);
    }
  });

  it('every club starts the season under the salary cap', () => {
    const L = newCareer(world, { team: 'TOR', gmName: 't', seed: 1, settings: { worldSize: 'compact' } });
    for (const t of Object.keys(L.teams)) expect(capSpace(L, t), t).toBeGreaterThanOrEqual(0);
  });

  it('uses the real 2026-27 setup', () => {
    expect(world.schedule.length).toBe(1344);
    expect(world.teams.length).toBe(32);
    expect(LOTTERY_ODDS.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });
});
