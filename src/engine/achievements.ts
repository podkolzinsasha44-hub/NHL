import { pushMsg, pushNews } from './news';
import { playoffResultOf } from './playoffs';
import { sortedTeams } from './standings';
import type { League } from './types';

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_trade', title: 'Первая сделка', desc: 'Совершите первый обмен', icon: '🤝' },
  { id: 'first_sign', title: 'Подпись поставлена', desc: 'Подпишите первый контракт', icon: '✍️' },
  { id: 'playoffs', title: 'Весенний хоккей', desc: 'Выведите команду в плей-офф', icon: '🌸' },
  { id: 'series', title: 'Дальше — больше', desc: 'Выиграйте серию плей-офф', icon: '⚔️' },
  { id: 'final', title: 'В шаге от вершины', desc: 'Дойдите до финала Кубка Стэнли', icon: '🥈' },
  { id: 'cup', title: 'Кубок Стэнли', desc: 'Выиграйте Кубок Стэнли', icon: '🏆' },
  { id: 'underdog', title: 'Золушка', desc: 'Выиграйте Кубок с командой из нижней половины лиги по силе на старте сезона', icon: '👠' },
  { id: 'dynasty', title: 'Династия', desc: 'Выиграйте 3 Кубка Стэнли', icon: '👑' },
  { id: 'presidents', title: 'Президентский кубок', desc: 'Наберите больше всех очков в регулярке', icon: '🥇' },
  { id: 'hundred', title: '100 очков', desc: 'Наберите 100+ очков за сезон', icon: '💯' },
  { id: 'lottery', title: 'Счастливый шар', desc: 'Выиграйте лотерею драфта', icon: '🎱' },
  { id: 'steal', title: 'Грабёж', desc: 'Получите оценку A+ за обмен', icon: '🦹' },
  { id: 'gm_year', title: 'GM года', desc: 'Станьте GM года', icon: '🎖️' },
  { id: 'big_fish', title: 'Крупная рыба', desc: 'Подпишите свободного агента на $8M+ в год', icon: '🐟' },
  { id: 'ironman', title: 'Железный человек', desc: 'Выиграйте Кубок в режиме «Железный человек»', icon: '🛡️' },
  { id: 'no_trades', title: 'Своими силами', desc: 'Выиграйте Кубок, не совершив ни одного обмена за сезон', icon: '🧱' },
  { id: 'veteran', title: 'Старожил', desc: 'Проработайте GM 10 сезонов', icon: '🕰️' },
  { id: 'scoring', title: 'Лучший бомбардир', desc: 'Ваш игрок выигрывает Арт Росс Трофи', icon: '🎯' },
  { id: 'vezina', title: 'Стена', desc: 'Ваш вратарь выигрывает Везину', icon: '🧤' },
  { id: 'calder', title: 'Новичок года', desc: 'Ваш новичок выигрывает Колдер Трофи', icon: '🌟' },
  { id: 'draft_star', title: 'Глаз-алмаз', desc: 'Задрафтованный вами игрок достигает рейтинга 85', icon: '💎' },
];

export function unlock(L: League, id: string) {
  if (L.achievements[id]) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return;
  L.achievements[id] = L.date;
  pushNews(L, { kind: 'achievement', title: `Достижение: ${a.icon} ${a.title}`, body: a.desc, important: true });
  pushMsg(L, { from: 'Достижения', kind: 'staff', title: `${a.icon} ${a.title}`, body: a.desc });
}

export function checkAchievements(L: League) {
  const u = L.user;
  const t = L.teams[u];
  if (L.trades.some((x) => x.user)) unlock(L, 'first_trade');
  if (L.trades.some((x) => x.user && ((x.a === u && x.grades?.a === 'A+') || (x.b === u && x.grades?.b === 'A+')))) unlock(L, 'steal');
  if (L.seasonLog.signings > 0) unlock(L, 'first_sign');
  if (L.gm.seasons >= 10) unlock(L, 'veteran');
  const r = playoffResultOf(L, u);
  if (L.playoffs && L.playoffs.season === L.season) {
    if (r >= 1) unlock(L, 'playoffs');
    if (r >= 2 || r === 5) unlock(L, 'series');
    if (r >= 4) unlock(L, 'final');
    if (r === 5) {
      unlock(L, 'cup');
      if (L.gm.cups >= 3) unlock(L, 'dynasty');
      if (L.settings.ironman) unlock(L, 'ironman');
      if (L.seasonLog.trades === 0) unlock(L, 'no_trades');
      if (L.flags[`underdog${L.season}`]) unlock(L, 'underdog');
    }
  }
  if (t.rec.pts >= 100) unlock(L, 'hundred');
  if (t.rec.gp >= 84 && sortedTeams(L)[0].id === u) unlock(L, 'presidents');
  const h = L.history[0];
  if (h && h.season === L.season) {
    const mine = (k: string) => h.awards[k] && L.players[h.awards[k]]?.team === u;
    if (mine('ross')) unlock(L, 'scoring');
    if (mine('vezina')) unlock(L, 'vezina');
    if (mine('calder')) unlock(L, 'calder');
  }
  if (L.draft?.lottery?.[0]?.team === u) unlock(L, 'lottery');
  for (const id in L.players) {
    const p = L.players[id];
    if (p.dr?.t === u && p.dr.y >= 2027 && p.ovr >= 85) { unlock(L, 'draft_star'); break; }
  }
}
