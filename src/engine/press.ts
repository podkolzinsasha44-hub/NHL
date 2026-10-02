// Press conferences: the GM's answers affect morale, fans and the owner.
import { pushMsg, social } from './news';
import { pick } from './rng';
import type { League } from './types';
import { clamp } from './util';

type Situation = 'losing' | 'winning' | 'trade' | 'eliminated' | 'deadline';

const Q: Record<Situation, { q: string; choices: { label: string; effect: string }[] }[]> = {
  losing: [
    { q: 'Команда проиграла пять матчей подряд. Тренер сохранит работу?', choices: [
      { label: '«Я полностью доверяю тренеру»', effect: 'back-coach' },
      { label: '«Все под оценкой, включая тренерский штаб»', effect: 'pressure-coach' },
      { label: '«Игроки должны посмотреть в зеркало»', effect: 'blame-players' },
    ] },
  ],
  winning: [
    { q: 'Пять побед подряд! Это команда-претендент?', choices: [
      { label: '«Мы нацелены на Кубок»', effect: 'hype' },
      { label: '«Работаем от матча к матчу»', effect: 'humble' },
    ] },
  ],
  trade: [
    { q: 'Фанаты спорят о вашем обмене. Что скажете?', choices: [
      { label: '«Этот обмен делает нас сильнее уже сейчас»', effect: 'hype' },
      { label: '«Мы думаем о будущем клуба»', effect: 'future' },
    ] },
  ],
  eliminated: [
    { q: 'Сезон окончен. Что дальше?', choices: [
      { label: '«Будут большие перемены»', effect: 'shakeup' },
      { label: '«Ядро команды останется»', effect: 'core' },
    ] },
  ],
  deadline: [
    { q: 'Дедлайн близко. Вы покупатели или продавцы?', choices: [
      { label: '«Покупаем — идём за Кубком»', effect: 'hype' },
      { label: '«Будем терпеливы»', effect: 'humble' },
    ] },
  ],
};

export function pressConference(L: League, s: Situation) {
  if (L.settings.hideMedia) return;
  const item = pick(Q[s]);
  pushMsg(L, { from: 'Пресс-служба', kind: 'media', title: 'Пресс-конференция', body: item.q, choices: item.choices });
}

export function pressEffect(L: League, effect: string) {
  const t = L.teams[L.user];
  const roster = Object.values(L.players).filter((p) => p.team === L.user && p.st === 'NHL');
  const mor = (d: number) => roster.forEach((p) => (p.morale = clamp(p.morale + d, 0, 100)));
  switch (effect) {
    case 'back-coach': mor(3); L.owner.trust = clamp(L.owner.trust - 1, 0, 100); t.coach.rating = clamp(t.coach.rating + 1, 50, 95); break;
    case 'pressure-coach': mor(-1); t.fans = clamp(t.fans + 3, 0, 100); L.owner.trust = clamp(L.owner.trust + 2, 0, 100); break;
    case 'blame-players': mor(-6); t.fans = clamp(t.fans + 2, 0, 100); break;
    case 'hype': t.fans = clamp(t.fans + 5, 0, 100); L.owner.trust = clamp(L.owner.trust + 1, 0, 100); mor(2); break;
    case 'humble': mor(2); break;
    case 'future': t.fans = clamp(t.fans - 2, 0, 100); L.owner.trust = clamp(L.owner.trust + (L.owner.goal === 'develop' ? 3 : -2), 0, 100); break;
    case 'shakeup': mor(-4); t.fans = clamp(t.fans + 4, 0, 100); break;
    case 'core': mor(5); t.fans = clamp(t.fans - 2, 0, 100); break;
  }
  social(L, pick(['Сильное заявление от GM.', 'Фанаты оценили честность.', 'Посмотрим, подкрепит ли он слова делом.', 'Интересный ответ на пресс-конференции.']), { kind: 'fan', team: L.user });
}
