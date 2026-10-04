import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { newCareer, type WorldJson } from '../src/engine/world';
import { advanceDay, setDetail } from '../src/engine/season';
import { capFor, capHit, floorFor } from '../src/engine/contracts';
import { sortedTeams } from '../src/engine/standings';
import { seasonOdds } from '../src/engine/projection';
import { leagueTeams } from '../src/engine/leagues';
import { ownerReact } from '../src/engine/owner';
import { isForeignFor, KHL_CLUBS } from '../src/engine/khlData';
import { groupTable } from '../src/engine/intl';
import { acceptProOffer } from '../src/engine/pro';
import { checkTrade } from '../src/engine/trades';
import { contractCount } from '../src/engine/contracts';
import type { League, Player } from '../src/engine/types';

const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
setDetail(false);

const run = (L: League, until: (L: League) => boolean, max = 420) => {
  for (let i = 0; i < max && !until(L); i++) { L.stops = []; advanceDay(L); }
};

describe('KHL', () => {
  let L: League;
  beforeAll(() => {
    L = newCareer(world, { team: 'SKA', gmName: 't', seed: 21, settings: { worldSize: 'compact' } });
  });

  it('has the 22 clubs of 2026-27, 11 per conference', () => {
    const khl = leagueTeams(L, 'KHL');
    expect(khl).toHaveLength(22);
    expect(khl.filter((t) => t.conf === 'W')).toHaveLength(11);
    expect(KHL_CLUBS.map((c) => c.id).sort()).toEqual(khl.map((t) => t.id).sort());
  });

  it('limits imports only at Russian clubs; Belarusians and Kazakhs are not imports', () => {
    const from = (ctry: string) => ({ ctry }) as Player;
    expect(isForeignFor(from('CAN'), 'SKA')).toBe(true);
    expect(isForeignFor(from('BLR'), 'SKA')).toBe(false);
    expect(isForeignFor(from('KAZ'), 'AKB')).toBe(false);
    expect(isForeignFor(from('CAN'), 'BAR')).toBe(false);
    expect(isForeignFor(from('RUS'), 'DMN')).toBe(false);
    expect(isForeignFor(from('USA'), 'SHA')).toBe(false);
  });

  it('plays a 68-game schedule with no club twice on one day', () => {
    const games = L.games.filter((g) => g.lg === 'KHL');
    expect(games).toHaveLength(748);
    const per: Record<string, number> = {};
    const day = new Set<string>();
    for (const g of games) {
      per[g.h] = (per[g.h] ?? 0) + 1;
      per[g.a] = (per[g.a] ?? 0) + 1;
      for (const t of [g.h, g.a]) {
        expect(day.has(`${g.day}${t}`)).toBe(false);
        day.add(`${g.day}${t}`);
      }
    }
    expect(Object.values(per).every((n) => n === 68)).toBe(true);
    expect(L.khl!.regularEnd <= '2027-03-20').toBe(true);
  });

  it('clubs start between the salary floor and the cap (₽525–950M)', () => {
    for (const t of leagueTeams(L, 'KHL')) {
      expect(capHit(L, t.id), t.id).toBeLessThanOrEqual(capFor(L, t.id));
      expect(capHit(L, t.id), t.id).toBeGreaterThanOrEqual(floorFor(L, t.id));
    }
  });

  it('keeps NHL systems NHL-only', () => {
    expect(sortedTeams(L)).toHaveLength(32);
    expect(Object.keys(seasonOdds(L, 20))).toHaveLength(32);
    expect(L.picks.every((p) => !L.teams[p.owner].lg)).toBe(true);
    expect(L.games.filter((g) => !g.lg)).toHaveLength(1344);
  });

  it('finishes a season: conference first round, re-seeded later rounds, a Gagarin Cup winner', () => {
    run(L, (L) => L.khl!.phase === 'offseason');
    const po = L.khl!.playoffs!;
    expect(po.champion).toBeTruthy();
    const r1 = po.series.filter((s) => s.round === 1);
    expect(r1).toHaveLength(8);
    expect(r1.every((s) => L.teams[s.hi].conf === L.teams[s.lo].conf)).toBe(true);
    const rank = Object.fromEntries(sortedTeams(L, undefined, 'KHL').map((t, i) => [t.id, i]));
    for (const s of po.series.filter((x) => x.round > 1)) expect(rank[s.hi]).toBeLessThan(rank[s.lo]);
    expect(L.khl!.history[0].champion).toBe(po.champion);
    // The NHL still played its own full regular season.
    expect(sortedTeams(L).every((t) => t.rec.gp === 84)).toBe(true);
    // KHL stats are kept apart from NHL career numbers.
    const khlSkater = Object.values(L.players).find((p) => p.team && L.teams[p.team]?.lg === 'KHL' && p.stats['2026rK']);
    expect(khlSkater?.stats['2026r']).toBeUndefined();
  });

  it('reviews the KHL GM after the Gagarin Cup final', () => {
    expect(L.gm.history.length).toBe(1);
    expect(L.gm.history[0].team).toBe('SKA');
  });

  it('World Championship 2027 uses the real groups and awards medals', () => {
    run(L, (L) => (L.intl?.history.length ?? 0) > 0, 60);
    const T = L.intl!.prev!;
    expect(T.id).toBe('wc2027');
    expect(T.groups.A).toEqual(['SUI', 'FIN', 'SWE', 'DEU', 'LVA', 'AUT', 'SVN', 'UKR']);
    expect(T.teams).not.toContain('RUS');
    expect(T.medals).toHaveLength(3);
    expect(groupTable(T, 'A').every((c) => T.table[c].gp === 7)).toBe(true);
    // Two nations relegated, two promoted.
    expect(L.intl!.field).toHaveLength(16);
  });
});

