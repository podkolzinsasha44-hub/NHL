// Locker room: team meetings called by the GM. Morale moves a player's form a little in the match
// engine (the same rule for every club), so a meeting is a real but small lever — and it can backfire.
import { next } from './rng';
import type { League, Player } from './types';
import { clamp, daysBetween } from './util';

export const MEETING_COOLDOWN = 21;
export type MeetingTone = 'support' | 'demand';

export function teamMorale(L: League, team: string) {
  const ps = Object.values(L.players).filter((p) => p.team === team && p.st === 'NHL');
  return ps.length ? Math.round(ps.reduce((a, p) => a + p.morale, 0) / ps.length) : 0;
}

export function meetingReady(L: League) {
  return !L.gm.meeting || daysBetween(L.gm.meeting, L.date) >= MEETING_COOLDOWN;
}

/** Leadership in the room: the captain's (or the best leader's) personality, 1..20. */
function roomLeadership(L: League, ps: Player[]) {
  const t = L.teams[L.user];
  const cap = t.captain ? L.players[t.captain] : null;
  const best = ps.reduce((m, p) => Math.max(m, p.pers.lead), 0);
  return cap ? Math.max(cap.pers.lead, best - 3) : best;
}

/**
 * "support": calm talk, reliable small boost (best when the team plays well).
 * "demand": tough talk, a big boost after a losing run, resentment when things go well.
 */
export function teamMeeting(L: League, tone: MeetingTone): { ok: boolean; delta: number; text: string } {
  if (!meetingReady(L)) return { ok: false, delta: 0, text: `Слишком частые собрания раздражают игроков. Следующее — через ${MEETING_COOLDOWN - daysBetween(L.gm.meeting!, L.date)} дн.` };
  const t = L.teams[L.user];
  const ps = Object.values(L.players).filter((p) => p.team === L.user && p.st === 'NHL');
  if (!ps.length) return { ok: false, delta: 0, text: 'Некому собираться' };
  const l10 = t.rec.l10;
  const w = l10.length ? l10.filter((x) => x === 'W').length / l10.length : 0.5;
  const lead = roomLeadership(L, ps);
  const coach = (t.coach.rating - 70) / 10;
  let base: number, spread: number;
  if (tone === 'support') {
    base = 2 + lead / 8 + coach * 0.5 + (w >= 0.6 ? 1 : 0);
    spread = 2;
  } else {
    base = w <= 0.4 ? 4 + lead / 6 + coach : w >= 0.6 ? -4 + lead / 10 : 0.5 + lead / 10;
    spread = 4;
  }
  const roll = (next() * 2 - 1) * spread;
  let sum = 0;
  for (const p of ps) {
    const d = Math.round(base + roll + (p.pers.prof - 10) * 0.15 + (next() - 0.5) * 2);
    p.morale = clamp(p.morale + d, 0, 100);
    sum += d;
  }
  L.gm.meeting = L.date;
  const delta = Math.round(sum / ps.length);
  const text = delta >= 5 ? 'Раздевалка завелась: игроки готовы рвать соперников'
    : delta >= 2 ? 'Собрание прошло хорошо, атмосфера улучшилась'
    : delta >= 0 ? 'Игроки выслушали, но без особых эмоций'
    : 'Разговор пошёл не так: часть игроков восприняла его в штыки';
  return { ok: true, delta, text };
}
