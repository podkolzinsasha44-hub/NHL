import { motion } from 'motion/react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { Screen } from '../components/shell';
import { ACHIEVEMENTS } from '../../engine/achievements';

const TILES: { route: string; icon: string; title: string; sub: (L: ReturnType<typeof useL>) => string }[] = [
  { route: 'draft', icon: '🎯', title: 'Драфт', sub: (L) => (L.draft && !L.draft.done ? `Драфт ${L.draft.year}` : `Драфт ${L.season + 1}`) },
  { route: 'finance', icon: '💰', title: 'Финансы', sub: () => 'Кэп-лист и мёртвые деньги' },
  { route: 'staff', icon: '📋', title: 'Штаб', sub: (L) => `Тренер ${L.teams[L.user].coach.name.split(' ').slice(-1)[0]}` },
  { route: 'career', icon: '👔', title: 'Карьера', sub: (L) => `Доверие ${L.owner.trust}/100` },
  { route: 'history', icon: '📜', title: 'История', sub: (L) => `${L.history.length} сез.` },
  { route: 'achievements', icon: '🏅', title: 'Достижения', sub: (L) => `${Object.keys(L.achievements).length}/${ACHIEVEMENTS.length}` },
  { route: 'album', icon: '🃏', title: 'Альбом', sub: (L) => `${L.album.length} карточек` },
  { route: 'compare', icon: '⚖️', title: 'Сравнение', sub: () => 'Игрок против игрока' },
  { route: 'watch', icon: '⭐', title: 'Избранное', sub: (L) => `${L.watch.length} игроков` },
  { route: 'search', icon: '🔎', title: 'Поиск игроков', sub: (L) => `${Object.keys(L.players).length} в базе` },
  { route: 'glossary', icon: '📖', title: 'Словарь', sub: () => 'Термины без загадок' },
  { route: 'settings', icon: '⚙️', title: 'Настройки', sub: () => 'Сохранения, звук, режимы' },
];

export function MoreScreen() {
  const L = useL();
  const push = useNav((s) => s.push);
  return (
    <Screen title="Ещё" large>
      <div className="grid grid-cols-2 gap-2.5">
        {TILES.map((t, i) => (
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
