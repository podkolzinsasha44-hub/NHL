// KHL 2026-27: 22 clubs, 11 per conference (sources: khl.ru, sport-express.net, ru.wikipedia.org,
// checked 03.10.2026). Strength tiers follow the 2025-26 season (Lokomotiv won the Gagarin Cup
// over Ak Bars) and are a reference for generating the fictional rosters; colours are approximate.
// This module has no engine dependencies so it can be imported from anywhere (UI included).
import type { League, Player } from './types';

export interface KhlClub {
  id: string;
  name: string;
  short: string;
  /** Up to 4 Cyrillic letters for the generated crest. */
  abbr: string;
  city: string;
  conf: 'W' | 'E';
  primary: string;
  secondary: string;
  accent: string;
  /** 0..1, roster quality used by the generator. */
  tier: number;
  coach: number;
  bigMarket: boolean;
  /** Nationality that does not count as "foreign" for the club (null: no limit applies). */
  home: string | null;
}

export const KHL_CLUBS: KhlClub[] = [
  // Western Conference
  { id: 'SKA', name: 'СКА', short: 'СКА', abbr: 'СКА', city: 'Санкт-Петербург', conf: 'W', primary: '#0b3a7a', secondary: '#e2231a', accent: '#3d7fe0', tier: 0.88, coach: 80, bigMarket: true, home: 'RUS' },
  { id: 'CSK', name: 'ЦСКА', short: 'ЦСКА', abbr: 'ЦСКА', city: 'Москва', conf: 'W', primary: '#b3121f', secondary: '#0b2a63', accent: '#e8333f', tier: 0.85, coach: 80, bigMarket: true, home: 'RUS' },
  { id: 'DMS', name: 'Динамо Москва', short: 'Динамо М', abbr: 'Д', city: 'Москва', conf: 'W', primary: '#0b4f9c', secondary: '#ffffff', accent: '#4d9be8', tier: 0.78, coach: 77, bigMarket: true, home: 'RUS' },
  { id: 'SPR', name: 'Спартак Москва', short: 'Спартак', abbr: 'СП', city: 'Москва', conf: 'W', primary: '#c8102e', secondary: '#ffffff', accent: '#ff4052', tier: 0.7, coach: 76, bigMarket: true, home: 'RUS' },
  { id: 'LOK', name: 'Локомотив', short: 'Локомотив', abbr: 'ЛОК', city: 'Ярославль', conf: 'W', primary: '#b5121b', secondary: '#151515', accent: '#e83a43', tier: 0.95, coach: 82, bigMarket: true, home: 'RUS' },
  { id: 'SEV', name: 'Северсталь', short: 'Северсталь', abbr: 'СЕВ', city: 'Череповец', conf: 'W', primary: '#26292e', secondary: '#c9ced6', accent: '#8fa3bf', tier: 0.65, coach: 75, bigMarket: false, home: 'RUS' },
  { id: 'TRP', name: 'Торпедо', short: 'Торпедо', abbr: 'ТОР', city: 'Нижний Новгород', conf: 'W', primary: '#0a4ea2', secondary: '#ffffff', accent: '#4b92f0', tier: 0.6, coach: 74, bigMarket: false, home: 'RUS' },
  { id: 'DMN', name: 'Динамо Минск', short: 'Динамо Мн', abbr: 'ДМН', city: 'Минск', conf: 'W', primary: '#0a47a8', secondary: '#d52b1e', accent: '#4a86e8', tier: 0.55, coach: 73, bigMarket: false, home: 'BLR' },
  { id: 'SCH', name: 'Сочи', short: 'Сочи', abbr: 'СОЧ', city: 'Сочи', conf: 'W', primary: '#14171c', secondary: '#00aeef', accent: '#33c4f5', tier: 0.25, coach: 69, bigMarket: false, home: 'RUS' },
  { id: 'LAD', name: 'Лада', short: 'Лада', abbr: 'ЛАДА', city: 'Тольятти', conf: 'W', primary: '#0b3d86', secondary: '#e30613', accent: '#4a7fd4', tier: 0.3, coach: 69, bigMarket: false, home: 'RUS' },
  { id: 'SHA', name: 'Шанхайские Драконы', short: 'Драконы', abbr: 'ШД', city: 'Шанхай', conf: 'W', primary: '#b10f1f', secondary: '#f2b705', accent: '#f2b705', tier: 0.25, coach: 68, bigMarket: false, home: null },
  // Eastern Conference
  { id: 'AKB', name: 'Ак Барс', short: 'Ак Барс', abbr: 'АБ', city: 'Казань', conf: 'E', primary: '#00703c', secondary: '#e30613', accent: '#2fbf71', tier: 0.92, coach: 81, bigMarket: true, home: 'RUS' },
  { id: 'AVG', name: 'Авангард', short: 'Авангард', abbr: 'АВГ', city: 'Омск', conf: 'E', primary: '#b3121f', secondary: '#111111', accent: '#e8333f', tier: 0.85, coach: 79, bigMarket: true, home: 'RUS' },
  { id: 'MMG', name: 'Металлург Магнитогорск', short: 'Металлург', abbr: 'ММГ', city: 'Магнитогорск', conf: 'E', primary: '#0b2d5e', secondary: '#e35205', accent: '#ff7a2e', tier: 0.88, coach: 80, bigMarket: true, home: 'RUS' },
  { id: 'SYU', name: 'Салават Юлаев', short: 'Салават', abbr: 'СЮ', city: 'Уфа', conf: 'E', primary: '#00843d', secondary: '#0054a6', accent: '#36c06f', tier: 0.65, coach: 75, bigMarket: false, home: 'RUS' },
  { id: 'TRK', name: 'Трактор', short: 'Трактор', abbr: 'ТРК', city: 'Челябинск', conf: 'E', primary: '#1b1b1d', secondary: '#d71920', accent: '#5aa0ff', tier: 0.78, coach: 77, bigMarket: false, home: 'RUS' },
  { id: 'AVT', name: 'Автомобилист', short: 'Автомобилист', abbr: 'АВТ', city: 'Екатеринбург', conf: 'E', primary: '#c8102e', secondary: '#2b2b2b', accent: '#ff4a5c', tier: 0.75, coach: 76, bigMarket: false, home: 'RUS' },
  { id: 'SIB', name: 'Сибирь', short: 'Сибирь', abbr: 'СИБ', city: 'Новосибирск', conf: 'E', primary: '#0a4ea2', secondary: '#0b1f3f', accent: '#5aa0f0', tier: 0.45, coach: 72, bigMarket: false, home: 'RUS' },
  { id: 'BAR', name: 'Барыс', short: 'Барыс', abbr: 'БАР', city: 'Астана', conf: 'E', primary: '#0094b3', secondary: '#fec50c', accent: '#fec50c', tier: 0.4, coach: 71, bigMarket: false, home: 'KAZ' },
  { id: 'NFT', name: 'Нефтехимик', short: 'Нефтехимик', abbr: 'НХ', city: 'Нижнекамск', conf: 'E', primary: '#005baa', secondary: '#00a651', accent: '#3fa9f5', tier: 0.42, coach: 71, bigMarket: false, home: 'RUS' },
  { id: 'AMR', name: 'Амур', short: 'Амур', abbr: 'АМУР', city: 'Хабаровск', conf: 'E', primary: '#0b3aa0', secondary: '#d52b1e', accent: '#4a7fe8', tier: 0.35, coach: 70, bigMarket: false, home: 'RUS' },
  { id: 'ADM', name: 'Адмирал', short: 'Адмирал', abbr: 'АДМ', city: 'Владивосток', conf: 'E', primary: '#0b1f3a', secondary: '#c9a227', accent: '#e0bb45', tier: 0.32, coach: 70, bigMarket: false, home: 'RUS' },
];

