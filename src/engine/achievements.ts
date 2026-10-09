import { pushMsg, pushNews } from './news';
import { playoffResultOf } from './playoffs';
import { sortedTeams } from './standings';
import type { League } from './types';
import { isGM, lgOf } from './leagues';
import { khlPlayoffResult } from './khl';

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  /** Career type the achievement belongs to (default: GM careers). */
  mode?: 'gm' | 'player' | 'all';
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
  { id: 'gagarin', title: 'Кубок Гагарина', desc: 'Выиграйте Кубок Гагарина как GM клуба КХЛ', icon: '🏆' },
  { id: 'two_leagues', title: 'Две лиги', desc: 'Поработайте генеральным менеджером и в НХЛ, и в КХЛ', icon: '🌍' },
  { id: 'victoria', title: 'Кубок Виктории', desc: 'Выиграйте Кубок Виктории — матч чемпионов НХЛ и КХЛ', icon: '🌍' },
  { id: 'promotion', title: 'Путь наверх', desc: 'Примите приглашение клуба НХЛ, работая в КХЛ', icon: '✈️' },
  { id: 'full_house', title: 'Аншлаг', desc: 'Продайте все билеты на 80% домашних матчей регулярки', icon: '🎟️' },
  { id: 'tycoon', title: 'Бизнесмен', desc: 'Заработайте клубу $50M прибыли за сезон (в КХЛ — ₽300 млн)', icon: '💼' },
  { id: 'hof', title: 'Легенда клуба', desc: 'Игрок, выступавший за ваш клуб, введён в Зал славы', icon: '🏛️' },
  { id: 'intl_gold', title: 'Золото сборной', desc: 'Выиграйте чемпионат мира или Олимпиаду как тренер сборной', icon: '🥇', mode: 'all' },
  // Player career
  { id: 'pro_debut', title: 'Первый матч', desc: 'Сыграйте первый матч на профессиональном уровне', icon: '🏒', mode: 'player' },
  { id: 'pro_goal', title: 'Первая шайба', desc: 'Забейте первый гол в карьере', icon: '🚨', mode: 'player' },
  { id: 'pro_drafted', title: 'Выбор на драфте', desc: 'Вас выбирают на драфте НХЛ', icon: '🎯', mode: 'player' },
  { id: 'pro_nhl', title: 'Мечта сбылась', desc: 'Сыграйте матч в НХЛ', icon: '🌟', mode: 'player' },
  { id: 'pro_100', title: 'Сотня', desc: 'Наберите 100 очков за карьеру (НХЛ + КХЛ)', icon: '💯', mode: 'player' },
  { id: 'pro_national', title: 'За сборную', desc: 'Сыграйте за национальную сборную', icon: '🎽', mode: 'player' },
  { id: 'pro_gold', title: 'Чемпион мира', desc: 'Выиграйте золото чемпионата мира или Олимпиады', icon: '🥇', mode: 'player' },
  { id: 'pro_gagarin', title: 'Кубок Гагарина', desc: 'Выиграйте Кубок Гагарина как игрок', icon: '🏆', mode: 'player' },
  { id: 'pro_cup', title: 'Имя на Кубке', desc: 'Выиграйте Кубок Стэнли как игрок', icon: '🏆', mode: 'player' },
  { id: 'pro_victoria', title: 'Лучшие в мире', desc: 'Выиграйте Кубок Виктории как игрок', icon: '🌍', mode: 'player' },
  { id: 'pro_award', title: 'Индивидуальный приз', desc: 'Получите индивидуальную награду лиги', icon: '🎖️', mode: 'player' },
];

/** Achievements shown for the current career type. */
export function achievementsFor(L: League) {
  const m = isGM(L) ? 'gm' : 'player';
  return ACHIEVEMENTS.filter((a) => (a.mode ?? 'gm') === m || a.mode === 'all');
}

export function unlock(L: League, id: string) {
  if (L.achievements[id]) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return;
  L.achievements[id] = L.date;
  pushNews(L, { kind: 'achievement', title: `Достижение: ${a.icon} ${a.title}`, body: a.desc, important: true });
  pushMsg(L, { from: 'Достижения', kind: 'staff', title: `${a.icon} ${a.title}`, body: a.desc });
}

export function checkAchievements(L: League) {
  if (!isGM(L)) return;
  const u = L.user;
  const t = L.teams[u];
  if (lgOf(t) === 'KHL') {
    L.flags.khlGM = true;
    if (L.flags.nhlGM) unlock(L, 'two_leagues');
    if (L.trades.some((x) => x.user)) unlock(L, 'first_trade');
    if (L.seasonLog.signings > 0) unlock(L, 'first_sign');
    if (L.gm.seasons >= 10) unlock(L, 'veteran');
    const po = L.khl?.playoffs;
    if (po && po.season === L.season) {
      const r = khlPlayoffResult(L, u);
      if (r >= 1) unlock(L, 'playoffs');
      if (r >= 2) unlock(L, 'series');
      if (r === 5) unlock(L, 'gagarin');
    }
    if (t.rec.pts >= 100) unlock(L, 'hundred');
    if (t.rec.gp >= 68 && sortedTeams(L, undefined, 'KHL')[0].id === u) unlock(L, 'presidents');
    return;
  }
  L.flags.nhlGM = true;
  if (L.flags.khlGM) unlock(L, 'two_leagues');
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
