import type { League, LeagueId, Player, Pos, Team } from '../engine/types';
import { ageOn } from '../engine/util';
import { FARM_RU, LG_RU, RUB_PER_USD, teamLg, userDeadline, userLg, userPhase } from '../engine/leagues';

export const POS_RU: Record<Pos, string> = { C: 'ЦН', L: 'ЛН', R: 'ПН', D: 'З', G: 'В' };
export const POS_FULL: Record<Pos, string> = { C: 'Центральный нападающий', L: 'Левый нападающий', R: 'Правый нападающий', D: 'Защитник', G: 'Вратарь' };
const LEAGUE_NAME_RU: Record<string, string> = { AHL: 'АХЛ', ECHL: 'ECHL', KHL: 'КХЛ', VHL: 'ВХЛ', MHL: 'МХЛ', Czechia: 'Чехия', Slovakia: 'Словакия', HockeyAllsvenskan: 'Аллсвенскан' };
export const STATUS_RU: Record<string, string> = { NHL: 'НХЛ', AHL: 'АХЛ', JR: 'Юниоры', NCAA: 'NCAA', EUR: 'Европа', FA: 'Свободный агент', RET: 'Завершил карьеру' };

export const ATTR_RU: Record<string, string> = {
  sk: 'Катание', sh: 'Бросок', pa: 'Пас', ha: 'Владение', oi: 'Атака', di: 'Оборона', ph: 'Физика', fo: 'Вбрасывания', dc: 'Дисциплина', du: 'Здоровье',
  po: 'Позиция', rf: 'Реакция', rb: 'Отскоки', pk: 'Игра клюшкой', cs: 'Стабильность', mn: 'Психология',
};
export const ATTR_SHORT: Record<string, string> = {
  sk: 'КАТ', sh: 'БРО', pa: 'ПАС', ha: 'ВЛД', oi: 'АТК', di: 'ОБР', ph: 'ФИЗ', fo: 'ВБР', dc: 'ДИС', du: 'ЗДР',
  po: 'ПОЗ', rf: 'РЕА', rb: 'ОТС', pk: 'КЛШ', cs: 'СТБ', mn: 'ПСИ',
};

export const TRAIT_RU: Record<string, { name: string; icon: string; desc: string }> = {
  sniper: { name: 'Снайпер', icon: '🎯', desc: 'Убийственная реализация бросков' },
  playmaker: { name: 'Плеймейкер', icon: '🧠', desc: 'Создаёт моменты партнёрам' },
  speed: { name: 'Скорость', icon: '⚡', desc: 'Один из самых быстрых в лиге (данные NHL EDGE)' },
  cannon: { name: 'Пушка', icon: '💥', desc: 'Самый мощный бросок в лиге' },
  twoway: { name: 'Двусторонний', icon: '🔄', desc: 'Силён и в атаке, и в обороне' },
  enforcer: { name: 'Тафгай', icon: '🥊', desc: 'Силовая игра, защищает партнёров' },
  blocker: { name: 'Блокировщик', icon: '🧱', desc: 'Ложится под броски' },
  faceoff: { name: 'Мастер вбрасываний', icon: '🎲', desc: 'Выигрывает больше 55% вбрасываний' },
  quarterback: { name: 'Квотербек', icon: '🎮', desc: 'Дирижёр большинства с синей линии' },
  ironman: { name: 'Железный человек', icon: '🛡️', desc: 'Почти не пропускает матчи' },
  leader: { name: 'Лидер', icon: '©️', desc: 'Поднимает раздевалку' },
  wall: { name: 'Стена', icon: '🧤', desc: 'Элитный стабильный вратарь' },
  clutch: { name: 'Клатч', icon: '🔥', desc: 'Лучше всего играет в решающие моменты' },
};

const FLAGS: Record<string, string> = {
  CAN: '🇨🇦', USA: '🇺🇸', SWE: '🇸🇪', FIN: '🇫🇮', RUS: '🇷🇺', CZE: '🇨🇿', SVK: '🇸🇰', CHE: '🇨🇭', SUI: '🇨🇭', DEU: '🇩🇪', GER: '🇩🇪', LVA: '🇱🇻', DNK: '🇩🇰', NOR: '🇳🇴', AUT: '🇦🇹', BLR: '🇧🇾', KAZ: '🇰🇿', SVN: '🇸🇮', FRA: '🇫🇷', GBR: '🇬🇧', AUS: '🇦🇺', UKR: '🇺🇦', NLD: '🇳🇱', POL: '🇵🇱', JPN: '🇯🇵', KOR: '🇰🇷', ITA: '🇮🇹', HUN: '🇭🇺', EST: '🇪🇪', LTU: '🇱🇹', BRA: '🇧🇷', NGA: '🇳🇬', JAM: '🇯🇲', HTI: '🇭🇹', CHN: '🇨🇳', ROU: '🇷🇴', BEL: '🇧🇪', VEN: '🇻🇪', ZAF: '🇿🇦', ISR: '🇮🇱', IRN: '🇮🇷', MEX: '🇲🇽', KGZ: '🇰🇬', TWN: '🇹🇼', SRB: '🇷🇸', SCO: '🏴',
};
export const flag = (c: string) => FLAGS[c] ?? '🏳️';

