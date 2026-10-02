import { useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { Message } from '../../engine/types';
import { Screen, Sheet } from '../components/shell';
import { Button, cx, Empty } from '../components/kit';
import { dateShort } from '../format';
import { acceptOffer, pickLabel } from '../../engine/trades';
import { PlayerRow } from '../components/rows';
import { TeamLogo } from '../components/media';
import type { League } from '../../engine/types';
import { pressEffect } from '../../engine/press';

export function InboxScreen() {
  const L = useL();
  const [m, setM] = useState<Message | null>(null);
  return (
    <Screen
      title="Входящие"
      subtitle={`${L.inbox.filter((x) => !x.read).length} непрочитанных`}
      right={<Button size="sm" variant="ghost" onClick={() => useGame.getState().act((L) => L.inbox.forEach((x) => (x.read = true)))}>Прочитать всё</Button>}
    >
      {L.inbox.length === 0 && <Empty icon="📭" title="Писем нет" />}
      <div className="glass rounded-3xl overflow-hidden">
        {L.inbox.map((x, i) => (
          <div key={x.id} onClick={() => { useGame.getState().act(() => (x.read = true)); setM(x); }} className={cx('press flex gap-3 px-4 py-3 active:bg-white/5', i && 'border-t hairline')}>
            <div className={cx('w-2 h-2 rounded-full mt-2 shrink-0', x.read ? 'bg-transparent' : 'accent-bg')} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2">
                <span className="text-[12.5px] text-muted truncate">{x.from}</span>
                <span className="text-[11.5px] text-faint shrink-0">{dateShort(x.date)}</span>
              </div>
              <div className={cx('text-[15px] truncate', !x.read && 'font-semibold')}>{x.title}</div>
              <div className="text-[13px] text-muted line-clamp-1">{x.body}</div>
            </div>
          </div>
        ))}
      </div>
      <Sheet open={!!m} onClose={() => setM(null)} title={m?.title}>
        {m && <MessageView m={m} onClose={() => setM(null)} />}
      </Sheet>
    </Screen>
  );
}

export function MessageView({ m, onClose }: { m: Message; onClose: () => void }) {
  const L = useL();
  const nav = useNav();
  const { act, toast } = useGame.getState();
  const offer = m.ref?.type === 'trade' ? L.offers.find((o) => o.id === m.ref!.id) : null;
  return (
    <div>
      <div className="text-[12.5px] text-muted">{m.from} · {dateShort(m.date)}</div>
      <p className="text-[15.5px] leading-relaxed mt-2 whitespace-pre-line">{m.body}</p>
      {offer && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2"><TeamLogo id={offer.from} size={26} /><span className="font-display uppercase">{L.teams[offer.from].short} отдают</span></div>
          <div className="glass rounded-2xl">
            {offer.give.players.map((id) => <PlayerRow key={id} p={L.players[id]} L={L} onClick={() => { onClose(); nav.push('player', { id }); }} />)}
            {offer.give.picks.map((id) => <div key={id} className="px-4 py-3 text-[15px]">🎟️ {pickLabel(L, id)}</div>)}
          </div>
          <div className="font-display uppercase mt-3 mb-2">Вы отдаёте</div>
          <div className="glass rounded-2xl">
            {offer.get.players.map((id) => <PlayerRow key={id} p={L.players[id]} L={L} onClick={() => { onClose(); nav.push('player', { id }); }} />)}
            {offer.get.picks.map((id) => <div key={id} className="px-4 py-3 text-[15px]">🎟️ {pickLabel(L, id)}</div>)}
          </div>
          <div className="flex gap-2 mt-4">
            <Button full variant="good" onClick={() => {
              const r = act((L) => acceptOffer(L, offer.id));
              if (r.ok) { toast(`Сделка с ${L.teams[offer.from].short} оформлена`, 'good'); onClose(); }
              else toast(r.reason ?? 'Не удалось', 'bad');
            }}>Принять</Button>
            <Button full variant="glass" onClick={() => { nav.go('market', 'trade', { team: offer.from, give: offer.get, get: offer.give }); onClose(); }}>Изменить</Button>
            <Button full variant="danger" onClick={() => { act((L) => (L.offers = L.offers.filter((o) => o.id !== offer.id))); onClose(); }}>Отказ</Button>
          </div>
        </div>
      )}
      {m.ref?.type === 'trade' && !offer && <div className="mt-4 text-[13px] text-muted">Предложение больше не действует.</div>}
      {m.ref?.type === 'player' && L.players[Number(m.ref.id)] && (
        <div className="mt-4 glass rounded-2xl">
          <PlayerRow p={L.players[Number(m.ref.id)]} L={L} onClick={() => { onClose(); nav.push('player', { id: Number(m.ref!.id) }); }} />
        </div>
      )}
      {m.ref?.type === 'screen' && (
        <Button variant="primary" full className="mt-4" onClick={() => {
          onClose();
          const id = String(m.ref!.id);
          if (id === 'wrapped') nav.openModal('wrapped');
          else if (id === 'extensions') nav.go('market', 'market', { tab: 'ext' });
          else nav.go('more', id);
        }}>Открыть</Button>
      )}
      {m.choices && !m.resolved && (
        <div className="flex flex-col gap-2 mt-4">
          {m.choices.map((c) => (
            <Button key={c.label} full onClick={() => { act((L) => resolveChoice(L, m, c.effect)); onClose(); }}>{c.label}</Button>
          ))}
        </div>
      )}
      {m.resolved && <div className="mt-4 text-[13px] text-muted">Ваш ответ: {m.resolved}</div>}
    </div>
  );
}

function resolveChoice(L: League, m: Message, effect: string) {
  const c = m.choices?.find((x) => x.effect === effect);
  m.resolved = c?.label ?? effect;
  pressEffect(L, effect);
}