export const KHL_BY_ID: Record<string, KhlClub> = Object.fromEntries(KHL_CLUBS.map((c) => [c.id, c]));
export const isKhlId = (id: string | null | undefined) => !!id && id in KHL_BY_ID;

/** Champion of the 2025-26 season (Lokomotiv beat Ak Bars 4–2 in the final). */
export const KHL_CHAMPION_2026 = 'LOK';
/** 2026-27 calendar: regular season Sep 5 – Mar 20, playoffs Mar 23 – May 23, trade deadline Jan 25. */
export const KHL_GAMES = 68;

/** EAEU players (here: Russia, Belarus, Kazakhstan) are not imports in the KHL. */
const NOT_FOREIGN = new Set(['RUS', 'BLR', 'KAZ']);

/** A player counts against the 5-import limit. Only Russian clubs have the limit:
 *  Dinamo Minsk, Barys and the Shanghai Dragons may sign any number of imports. */
export function isForeignFor(p: Player, team: string) {
  return KHL_BY_ID[team]?.home === 'RUS' && !NOT_FOREIGN.has(p.ctry);
}

/** Foreign players under contract per KHL club, in one pass over the world. */
export function foreignCounts(L: League): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id in L.players) {
    const x = L.players[id];
    if (x.team && x.c && x.st !== 'RET' && KHL_BY_ID[x.team] && isForeignFor(x, x.team)) out[x.team] = (out[x.team] ?? 0) + 1;
  }
  return out;
}

export function foreignCount(L: League, team: string, exclude?: number) {
  let n = 0;
  for (const id in L.players) {
    const x = L.players[id];
    if (x.team === team && x.id !== exclude && x.c && x.st !== 'RET' && isForeignFor(x, team)) n++;
  }
  return n;
}
