// User-facing roster actions with validation and feedback.
import { needsWaivers } from '../engine/ai';
import { buyout, buyoutCost, capSpace, contractCount, signELC, waive } from '../engine/contracts';
import { autoLines, validateLines } from '../engine/lines';
import type { League, Player } from '../engine/types';
import { useGame } from '../store/game';
import { money } from './format';

const g = () => useGame.getState();

function refreshLines(L: League) {
  const t = L.teams[L.user];
  if (t.lines.auto) autoLines(L, t);
  else validateLines(L, t);
}

export function callUp(p: Player) {
  const L = g().L!;
  const healthy = Object.values(L.players).filter((x) => x.team === L.user && x.st === 'NHL' && !x.inj).length;
  if (healthy >= 23) return g().toast('В основном составе уже 23 здоровых игрока. Сначала отправьте кого-то в АХЛ.', 'bad');
  if (!p.c) return g().toast('У игрока нет контракта.', 'bad');
  g().act((L) => { p.st = 'NHL'; refreshLines(L); });
  g().toast(`${p.ln} вызван в НХЛ`, 'good');
}

export function sendDown(p: Player): 'needs-waivers' | 'done' {
  const L = g().L!;
  if (p.c?.clause === 'NMC') { g().toast('У игрока NMC — отправить в АХЛ без его согласия нельзя.', 'bad'); return 'done'; }
  if (needsWaivers(L, p)) return 'needs-waivers';
  g().act((L) => { p.st = 'AHL'; refreshLines(L); });
  g().toast(`${p.ln} отправлен в АХЛ`, 'good');
  return 'done';
}

export function waivePlayer(p: Player) {
  const claimed = g().act((L) => { const r = waive(L, p); refreshLines(L); return r; });
  const L = g().L!;
  if (claimed) g().toast(`${p.ln} забран с драфта отказов клубом ${L.teams[claimed].short}`, 'bad');
  else g().toast(`${p.ln} прошёл драфт отказов и отправлен в АХЛ`, 'good');
}

export function buyoutPlayer(p: Player) {
  const L = g().L!;
  const b = buyoutCost(L, p);
  if (!b) return;
  g().act((L) => { buyout(L, p); refreshLines(L); });
  g().toast(`Контракт ${p.ln} выкуплен: ${money(b.perYear)} мёртвых денег в год на ${b.years} лет`, 'info');
}

export function signElc(p: Player) {
  const L = g().L!;
  if (contractCount(L, L.user) >= 50) return g().toast('Лимит 50 контрактов', 'bad');
  if (capSpace(L, L.user) < 0) return g().toast('Сначала решите проблему с потолком', 'bad');
  g().act((L) => signELC(L, p, L.user));
  g().toast(`${p.ln} подписал контракт новичка`, 'good');
}
