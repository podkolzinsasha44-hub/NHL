import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League } from '../../engine/types';
import { Icon, Screen } from '../components/shell';
import { Button, Card, Chips, cx, Empty, Ovr, Pill, Segmented, SectionTitle } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { PlayerPhoto, TeamLogo } from '../components/media';
import { PRICE_RU, recommended, tradeAdvice, type TeamNeed, type TradeAdvice, type TradeTarget } from '../../engine/tradeAdvice';
import { capSpace, extensionOf, valueFor } from '../../engine/contracts';
import { leagueTeams, userLg } from '../../engine/leagues';
import { freeAgents } from '../../engine/fa';
import { pickLabel, tradesOpen } from '../../engine/trades';
import { dateShort, money, plural, POS_RU, seasonLabel } from '../format';
import { Term } from '../components/Term';
import { ageOn } from '../../engine/util';

type MTab = 'trade' | 'avail' | 'fa' | 'ext' | 'log';

export function Market({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useState<MTab>((params.tab as MTab) ?? (L.phase === 'freeagency' ? 'fa' : 'trade'));
  return (
    <Screen
      title="Рынок"
      subtitle={`Свободно под потолком: ${money(capSpace(L, L.user))}`}
      headerExtra={
        <div className="px-4 pb-2">
          <Segmented value={tab} onChange={setTab} options={[{ v: 'trade', label: 'Обмены' }, { v: 'avail', label: 'Доступны' }, { v: 'fa', label: 'Агенты' }, { v: 'ext', label: 'Продления' }, { v: 'log', label: 'Сделки' }]} />
        </div>
      }
    >
      {tab === 'trade' && <TradeHub L={L} onAdvisor={() => setTab('avail')} />}
      {tab === 'avail' && <TradeTargets L={L} />}
      {tab === 'fa' && <FreeAgents L={L} />}
      {tab === 'ext' && <Extensions L={L} />}
      {tab === 'log' && <TradeLog L={L} />}
    </Screen>
  );
}

function TradeHub({ L, onAdvisor }: { L: League; onAdvisor: () => void }) {
  const nav = useNav();
  const lg = userLg(L);
  const open = tradesOpen(L, lg);
  const teams = leagueTeams(L, lg).filter((t) => t.id !== L.user).sort((a, b) => a.name.localeCompare(b.name));
  const stratRu = { contend: 'претендент', bubble: 'середняк', rebuild: 'перестройка' } as const;
  return (
    <div>
      {!open && (
        <Card className="border-warn/30 mb-3">
          <div className="font-semibold">Окно обменов закрыто</div>
          <div className="text-[13.5px] text-muted mt-1">{(lg === 'KHL' ? L.khl?.phase === 'playoffs' : L.phase === 'playoffs') ? 'Во время плей-офф обмены запрещены.' : <>После <Term k="deadline">дедлайна</Term>{lg === 'KHL' ? ' (25 января)' : ''} обмены откроются только после плей-офф.</>}</div>
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
      <Card className="mt-3 !py-3" onClick={onAdvisor}>
        <div className="flex items-center gap-3">
          <div className="text-2xl">🧭</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px]">Кого усилить?</div>
            <div className="text-[13px] text-muted">Игроки, которых клубы готовы отдать, и советы под ваш стиль и слабые позиции</div>
          </div>
          <Icon name="back" size={18} className="text-muted shrink-0 rotate-180" />
        </div>
      </Card>
      <SectionTitle>Клубы {lg === 'KHL' ? 'КХЛ' : 'лиги'}</SectionTitle>
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
/** Compact club label: NHL abbreviation, KHL short Russian name. */
const clubTag = (L: League, id: string) => (L.teams[id]?.lg === 'KHL' ? L.teams[id].short : id);
const posMatch = (pos: PosF, p: { pos: string }) => (pos === 'all' ? true : pos === 'G' ? p.pos === 'G' : pos === 'D' ? p.pos === 'D' : p.pos !== 'D' && p.pos !== 'G');

/** Players AI clubs are willing to move, ranked for the user's lineup, tactic and weak spots. */
function TradeTargets({ L }: { L: League }) {
  const nav = useNav();
  const lg = userLg(L);
  const open = tradesOpen(L, lg);
  const a = useMemo(() => tradeAdvice(L), [L, L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [need, setNeed] = useState<string | null>(null);
  const [pos, setPos] = useState<PosF>('all');
  const [depth, setDepth] = useState(false);
  const fits = (t: TradeTarget) => (!need || t.needs.includes(need)) && posMatch(pos, t.p);
  const recs = recommended(a, 60).filter((t) => !need || t.needs.includes(need)).slice(0, 5);
  const shown = new Set(recs.map((t) => t.p.id));
  const upgrades = a.targets.filter((t) => t.slot && t.dPower >= 0.05);
  const list = (depth ? a.targets : upgrades).filter((t) => fits(t) && !shown.has(t.p.id));
  const needTitle = need ? a.needs.find((n) => n.id === need)?.title : null;
  return (
    <div>
      {!open && (
        <Card className="border-warn/30 mb-3 !py-3">
          <div className="font-semibold">Окно обменов закрыто</div>
          <div className="text-[13.5px] text-muted mt-1">Список и советы остаются: подготовьте цели к открытию окна.</div>
        </Card>
      )}
      <Card className="!py-3">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none mt-0.5">🧭</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px]">Стиль команды</div>
            <div className="text-[13.5px] text-muted mt-0.5">{a.style}</div>
          </div>
        </div>
        <button onClick={() => nav.push('staff')} className="press h-11 -mb-1 text-[14px] accent-text font-semibold">Изменить тактику</button>
      </Card>

      <SectionTitle>Что усилить</SectionTitle>
      {!a.needs.length ? (
        <Card className="!py-3"><div className="text-[13.5px] text-muted">Явных слабых мест нет: каждая позиция не хуже средней по лиге. Ниже — игроки, которые всё равно добавят силы.</div></Card>
      ) : (
        <div className="glass rounded-3xl py-1">
          {a.needs.map((n) => <NeedRow key={n.id} n={n} on={need === n.id} onClick={() => setNeed(need === n.id ? null : n.id)} />)}
        </div>
      )}
      {a.needs.length > 0 && <div className="text-[12px] text-faint px-1 mt-1.5">Нажмите на позицию, чтобы оставить только тех, кто её закрывает.</div>}

      <SectionTitle right={need ? <button onClick={() => setNeed(null)} className="press h-11 px-3.5 -mb-2 rounded-full glass text-[13px]">{needTitle} ✕</button> : undefined}>Советуем</SectionTitle>
      {!recs.length ? (
        <Card className="!py-3"><div className="text-[13.5px] text-muted">{need ? 'Сейчас никто из доступных не закрывает эту позицию. Загляните ближе к дедлайну или после смены статуса клубов.' : 'Среди доступных игроков нет тех, кто усилит ваш лучший состав.'}</div></Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {recs.map((t) => <TargetCard key={t.p.id} L={L} t={t} a={a} open={open} />)}
        </div>
      )}

      {a.spare.length > 0 && (
        <>
          <SectionTitle>Чем расплатиться</SectionTitle>
          <div className="text-[13px] text-muted px-1 mb-2">Без этих игроков ваш лучший состав почти не слабеет, а другим клубам они интересны.</div>
          <div className="glass rounded-3xl py-1">
            {a.spare.map((s) => (
              <PlayerRow key={s.p.id} p={s.p} L={L} sub={`${POS_RU[s.p.pos]} · интерес: ${s.interest.map((id) => clubTag(L, id)).join(', ')}`} />
            ))}
          </div>
        </>
      )}

      <SectionTitle right={<span className="text-[12px] text-muted">{list.length}</span>}>{depth ? 'Все доступные' : 'Ещё усиление'}</SectionTitle>
      <Chips value={pos} onChange={setPos} options={[{ v: 'all', label: 'Все' }, { v: 'F', label: 'Нападающие' }, { v: 'D', label: 'Защитники' }, { v: 'G', label: 'Вратари' }]} />
      <TargetList L={L} list={list} gamesLeft={a.gamesLeft} />
      <Button full className="mt-3" onClick={() => setDepth(!depth)}>{depth ? 'Только усиление состава' : `Все доступные игроки · ${a.targets.length}`}</Button>
      <div className="text-[12px] text-faint px-1 mt-3">Доступны — игроки, которых клубы сами готовы отдать: ветераны у перестраивающихся команд и середняков, лишние в составе, истекающие и неудобные контракты. Лидеров клубов тоже можно запросить в конструкторе обмена, но за них просят полную цену.</div>
    </div>
  );
}

function NeedRow({ n, on, onClick }: { n: TeamNeed; on: boolean; onClick: () => void }) {
  const color = n.score >= 0.4 ? '#ff5a5f' : n.score >= 0.2 ? '#ffb547' : '#8b98ae';
  return (
    <button onClick={onClick} className={cx('press w-full flex items-center gap-3 px-3 min-h-[60px] py-2 rounded-2xl text-left', on && 'bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]')}>
      <div className="w-1.5 self-stretch rounded-full my-1" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] truncate">{n.title}</div>
        <div className="text-[12.5px] text-muted leading-snug">{n.detail}</div>
      </div>
      <div className={cx('w-6 h-6 rounded-full border flex items-center justify-center shrink-0', on ? 'accent-bg border-transparent' : 'border-white/25')}>{on && <Icon name="check" size={14} />}</div>
    </button>
  );
}

const ptsText = (pts: number, a: TradeAdvice, lg: 'NHL' | 'KHL') => {
  const n = Math.round(pts);
  return `≈ +${n} ${plural(n, 'очко', 'очка', 'очков')} ${a.gamesLeft >= (lg === 'KHL' ? 68 : 84) ? 'за сезон' : 'до конца сезона'}`;
};

function TargetCard({ L, t, a, open }: { L: League; t: TradeTarget; a: TradeAdvice; open: boolean }) {
  const nav = useNav();
  const p = t.p;
  const lg = userLg(L);
  // The style chip already says it; keep the positional needs.
  const needTitles = t.needs.filter((id) => !(t.styleNote && (id === 'sOff' || id === 'sDef'))).map((id) => a.needs.find((n) => n.id === id)?.title).filter((x): x is string => !!x);
  const years = Math.max(1, p.c!.last - L.season + 1);
  return (
    <div className="glass rounded-3xl p-3">
      <div onClick={() => nav.push('player', { id: p.id })} className="press flex items-center gap-3">
        <PlayerPhoto p={p} L={L} size={48} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15.5px] truncate">{p.fn[0]}. {p.ln}</div>
          <div className="text-[12.5px] text-muted truncate">{POS_RU[p.pos]} · {ageOn(p.bd, L.date)} лет · {money(p.c!.aav)}×{years}</div>
        </div>
        <TeamLogo id={t.team} size={30} />
        <Ovr v={p.ovr} size={40} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <Pill color={t.avail.hot ? '#ffb547' : '#8b98ae'}>{t.avail.reason}</Pill>
        {needTitles.slice(0, 2).map((n) => <Pill key={n} color="#3ddc97">{n}</Pill>)}
        {t.styleNote && <Pill color={t.style > 0 ? '#7fd3ff' : '#8b98ae'}>{t.styleNote}</Pill>}
      </div>
      <div className="text-[13.5px] mt-2 leading-snug">
        {t.slot && <span>{t.slot[0].toUpperCase() + t.slot.slice(1)}</span>}
        {t.replaces && <span className="text-muted"> вместо {t.replaces.ln} ({t.replaces.ovr})</span>}
        {a.gamesLeft > 0 && t.dPts >= 0.5 && <span className="text-good"> · {ptsText(t.dPts, a, lg)}</span>}
      </div>
      <div className="text-[12.5px] text-muted mt-0.5">
        Цена: {PRICE_RU[t.price]} · {t.capShort > 0 ? <span className="text-warn">не влезает под потолок: верните не меньше {money(t.capShort)} зарплаты</span> : 'влезает под потолок'}
      </div>
      <Button variant="primary" full className="mt-3" disabled={!open} icon={<Icon name="swap" size={16} />} onClick={() => nav.push('trade', { team: t.team, get: { players: [p.id], picks: [] }, ask: true })}>Узнать цену</Button>
    </div>
  );
}

function TargetList({ L, list, gamesLeft }: { L: League; list: TradeTarget[]; gamesLeft: number }) {
  const parent = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  // The list sits below other sections: tell the virtualizer where it starts in the scroller.
  useLayoutEffect(() => {
    const el = parent.current, sc = el?.closest('main');
    if (el && sc) setMargin(Math.round(el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop));
  });
  const virt = useVirtualizer({ count: list.length, getScrollElement: () => parent.current?.closest('main') ?? null, estimateSize: () => 66, overscan: 8, scrollMargin: margin });
  if (!list.length) return <Empty icon="🔎" title="Никого" text="Под этот фильтр доступных игроков нет." />;
  return (
    <div ref={parent} className="glass rounded-3xl mt-3 py-1 relative" style={{ height: virt.getTotalSize() + 8 }}>
      {virt.getVirtualItems().map((v) => {
        const t = list[v.index];
        return (
          <div key={t.p.id} className="absolute inset-x-0" style={{ top: v.start - margin + 4, height: v.size }}>
            <PlayerRow
              p={t.p}
              L={L}
              sub={`${clubTag(L, t.team)}${t.slot ? ` · ${t.slot}` : ''} · ${t.avail.reason}`}
              right={gamesLeft > 0 && t.dPts >= 0.5 ? <div className="num text-[14px] text-good mr-1">+{Math.round(t.dPts)}</div> : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}


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
          {L.phase === 'freeagency' ? <>Идёт главная волна рынка (день {L.fa?.day}). Клубы НХЛ и КХЛ делают предложения, игроки выбирают лучшее: деньги после налогов, срок, лигу, шанс на титул, роль.</> : <>Неподписанные игроки. Летом с 1 июля здесь появятся главные <Term k="ufa">UFA</Term> — игроки НХЛ и КХЛ.</>}{userLg(L) === 'KHL' ? ' Сумма — ожидания игрока в КХЛ; иностранцев в клубе может быть не больше пяти.' : ''}
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
                  sub={`${POS_RU[p.pos]} · ${ageOn(p.bd, L.date)} лет · ~${money(valueFor(L, p, L.user))}${offers ? ` · ${offers} предл.` : ''}${p.lg && !p.real ? ` · ${p.lg}` : ''}${p.rights && p.rights !== L.user ? ` · права ${p.rights}` : ''}`}
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
              sub={`${POS_RU[p.pos]} · ${ageOn(p.bd, L.date)} лет · сейчас ${money(p.c!.aav)} · ${p.c!.exp} · хочет ~${money(valueFor(L, p, L.user, L.season + 1))}`} />
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

