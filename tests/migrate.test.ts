import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newCareer, type WorldJson } from '../src/engine/world';
import { advanceDay, setDetail } from '../src/engine/season';
import { migrate, SAVE_VERSION } from '../src/engine/migrate';
import type { League } from '../src/engine/types';

const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));

describe('old saves', () => {
  it('a v1 career (no finances, Victoria Cup, Hall of Fame) loads and keeps playing', () => {
    setDetail(false);
    const L = newCareer(world, { team: 'TOR', gmName: 't', seed: 5 }) as League;
    // Strip everything added in v2, as a save from the previous build would look.
    const old = JSON.parse(JSON.stringify(L));
    old.v = 1;
    delete old.fin; delete old.supercup; delete old.hof;
    expect(migrate(old)).toBe(1);
    expect(old.v).toBe(SAVE_VERSION);
    expect(old.fin?.cur.team).toBe('TOR');
    for (let i = 0; i < 40; i++) { old.stops = []; advanceDay(old); }
    expect(old.fin!.cur.homeGames).toBeGreaterThan(0);
    expect(old.games.some((g: { att?: number }) => (g.att ?? 0) > 0)).toBe(true);
  });
});
