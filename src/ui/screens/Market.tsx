import { useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League } from '../../engine/types';
import { Screen } from '../components/shell';
import { Button, Card, Chips, cx, Empty, Pill, Segmented, SectionTitle } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { TeamLogo } from '../components/media';
import { capSpace, extensionOf, marketValue } from '../../engine/contracts';
import { freeAgents } from '../../engine/fa';
import { pickLabel, tradesOpen } from '../../engine/trades';
import { dateShort, money, POS_RU, seasonLabel } from '../format';
import { Term } from '../components/Term';
import { ageOn } from '../../engine/util';

type MTab = 'trade' | 'fa' | 'ext' | 'log';

export function Market({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useState<MTab>((params.tab as MTab) ?? (L.phase === 'freeagency' ? 'fa' : 'trade'));
  return (
    <Screen
      title="Рынок"
      subtitle={`Свободно под потолком: ${money(capSpace(L, L.user))}`}
      headerExtra={
        <div className="px-4 pb-2">
          <Segmented value={tab} onChange={setTab} options={[{ v: 'trade', label: 'Обмены' }, { v: 'fa', label: 'Агенты' }, { v: 'ext', label: 'Продления' }, { v: 'log', label: 'Сделки' }]} />
        </div>
      }
    >
      {tab === 'trade' && <TradeHub L={L} />}
      {tab === 'fa' && <FreeAgents L={L} />}
      {tab === 'ext' && <Extensions L={L} />}
      {tab === 'log' && <TradeLog L={L} />}
    </Screen>
  );
}

function TradeHub({ L }: { L: League }) {
  const nav = useNav();
  const open = tradesOpen(L);
  const teams = Object.values(L.teams).filter((t) => t.id !== L.user).sort((a, b) => a.name.localeCompare(b.name));
  const stratRu = { contend: 'претендент', bubble: 'середняк', rebuild: 'перестройка' } as const;
  return (
    <div>
      {!open && (
        <Card className="border-warn/30 mb-3">
          <div className="font-semibold">Окно обменов закрыто</div>
          <div className="text-[13.5px] text-muted mt-1">{L.phase === 'playoffs' ? 'Во время плей-офф обмены запрещены.' : <>После <Term k="deadline">дедлайна</Term> обмены откроются только после плей-офф.</>}</div>
        </Card>
      )}
      {L.offers.length > 0 && (
        <>
          <SectionTitle className="!mt-1">Предложения вам · {L.offers.length}</SectionTitle>
          <div className="flex flex-col gap-2">
            {L.offers.map((o) => (
              <Card key={o.id} onClick={() => nav.push('trade', { team: o.from, give: o.get, get: o.give, offer: o.id })}>
                <div className="flex items-center gap-3">
                  <TeamLogo id={o.from} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] truncate">{o.note}</div>
                    <div className="text-[12.5px] text-muted truncate">Дают: {[...o.give.players.map((id) => L.players[id]?.ln), ...o.give.picks.map((id) => pickLabel(L, id))].join(', ')}</div>
                  </div>
                  <Pill>до {dateShort(o.expires)}</Pill>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      <Button variant="primary" size="lg" full className="mt-3" disabled={!open} onClick={() => nav.push('trade', {})}>Новый обмен</Button>
      <SectionTitle>Клубы лиги</SectionTitle>
      <div className="glass rounded-3xl py-1">
        {teams.map((t) => (
          <div key={t.id} onClick={() => nav.push('team', { id: t.id })} className="press flex items-center gap-3 px-3 min-h-[56px] active:bg-white/5 rounded-2xl">
            <TeamLogo id={t.id} size={32} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[15px] truncate">{t.name}</div>
              <div className="text-[12px] text-muted">{stratRu[t.strategy]} · под потолком {money(capSpace(L, t.id))}</div>
            </div>
            <div className="w-16"><div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full" style={{ width: `${t.rel}%`, background: t.rel >= 55 ? '#3ddc97' : t.rel >= 40 ? '#8b98ae' : '#ff5a5f' }} /></div><div className="text-[10px] text-muted text-right mt-0.5">отношения</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

type PosF = 'all' | 'F' | 'D' | 'G';
function FreeAgents({ L }: { L: League }) {
  const [pos, setPos] = useState<PosF>('all');
  const [q, setQ] = useState('');
  const nav = useNav();
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return freeAgents(L).filter((p) => (pos === 'all' ? true : pos === 'G' ? p.pos === 'G' : pos === 'D' ? p.pos === 'D' : p.pos !== 'D' && p.pos !== 'G') && (!ql || `${p.fn} ${p.ln}`.toLowerCase().includes(ql)));
  }, [L, pos, q, L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const parent = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: list.length, getScrollElement: () => parent.current?.closest('main') ?? null, estimateSize: () => 66, overscan: 8 });
  return (
    <div>
      <Card className="mb-3 !py-3">
        <div className="text-[13.5px] text-muted">
          {L.phase === 'freeagency' ? <>Идёт главная волна рынка (день {L.fa?.day}). Клубы делают предложения, игроки выбирают лучшее: деньги, срок, шанс на Кубок, роль, налоги.</> : <>Неподписанные игроки. Летом с 1 июля здесь появятся главные <Term k="ufa">UFA</Term> лиги.</>}
        </div>
      </Card>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени" className="glass rounded-2xl w-full h-11 px-4 outline-none text-ink placeholder:text-faint mb-2" />
      <Chips value={pos} onChange={setPos} options={[{ v: 'all', label: `Все · ${freeAgents(L).length}` }, { v: 'F', label: 'Нападающие' }, { v: 'D', label: 'Защитники' }, { v: 'G', label: 'Вратари' }]} />
      {!list.length ? (
        <Empty icon="🛒" title="Никого нет" text="Свободные агенты появятся 1 июля." />
      ) : (
        <div ref={parent} className="glass rounded-3xl mt-3 py-1 relative" style={{ height: virt.getTotalSize() + 8 }}>
          {virt.getVirtualItems().map((v) => {
            const p = list[v.index];
            const offers = L.fa?.offers[p.id]?.length ?? 0;
            return (
              <div key={p.id} className="absolute inset-x-0" style={{ top: v.start + 4, height: v.size }}>
                <PlayerRow
                  p={p}
                  L={L}
                  onClick={() => nav.push('negotiate', { id: p.id, kind: 'fa' })}
                  sub={`${POS_RU[p.pos]} · ${ageOn(p.bd, L.date)} лет · ~${money(marketValue(L, p))}${offers ? ` · ${offers} предл.` : ''}${p.lg && !p.real ? ` · ${p.lg}` : ''}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Extensions({ L }: { L: League }) {
  const nav = useNav();
  const lastSeasonEnd = L.season;
  const mine = Object.values(L.players).filter((p) => p.team === L.user && p.c && p.c.last === lastSeasonEnd && (p.st === 'NHL' || p.st === 'AHL'));
  const pending = mine.filter((p) => !extensionOf(p)).sort((a, b) => b.ovr - a.ovr);
  const done = mine.filter((p) => extensionOf(p));
  return (
    <div>
      <Card className="mb-3 !py-3">
        <div className="text-[13.5px] text-muted">Контракты, которые истекают после сезона {seasonLabel(L.season)}. <Term k="ufa">UFA</Term> уйдут на рынок 1 июля, права на <Term k="rfa">RFA</Term> сохранятся квалификационным предложением.</div>
      </Card>
      {!pending.length && !done.length && <Empty icon="✅" title="Продлевать некого" text="У всех ключевых игроков есть контракты." />}
      {pending.length > 0 && (
        <div className="glass rounded-3xl py-1">
          {pending.map((p) => (
            <PlayerRow key={p.id} p={p} L={L} onClick={() => nav.push('negotiate', { id: p.id, kind: p.c!.exp === 'RFA' ? 'rfa' : 'extend' })}
              sub={`${POS_RU[p.pos]} · ${ageOn(p.bd, L.date)} лет · сейчас ${money(p.c!.aav)} · ${p.c!.exp} · хочет ~${money(marketValue(L, p, L.season + 1))}`} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <>
          <SectionTitle>Уже продлены</SectionTitle>
          <div className="glass rounded-3xl py-1">
            {done.map((p) => <PlayerRow key={p.id} p={p} L={L} sub={`${money(extensionOf(p)!.aav)} до ${seasonLabel(extensionOf(p)!.last)}`} />)}
          </div>
        </>
      )}
    </div>
  );
}

function TradeLog({ L }: { L: League }) {
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const list = L.trades.filter((t) => (mine === 'mine' ? t.user : true));
  if (!L.trades.length) return <Empty icon="🔁" title="Обменов пока нет" text="Здесь будут все сделки лиги с оценками экспертов." />;
  return (
    <div>
      <Chips value={mine} onChange={setMine} options={[{ v: 'all', label: 'Вся лига' }, { v: 'mine', label: 'Мои сделки' }]} />
      <div className="flex flex-col gap-2 mt-3">
        {list.slice(0, 80).map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between text-[12px] text-muted mb-2"><span>{dateShort(t.date)} · {seasonLabel(t.season)}</span>{t.regrade && <Pill color="#7fd3ff">пересмотр</Pill>}</div>
            {[[t.a, t.aGets.names, t.grades?.a, t.regrade?.a], [t.b, t.bGets.names, t.grades?.b, t.regrade?.b]].map(([team, names, g, rg]) => (
              <div key={team as string} className="flex items-start gap-3 py-1">
                <TeamLogo id={team as string} size={26} />
                <div className="flex-1 text-[14px]">{(names as string[]).join(', ')}</div>
                <div className={cx('num text-[18px] w-10 text-right', String(g).startsWith('A') ? 'text-good' : String(g).startsWith('B') ? 'text-ink' : 'text-bad')}>{g}</div>
                {rg && <div className="num text-[14px] text-ice w-8 text-right">→{rg}</div>}
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