describe('career options', () => {
  it('no-firing mode keeps the GM in the job', () => {
    const L = newCareer(world, { team: 'CHI', gmName: 't', seed: 5, settings: { worldSize: 'compact', noFiring: true } });
    L.owner.trust = 0;
    ownerReact(L);
    expect(L.gm.fired).toBe(false);
    const M = newCareer(world, { team: 'CHI', gmName: 't', seed: 5, settings: { worldSize: 'compact' } });
    M.owner.trust = 0;
    ownerReact(M);
    expect(M.gm.fired).toBe(true);
  });

  it('the 50-contract limit does not block trades', () => {
    const L = newCareer(world, { team: 'CHI', gmName: 't', seed: 5, settings: { worldSize: 'compact' } });
    // Fill the user club up to 50 contracts, then take two players for one.
    const fa = Object.values(L.players).filter((p) => !p.team && p.st === 'FA');
    for (const p of fa) {
      if (contractCount(L, 'CHI') >= 50) break;
      p.team = 'CHI'; p.st = 'AHL'; p.c = { aav: 850_000, last: L.season, type: 'STD', clause: null, exp: 'UFA' };
    }
    expect(contractCount(L, 'CHI')).toBe(50);
    const give = Object.values(L.players).filter((p) => p.team === 'CHI' && p.st === 'AHL' && p.c && p.c.aav <= 900_000)[0];
    const get = Object.values(L.players).filter((p) => p.team === 'SJS' && p.st === 'AHL' && p.c && p.c.aav <= 900_000).slice(0, 2);
    const r = checkTrade(L, 'CHI', 'SJS', { players: [give.id], picks: [] }, { players: get.map((p) => p.id), picks: [] });
    expect(r.ok, r.reason).toBe(true);
  });

  it('Russia and Belarus join IIHF tournaments only when allowed', () => {
    const L = newCareer(world, { team: 'TOR', gmName: 't', seed: 5, settings: { worldSize: 'compact', intlRussia: true } });
    expect(L.intl!.current!.teams).toContain('RUS');
    expect(L.intl!.current!.teams).toContain('BLR');
    expect(L.intl!.current!.teams).toHaveLength(16);
  });

  it('player career: a KHL teenager, draft-eligible, never signed behind the user’s back', () => {
    const L = newCareer(world, { team: '', gmName: '', seed: 8, settings: { worldSize: 'compact' }, pro: { fn: 'Иван', ln: 'Петров', pos: 'C', ctry: 'RUS', team: 'SPR' } });
    expect(L.mode).toBe('player');
    expect(L.user).toBe('');
    const p = L.players[L.pro!.pid];
    expect(p.team).toBe('SPR');
    expect(p.c?.last).toBe(2027);
    expect(p.dy).toBe(2027);
    run(L, (L) => L.date >= '2027-07-02', 320);
    // Drafted players stay at their KHL club; the NHL club only holds the rights.
    if (p.dr) expect(p.rights).toBe(p.dr.t);
    // Contract over, no decision taken by the user: still unsigned, offers on the table.
    expect(p.team === null || p.c?.signed === 2026 || !!L.pro!.pending).toBe(true);
    const offer = L.pro!.offers[0];
    if (offer) {
      expect(acceptProOffer(L, offer.id).ok).toBe(true);
      expect(p.team).toBe(offer.team);
    }
  }, 30_000);
});
