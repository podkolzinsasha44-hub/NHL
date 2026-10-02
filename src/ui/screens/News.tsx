import { useState } from 'react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { News } from '../../engine/types';
import { Screen } from '../components/shell';
import { Chips, cx, Empty, Pill } from '../components/kit';
import { TeamLogo } from '../components/media';
import { dateShort } from '../format';

const KIND_ICON: Record<string, string> = {
  trade: '🔁', sign: '✍️', injury: '🩹', game: '🏒', award: '🏆', draft: '🎯', rumor: '👂', owner: '👔', milestone: '🎉', fa: '🛒', league: '📣', social: '💬', suspension: '⛔', retire: '👋', achievement: '🏅',
};

export function NewsItem({ n }: { n: News }) {
  const L = useL();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  if (n.kind === 'social') {
    return (
      <div className="glass rounded-3xl p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-semibold" style={{ background: `hsl(${(n.handle?.length ?? 3) * 37 % 360} 50% 30%)` }}>{n.author?.[0]}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold truncate">{n.author} <span className="text-muted font-normal">{n.handle}</span></div>
            <div className="text-[11.5px] text-faint">{dateShort(n.date)}</div>
          </div>
          {n.team && <TeamLogo id={n.team} size={22} />}
        </div>
        <div className="text-[14.5px] mt-2 leading-snug">{n.title}</div>
        <div className="text-[12px] text-muted mt-2">♥ {n.likes?.toLocaleString('ru-RU')}</div>
      </div>
    );
  }
  return (
    <div
      onClick={() => (n.players?.length === 1 ? nav.push('player', { id: n.players[0] }) : n.body ? setOpen(!open) : null)}
      className={cx('glass rounded-3xl p-3.5 press', n.important && 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)]')}
    >
      <div className="flex gap-3">
        <div className="text-[20px] leading-none mt-0.5">{KIND_ICON[n.kind] ?? '📰'}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-medium leading-snug">{n.title}</div>
          {n.body && (open || n.important) && <div className="text-[13px] text-muted mt-1.5 whitespace-pre-line">{n.body}</div>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11.5px] text-faint">{dateShort(n.date)}</span>
            {n.grade && <Pill className="!h-5 !text-[11px]">{n.grade}</Pill>}
          </div>
        </div>
        {n.team && L.teams[n.team] && <TeamLogo id={n.team} size={24} />}
      </div>
    </div>
  );
}

export function NewsScreen() {
  const L = useL();
  const [f, setF] = useState<'all' | 'mine' | 'social' | 'trade' | 'sign'>('all');
  const list = L.news.filter((n) => (f === 'all' ? true : f === 'mine' ? n.team === L.user : f === 'trade' ? n.kind === 'trade' : f === 'sign' ? n.kind === 'sign' || n.kind === 'fa' : n.kind === 'social'));
  return (
    <Screen title="Лента" subtitle="Новости лиги и соцсети">
      <Chips value={f} onChange={setF} options={[{ v: 'all', label: 'Всё' }, { v: 'mine', label: 'Мой клуб' }, { v: 'social', label: 'Соцсети' }, { v: 'trade', label: 'Обмены' }, { v: 'sign', label: 'Контракты' }]} />
      <div className="flex flex-col gap-2 mt-3">
        {list.length ? list.slice(0, 150).map((n) => <NewsItem key={n.id} n={n} />) : <Empty title="Пока тихо" text="Новости появятся по ходу сезона." />}
      </div>
    </Screen>
  );
}
