import { capFor, capSpace, floorFor } from '../engine/contracts';
import { draftPool } from '../engine/draft';
import type { League, Player } from '../engine/types';
import { ageOn, daysBetween } from '../engine/util';
import { money, rosterLabels } from './format';
import { isNhlGM, userDeadline, userLg, userPhase } from '../engine/leagues';

export interface Tip {
  id: string;
  icon: string;
  title: string;
  text: string;
  action?: { label: string; tab: 'office' | 'roster' | 'market' | 'league' | 'more'; route?: string; params?: Record<string, unknown> };
  level: 'info' | 'warn' | 'bad' | 'good';
}

export function assistantTips(L: League): Tip[] {
  const tips: Tip[] = [];
  const mine: Player[] = Object.values(L.players).filter((p) => p.team === L.user && p.st !== 'RET');
  const nhl = mine.filter((p) => p.st === 'NHL');
  const space = capSpace(L, L.user);
  const khl = userLg(L) === 'KHL';
  const ph = userPhase(L);
  const farm = rosterLabels(L, L.user).farm;
  if (space < 0) tips.push({ id: 'cap', icon: '⚠️', level: 'bad', title: 'Превышен потолок зарплат', text: `Перерасход ${money(-space)}. Отправьте игрока в ${farm}, обменяйте контракт или выкупите его.`, action: { label: 'Финансы', tab: 'more', route: 'finance' } });
  const floor = floorFor(L, L.user);
  const hit = capFor(L, L.user) - space;
  if (floor && hit < floor && (ph === 'regular' || ph === 'preseason' || ph === 'offseason')) tips.push({ id: 'floor', icon: '📉', level: 'warn', title: 'Ниже нижней границы потолка', text: `Платёжная ведомость ${money(hit)} при минимуме ${money(floor)}. Подпишите свободных агентов или возьмите контракты в обменах.`, action: { label: 'Свободные агенты', tab: 'market', route: 'market', params: { tab: 'fa' } } });
  const want = mine.filter((p) => p.wantsTrade);
  if (want.length) tips.push({ id: 'want', icon: '😤', level: 'warn', title: `${want[0].fn} ${want[0].ln} просит обмен`, text: 'Недовольный игрок играет хуже и портит атмосферу. Поищите вариант обмена или дайте ему больше игрового времени.', action: { label: 'К игроку', tab: 'roster', route: 'player', params: { id: want[0].id } } });
  const expStars = nhl.filter((p) => p.c && p.c.last === L.season && !p.ext && p.ovr >= 78).sort((a, b) => b.ovr - a.ovr);
  if (expStars.length && L.phase !== 'freeagency') tips.push({ id: 'exp', icon: '✍️', level: 'warn', title: `Истекает контракт: ${expStars[0].ln}${expStars.length > 1 ? ` и ещё ${expStars.length - 1}` : ''}`, text: 'Продлите ключевых игроков заранее — летом на рынке их перехватят.', action: { label: 'Продления', tab: 'market', route: 'market', params: { tab: 'ext' } } });
  const counts = { F: 0, D: 0, G: 0 };
  for (const p of nhl) if (!p.inj) counts[p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F']++;
  const healthyNhl = nhl.filter((p) => !p.inj).length;
  if ((ph === 'regular' || ph === 'preseason') && healthyNhl > 23) tips.push({ id: 'over23', icon: '📋', level: 'warn', title: `В основе ${healthyNhl} здоровых игроков`, text: khl ? `Держите в основе не больше 23 здоровых игроков, остальных — в ${farm}. В КХЛ нет драфта отказов.` : 'По правилам НХЛ в активном составе не больше 23. Отправьте лишних в АХЛ — молодых можно без драфта отказов.', action: { label: 'Состав', tab: 'roster', route: 'roster', params: { view: 'nhl' } } });
  if ((ph === 'regular' || ph === 'preseason') && (counts.F < 12 || counts.D < 6 || counts.G < 2)) tips.push({ id: 'holes', icon: '🩹', level: 'warn', title: 'Не хватает здоровых игроков', text: `Нападающих ${counts.F}/12, защитников ${counts.D}/6, вратарей ${counts.G}/2. Вызовите кого-то из ${farm} или подпишите свободного агента.`, action: { label: 'Состав', tab: 'roster' } });
  const deadline = userDeadline(L);
  if (ph === 'regular' && L.date <= deadline && daysBetween(L.date, deadline) <= 21) {
    const st = L.teams[L.user].strategy;
    tips.push({ id: 'deadline', icon: '⏳', level: 'info', title: `До дедлайна ${daysBetween(L.date, deadline)} дн.`, text: st === 'contend' ? 'Вы в числе фаворитов — самое время докупить недостающее звено.' : st === 'rebuild' ? `Команда далеко от плей-офф. Продайте ветеранов с истекающими контрактами${khl ? '' : ' за пики и проспектов'}.` : 'Вы на грани плей-офф. Решите: усиливаться или копить активы.', action: st === 'rebuild' ? { label: 'Обмены', tab: 'market', route: 'market', params: { tab: 'trade' } } : { label: 'Кого усилить', tab: 'market', route: 'market', params: { tab: 'avail' } } });
  }
  const unsigned = isNhlGM(L) ? mine.filter((p) => !p.c && p.rightsUntil != null && p.rightsUntil <= L.season && p.ovr >= 60) : [];
  if (unsigned.length && (L.phase === 'offseason' || L.phase === 'regular')) tips.push({ id: 'elc', icon: '📝', level: 'warn', title: `Истекают права на ${unsigned[0].ln}`, text: 'Подпишите контракт новичка (ELC), пока права не сгорели 1 июля.', action: { label: 'К игроку', tab: 'roster', route: 'player', params: { id: unsigned[0].id } } });
  if (isNhlGM(L) && (L.phase === 'playoffs' || L.phase === 'offseason') && L.draft && !L.draft.done) {
    const n = draftPool(L, L.draft.year).length;
    tips.push({ id: 'draft', icon: '🎯', level: 'info', title: 'Готовьтесь к драфту', text: `${n} проспектов в пуле. Отправьте скаутов и соберите свой big board — по нему ассистент выберет, если вы не успеете.`, action: { label: 'Драфт', tab: 'more', route: 'draft' } });
  }
  if (L.phase === 'freeagency') tips.push({ id: 'fa', icon: '🛒', level: 'info', title: 'Рынок свободных агентов открыт', text: `Свободно под потолком: ${money(space)}. Лучшие игроки решают в первые дни.`, action: { label: 'Свободные агенты', tab: 'market', route: 'market', params: { tab: 'fa' } } });
  const old = nhl.filter((p) => ageOn(p.bd, L.date) >= 34 && p.c && p.c.aav >= 4_000_000 && p.ovr < 76);
  if (old.length && ph === 'offseason') tips.push({ id: 'old', icon: '🧓', level: 'info', title: `${old[0].ln} теряет форму`, text: 'Дорогой ветеран с падающим рейтингом. Подумайте об обмене с удержанием зарплаты или выкупе.', action: { label: 'К игроку', tab: 'roster', route: 'player', params: { id: old[0].id } } });
  if (L.owner.trust < 30) tips.push({ id: 'owner', icon: '👔', level: L.settings.noFiring ? 'warn' : 'bad', title: L.settings.noFiring ? 'Владелец недоволен' : 'Владелец теряет терпение', text: `Доверие ${L.owner.trust}/100. Цель: ${L.owner.goalText}.${L.settings.noFiring ? ' Уволить вас он не может.' : ''}`, action: { label: 'Карьера', tab: 'more', route: 'career' } });
  if (!tips.length) tips.push({ id: 'ok', icon: '👌', level: 'good', title: 'Всё под контролем', text: 'Срочных задач нет. Можно двигаться дальше — или поискать усиление на рынке.' });
  return tips;
}
