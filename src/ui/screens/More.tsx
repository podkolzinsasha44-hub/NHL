import { motion } from 'motion/react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { Screen } from '../components/shell';
import { achievementsFor } from '../../engine/achievements';
import { isGM, isNhlGM, proPlayer } from '../../engine/leagues';
import type { League } from '../../engine/types';

type Show = 'all' | 'gm' | 'nhl' | 'pro';
const TILES: { route: string; icon: string; title: string; sub: (L: League) => string; show?: Show }[] = [
  { route: 'draft', icon: '🎯', title: 'Драфт', sub: (L) => (L.draft && !L.draft.done ? `Драфт ${L.draft.year}` : `Драфт ${L.season + 1}`), show: 'nhl' },
  { route: 'intl', icon: '🌍', title: 'Сборные', sub: (L) => L.intl?.current?.name ?? 'ЧМ и Олимпиада' },
  { route: 'finance', icon: '💰', title: 'Финансы', sub: () => 'Кэп-лист и мёртвые деньги', show: 'gm' },
  { route: 'staff', icon: '📋', title: 'Штаб', sub: (L) => `Тренер ${L.teams[L.user].coach.name.split(' ').slice(-1)[0]}`, show: 'gm' },
  { route: 'career', icon: '👔', title: 'Карьера', sub: (L) => (isGM(L) ? `Доверие ${L.owner.trust}/100` : `${L.pro?.log.length ?? 0} сез. · рейтинг ${proPlayer(L)?.ovr ?? '—'}`) },
  { route: 'history', icon: '📜', title: 'История', sub: (L) => `${L.history.length} сез.` },
  { route: 'achievements', icon: '🏅', title: 'Достижения', sub: (L) => { const a = achievementsFor(L); return `${a.filter((x) => L.achievements[x.id]).length}/${a.length}`; } },
  { route: 'album', icon: '🃏', title: 'Альбом', sub: (L) => `${L.album.length} карточек`, show: 'gm' },
  { route: 'compare', icon: '⚖️', title: 'Сравнение', sub: () => 'Игрок против игрока' },
  { route: 'watch', icon: '⭐', title: 'Избранное', sub: (L) => `${L.watch.length} игроков` },
  { route: 'search', icon: '🔎', title: 'Поиск игроков', sub: (L) => `${Object.keys(L.players).length} в базе` },
  { route: 'glossary', icon: '📖', title: 'Словарь', sub: () => 'Термины без загадок' },
  { route: 'settings', icon: '⚙️', title: 'Настройки', sub: () => 'Сохранения, звук, режимы' },
];

const visible = (L: League, s: Show = 'all') => (s === 'all' ? true : s === 'gm' ? isGM(L) : s === 'nhl' ? isNhlGM(L) : !isGM(L));

export function MoreScreen() {
  const L = useL();
  const push = useNav((s) => s.push);
  return (
    <Screen title="Ещё" large>
      <div className="grid grid-cols-2 gap-2.5">
        {TILES.filter((t) => visible(L, t.show)).map((t, i) => (
          <motion.button
            key={t.route}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.025 }}
            onClick={() => push(t.route)}
            className="press glass rounded-3xl p-4 text-left min-h-[104px] flex flex-col"
          >
            <div className="text-[28px] leading-none">{t.icon}</div>
            <div className="font-display uppercase tracking-wide text-[16px] mt-auto pt-3">{t.title}</div>
            <div className="text-[12px] text-muted truncate">{t.sub(L)}</div>
          </motion.button>
        ))}
      </div>
    </Screen>
  );
}