/** League whose currency is used by default (the user's league; set with the theme). */
let moneyLg: LeagueId = 'NHL';
export function setMoneyLeague(lg: LeagueId) {
  moneyLg = lg;
}

/** Money: dollars in the NHL, roubles in the KHL (amounts are stored in dollars). */
export function money(n: number, d = 2, lg: LeagueId = moneyLg) {
  const sign = n < 0 ? '−' : '';
  if (lg === 'KHL') {
    const r = Math.abs(n) * RUB_PER_USD;
    if (r >= 1e9) return `${sign}₽${(r / 1e9).toFixed(2).replace('.', ',')} млрд`;
    if (r >= 1e6) return `${sign}₽${(r / 1e6).toFixed(r >= 10e6 ? 0 : 1).replace('.', ',')} млн`;
    if (r >= 1000) return `${sign}₽${Math.round(r / 1000)} тыс.`;
    return `${sign}₽${Math.round(r)}`;
  }
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : d)}M`;
  if (a >= 1000) return `${sign}$${Math.round(a / 1000)}K`;
  return `${sign}$${a}`;
}

/** Money in the currency of a club's league. */
export function moneyOf(L: League, team: string | null | undefined, n: number, d = 2) {
  return money(n, d, teamLg(L, team) ?? moneyLg);
}

/** Player status with the right league names (KHL main roster / VHL farm). */
export function statusLabel(L: League, p: Player) {
  const lg = teamLg(L, p.team);
  if (lg === 'KHL' && (p.st === 'NHL' || p.st === 'AHL')) return p.st === 'NHL' ? 'КХЛ' : 'ВХЛ';
  // Players under contract in another league: show that league.
  if (p.st === 'EUR' && p.lg) return LEAGUE_NAME_RU[p.lg] ?? p.lg;
  return STATUS_RU[p.st] ?? p.st;
}

/** "Main roster" and "farm" labels for a club. */
export function rosterLabels(L: League, team: string | null | undefined) {
  const lg = teamLg(L, team) ?? 'NHL';
  return { main: LG_RU[lg], farm: FARM_RU[lg] };
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export function dateShort(iso: string) {
  const d = new Date(iso + 'T12:00:00Z');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function dateLong(iso: string) {
  const d = new Date(iso + 'T12:00:00Z');
  return `${d.getUTCDate()} ${MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function dow(iso: string) {
  return DOW[new Date(iso + 'T12:00:00Z').getUTCDay()];
}

export const seasonLabel = (s: number) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`;

export function playerAge(L: League, p: Player) {
  return ageOn(p.bd, L.date);
}

export const logoUrl = (team: string) => `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`;

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function ovrColor(ovr: number) {
  if (ovr >= 93) return '#ff8ad8';
  if (ovr >= 87) return '#e8c26a';
  if (ovr >= 80) return '#f3d58a';
  if (ovr >= 70) return '#c9d4e4';
  return '#c08a5a';
}
/** Card rarity: the rarer, the stronger (thresholds keep the top tiers to a handful of players). */
export type Tier = 'mythic' | 'legend' | 'epic' | 'elite' | 'gold' | 'silver' | 'bronze' | 'base';
export const TIERS: { id: Tier; min: number; ru: string }[] = [
  { id: 'mythic', min: 95, ru: 'Мифическая' },
  { id: 'legend', min: 92, ru: 'Легендарная' },
  { id: 'epic', min: 89, ru: 'Эпическая' },
  { id: 'elite', min: 85, ru: 'Элитная' },
  { id: 'gold', min: 80, ru: 'Золотая' },
  { id: 'silver', min: 72, ru: 'Серебряная' },
  { id: 'bronze', min: 65, ru: 'Бронзовая' },
  { id: 'base', min: 0, ru: 'Обычная' },
];
export function tierOf(ovr: number): Tier {
  return (TIERS.find((t) => ovr >= t.min) ?? TIERS[TIERS.length - 1]).id;
}
export const TIER_RU = Object.fromEntries(TIERS.map((t) => [t.id, t.ru])) as Record<Tier, string>;

export function phaseLabel(L: League) {
  const khl = userLg(L) === 'KHL';
  switch (userPhase(L)) {
    case 'preseason': return 'Предсезонка';
    case 'regular': return L.date > userDeadline(L) ? 'Регулярка · после дедлайна' : khl ? 'Регулярка КХЛ' : 'Регулярный сезон';
    case 'playoffs': return khl ? 'Кубок Гагарина' : 'Плей-офф';
    case 'draft': return 'Драфт';
    case 'freeagency': return 'Свободные агенты';
    default: return 'Межсезонье';
  }
}

export function teamName(L: League, id: string | null | undefined) {
  if (!id) return '—';
  return L.teams[id]?.name ?? id;
}

export function recordStr(t: Team) {
  return `${t.rec.w}–${t.rec.l}–${t.rec.otl}`;
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

export function toi(sec: number, gp: number) {
  if (!gp) return '0:00';
  const s = Math.round(sec / gp);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
