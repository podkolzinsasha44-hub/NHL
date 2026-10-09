// Save migrations: careers saved by older versions of the game keep working. Every field added
// later is filled with a neutral default here; nothing already in the save is reset.
import { initIntl } from './intl';
import { getState, useState_ } from './rng';
import { ensureFin } from './finance';
import { ensureSuperCup } from './supercup';
import type { League } from './types';

/** Version of the save format written by this build. */
export const SAVE_VERSION = 2;

/** Fills fields added in later versions (idempotent). Returns the version the save had. */
export function migrate(L: League): number {
  const from = L.v ?? 1;
  L.dead ??= [];
  L.lotteryWins ??= {};
  L.flags ??= {};
  L.album ??= [];
  L.watch ??= [];
  L.mode ??= 'gm';
  L.stops ??= [];
  L.seasonLog ??= { trades: 0, signings: 0, spent: 0, userGames: { w: 0, l: 0 } };
  L.seasonLog.userGames ??= { w: 0, l: 0 };
  // Careers started before national teams existed get them now (the KHL joins on the next July 1).
  if (!L.intl) {
    useState_(L.rng);
    initIntl(L);
    L.rng = getState();
  }
  // v2: club finances, Victoria Cup, Hall of Fame, job calls.
  ensureSuperCup(L);
  L.hof ??= [];
  L.gm.history ??= [];
  if (L.mode !== 'player') ensureFin(L);
  L.v = Math.max(from, SAVE_VERSION);
  return from;
}
