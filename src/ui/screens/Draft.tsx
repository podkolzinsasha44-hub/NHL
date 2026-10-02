import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, Player } from '../../engine/types';
import { Screen, Icon } from '../components/shell';
import { Button, Card, Chips, cx, Empty, Pill, SectionTitle } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { TeamLogo } from '../components/media';
import { aiPickFor, currentPick, draftPool, LOTTERY_ODDS, lotteryTeams, makePick, potRange, publicRank, runDraftUntilUser, sendScout } from '../../engine/draft';
import { flag, POS_RU } from '../format';
import { Term } from '../components/Term';
import { ageOn } from '../../engine/util';
import { chime } from '../sound';

export function DraftScreen() {
  const L = useL();
  const nav = useNav();
  const year = L.draft && !L.draft.done ? L.draft.year : L.season + 1;
  const [tab, setTab] = useState<'rank' | 'board' | 'mine' | 'order'>('rank');
  const [region, setRegion] = useState<'all' | 'CHL' | 'USA' | 'EUR' | 'RUS'>('all');
  const ranked = useMemo(() => publicRank(L, year), [L, year, L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const regionOf = (p: Player) => (p.ctry === 'CAN' ? 'CHL' : p.ctry === 'USA' ? 'USA' : ['RUS', 'BLR', 'KAZ'].includes(p.ctry) ? 'RUS' : 'EUR');
  const list = ranked.filter((p) => region === 'all' || regionOf(p) === region);
  const myPicks = L.picks.filter((p) => p.owner === L.user && p.season === year && !p.used).sort((a, b) => (a.slot ?? a.round * 100) - (b.slot ?? b.round * 100));
  const board = L.scouting.board.map((id) => L.players[id]).filter((p) => p && !p.team);
  const toggleBoard = (id: number) => useGame.getState().act((L) => (L.scouting.board = L.scouting.board.includes(id) ? L.scouting.board.filter((x) => x !== id) : [...L.scouting.board, id]));
  return (
    <Screen title={`Драфт ${year}`} subtitle={`${ranked.length} проспектов · 7 раундов · 224 выбора`}>
      {L.phase === 'draft' && L.draft && !L.draft.done && (
        <Button variant="gold" size="lg" full className="mb-3" onClick={() => nav.push('draftRoom')}>Войти в драфт-рум</Button>
      )}
      <Card className="!py-3">
        <div className="flex items-center gap-3">
          <div className="text-[26px]">🎟️</div>
          <div className="flex-1">
            <div className="text-[13px] text-muted">Ваши выборы</div>
            <div className="text-[14.5px]">{myPicks.length ? myPicks.map((p) => (p.slot ? `№${p.slot}` : `${p.round}-й р.`)).join(' · ') : 'нет выборов в этом драфте'}</div>
          </div>
        </div>
        <div className="text-[12.5px] text-muted mt-2">Скауты: {L.scouting.scouts.map((s) => `${s.name.split(' ').slice(-1)[0]} (${s.region})`).join(', ')}. Отправляйте их к интересным игрокам — <Term k="pot">потенциал</Term> станет точнее.</div>
      </Card>
      {L.draft?.lottery && (
        <Card className="mt-2 !py-3" onClick={() => nav.openModal('lottery')}>
          <div className="flex items-center gap-3"><div className="text-[24px]">🎱</div><div className="flex-1"><div className="font-semibold">Лотерея проведена</div><div className="text-[12.5px] text-muted">1-й выбор: {L.teams[L.draft.lottery[0].team].name}</div></div><Pill>смотреть</Pill></div>
        </Card>
      )}
      <div className="mt-3"><Chips value={tab} onChange={setTab} options={[{ v: 'rank', label: 'Рейтинг ЦСБ' }, { v: 'board', label: `Мой board · ${board.length}` }, { v: 'mine', label: 'Мои проспекты' }, { v: 'order', label: <Term k="lottery">Лотерея</Term> }]} /></div>
      {tab === 'rank' && (
        <>
          <div className="mt-2"><Chips value={region} onChange={setRegion} options={[{ v: 'all', label: 'Все' }, { v: 'CHL', label: '🇨🇦 Канада' }, { v: 'USA', label: '🇺🇸 США' }, { v: 'EUR', label: '🇪🇺 Европа' }, { v: 'RUS', label: '🇷🇺 Россия' }]} /></div>
          <div className="glass rounded-3xl py-1 mt-3">
            {list.slice(0, 120).map((p) => (
              <ProspectRow key={p.id} L={L} p={p} rank={ranked.indexOf(p) + 1} onBoard={L.scouting.board.includes(p.id)} toggle={() => toggleBoard(p.id)} />
            ))}
          </div>
        </>
      )}
      {tab === 'board' && (board.length ? (
        <div className="glass rounded-3xl py-1 mt-3">
          {board.map((p, i) => (
            <div key={p.id} className="flex items-center">
              <div className="flex flex-col pl-1">
                <button className="press w-8 h-7 text-muted" onClick={() => i > 0 && useGame.getState().act((L) => { const b = L.scouting.board; [b[i - 1], b[i]] = [b[i], b[i - 1]]; })}>▲</button>
                <button className="press w-8 h-7 text-muted" onClick={() => i < board.length - 1 && useGame.getState().act((L) => { const b = L.scouting.board; [b[i + 1], b[i]] = [b[i], b[i + 1]]; })}>▼</button>
              </div>
              <div className="flex-1 min-w-0"><ProspectRow L={L} p={p} rank={i + 1} onBoard toggle={() => toggleBoard(p.id)} /></div>
            </div>
          ))}
        </div>
      ) : <Empty icon="📋" title="Board пуст" text="Добавляйте проспектов звёздочкой из рейтинга. Если не успеете выбрать сами, ассистент возьмёт лучшего из вашего списка." />)}
      {tab === 'mine' && <MyProspects L={L} />}
      {tab === 'rank' && L.draft?.mocks && !L.draft.done && (
        <>
          <SectionTitle>Мок-драфты экспертов</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {L.draft.mocks.map((m) => (
              <Card key={m.name} className="!p-3">
                <div className="text-[12px] text-muted mb-1.5">{m.name}</div>
                {m.picks.slice(0, 5).map((id, i) => <div key={id} className="text-[13px] truncate"><span className="num text-muted mr-1.5">{i + 1}</span>{L.players[id]?.ln}</div>)}
              </Card>
            ))}
          </div>
        </>
      )}
      {tab === 'rank' && <Redraft L={L} />}
      {tab === 'order' && <LotteryOdds L={L} />}
    </Screen>
  );
}

function ProspectRow({ L, p, rank, onBoard, toggle }: { L: League; p: Player; rank: number; onBoard: boolean; toggle: () => void }) {
  const [lo, hi] = potRange(L, p);
  const nav = useNav();
  const know = L.scouting.know[p.id] ?? 0.15;
  return (
    <div className="flex items-center gap-2.5 px-3 min-h-[62px] py-1.5">
      <div className="num w-6 text-right text-muted text-[14px]">{rank}</div>
      <div onClick={() => nav.push('player', { id: p.id })} className="press flex items-center gap-2.5 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-medium truncate">{p.fn[0]}. {p.ln}</div>
          <div className="text-[12px] text-muted truncate">{POS_RU[p.pos]} · {flag(p.ctry)} {p.lg} · {p.ht} см</div>
        </div>
        <div className="text-right">
          <div className="num text-[15px] text-ice">{lo}–{hi}</div>
          <div className="w-12 h-1 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full bg-ice" style={{ width: `${know * 100}%` }} /></div>
        </div>
      </div>
      <button onClick={toggle} className="press w-10 h-11 flex items-center justify-center" aria-label="В board"><Icon name="star" size={20} className={onBoard ? 'text-gold fill-gold' : 'text-faint'} /></button>
      <button onClick={() => { const ok = useGame.getState().act((L) => sendScout(L, p.id)); useGame.getState().toast(ok ? `Скаут поехал смотреть ${p.ln}` : 'Все скауты заняты до понедельника', ok ? 'good' : 'bad'); }} className="press w-10 h-11 flex items-center justify-center text-[17px]" aria-label="Скаут">🔭</button>
    </div>
  );
}

/** Re-ranking of a draft class a few years later by current rating. */
function Redraft({ L }: { L: League }) {
  const years = [...new Set(Object.values(L.players).filter((p) => p.dr && p.dr.y <= L.season - 2 && p.dr.y >= 2027).map((p) => p.dr!.y))].sort((a, b) => b - a);
  if (!years.length) return null;
  const y = years[0];
  const cls = Object.values(L.players).filter((p) => p.dr?.y === y).sort((a, b) => b.ovr - a.ovr).slice(0, 10);
  return (
    <>
      <SectionTitle>Передрафт {y}: кого надо было брать</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        {cls.map((p, i) => (
          <div key={p.id} className={cx('flex items-center gap-3 px-3 h-11 text-[14px]', i && 'border-t hairline', p.dr?.t === L.user && 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]')}>
            <span className="num w-5 text-muted text-right">{i + 1}</span>
            <span className="flex-1 truncate">{p.fn[0]}. {p.ln}</span>
            <span className="text-[12px] text-muted">был №{p.dr?.p} ({p.dr?.t})</span>
            <span className="num w-8 text-right">{p.ovr}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

function MyProspects({ L }: { L: League }) {
  const list = Object.values(L.players).filter((p) => p.team === L.user && p.st !== 'NHL' && p.st !== 'RET' && ageOn(p.bd, L.date) <= 23).sort((a, b) => b.pot - a.pot);
  if (!list.length) return <Empty title="Нет проспектов" />;
  return <div className="glass rounded-3xl py-1 mt-3">{list.map((p) => <PlayerRow key={p.id} p={p} L={L} showPot />)}</div>;
}

function LotteryOdds({ L }: { L: League }) {
  const teams = L.draft?.lotteryOrder ?? (L.phase === 'regular' || L.phase === 'playoffs' ? lotteryTeams(L) : []);
  if (!teams.length) return <Empty title="Порядок появится к концу сезона" />;
  return (
    <div className="mt-3">
      <div className="text-[13px] text-muted px-1 mb-2">{L.draft?.lottery ? 'Итоговый порядок после лотереи.' : 'Текущие шансы на 1-й выбор (по таблице).'}</div>
      <Card pad={false} className="overflow-hidden">
        {teams.map((t, i) => (
          <div key={t} className={cx('flex items-center gap-3 px-3 h-11 text-[14px]', i && 'border-t hairline', t === L.user && 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]')}>
            <span className="num w-6 text-right text-muted">{i + 1}</span>
            <TeamLogo id={t} size={24} />
            <span className="flex-1 font-display">{L.teams[t].short}</span>
            {!L.draft?.lottery && <span className="num text-ice">{LOTTERY_ODDS[i]}%</span>}
            {L.draft?.lottery?.some((x) => x.team === t) && <Pill color="#e8c26a">выиграл</Pill>}
          </div>
        ))}
      </Card>
    </div>
  );
}

export function DraftRoom() {
  const L = useL();
  const nav = useNav();
  const { act } = useGame.getState();
  const [reveal, setReveal] = useState<Player | null>(null);
  const D = L.draft;
  if (!D || !D.order.length) return <Screen title="Драфт-рум"><Empty title="Драфт ещё не начался" text="Драфт проходит 26 июня." /></Screen>;
  const pk = currentPick(L);
  const myTurn = pk?.owner === L.user;
  const pool = draftPool(L, D.year).filter((p) => D.pool.includes(p.id));
  const ranked = [...pool].sort((a, b) => {
    const ba = L.scouting.board.indexOf(a.id), bb = L.scouting.board.indexOf(b.id);
    if (ba >= 0 || bb >= 0) return (ba < 0 ? 999 : ba) - (bb < 0 ? 999 : bb);
    return (potRange(L, b)[0] + potRange(L, b)[1]) - (potRange(L, a)[0] + potRange(L, a)[1]);
  });
  const recent = D.order.slice(Math.max(0, D.current - 8), D.current).map((id) => L.picks.find((x) => x.id === id)!).reverse();

  const pickPlayer = (p: Player) => {
    act((L) => makePick(L, p.id));
    setReveal(p);
    if (L.settings.sound) chime();
  };
  const advance = () => act((L) => runDraftUntilUser(L));
  return (
    <Screen title={`Драфт ${D.year}`} subtitle={D.done ? 'Завершён' : `Выбор №${D.current + 1} из ${D.order.length}`}>
      {D.done ? (
        <Card className="text-center !py-6">
          <div className="text-[40px]">🎉</div>
          <div className="font-display uppercase text-[22px] mt-2">Драфт завершён</div>
          <Button variant="primary" className="mt-4" onClick={() => nav.go('roster', 'roster', { view: 'rights' })}>Мои проспекты</Button>
        </Card>
      ) : (
        <div className="relative rounded-[26px] p-[1.5px]" style={{ background: myTurn ? 'linear-gradient(135deg,#e8c26a,rgba(255,255,255,0.1),#e8c26a)' : 'rgba(255,255,255,0.1)' }}>
          <div className="rounded-[25px] p-4 bg-[#0a0f1a]">
            <div className="flex items-center gap-3">
              <TeamLogo id={pk!.owner} size={52} />
              <div className="flex-1">
                <div className="text-[12px] uppercase tracking-[0.18em] text-muted">На часах</div>
                <div className="font-display uppercase text-[22px] leading-tight">{L.teams[pk!.owner].name}</div>
                <div className="text-[13px] text-muted">Раунд {pk!.round} · выбор №{pk!.slot}{pk!.orig !== pk!.owner ? ` (от ${pk!.orig})` : ''}</div>
              </div>
            </div>
            {myTurn ? (
              <div className="mt-3 text-[14px] text-gold">Ваш выбор! Выберите проспекта ниже.</div>
            ) : (
              <Button variant="primary" full className="mt-3" onClick={advance}>Симулировать до моего выбора</Button>
            )}
            {myTurn && <Button size="sm" full className="mt-2" onClick={() => pickPlayer(L.players[ranked[0]?.id ?? aiPickFor(L, L.user)])}>Выбрать за меня (лучший по board)</Button>}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <>
          <SectionTitle>Последние выборы</SectionTitle>
          <div className="hscroll flex gap-2 -mx-4 px-4">
            {recent.map((x) => {
              const p = L.players[x.used!];
              return (
                <div key={x.id} className="glass rounded-2xl p-2.5 w-[150px] shrink-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted"><span className="num">№{x.slot}</span><TeamLogo id={x.owner} size={16} />{x.owner}</div>
                  <div className="text-[13.5px] font-medium truncate mt-1">{p.fn[0]}. {p.ln}</div>
                  <div className="text-[11.5px] text-muted">{POS_RU[p.pos]} · {flag(p.ctry)} {p.lg}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {!D.done && (
        <>
          <SectionTitle>Доступные проспекты</SectionTitle>
          <div className="glass rounded-3xl py-1">
            {ranked.slice(0, 60).map((p, i) => {
              const [lo, hi] = potRange(L, p);
              return (
                <div key={p.id} className="flex items-center gap-2.5 px-3 min-h-[60px]">
                  <div className="num w-6 text-right text-muted">{i + 1}</div>
                  <div className="flex-1 min-w-0" onClick={() => nav.push('player', { id: p.id })}>
                    <div className="text-[14.5px] font-medium truncate">{L.scouting.board.includes(p.id) && '⭐ '}{p.fn} {p.ln}</div>
                    <div className="text-[12px] text-muted truncate">{POS_RU[p.pos]} · {flag(p.ctry)} {p.lg} · POT {lo}–{hi}</div>
                  </div>
                  {myTurn && <Button size="sm" variant="gold" onClick={() => pickPlayer(p)}>Выбрать</Button>}
                </div>
              );
            })}
          </div>
        </>
      )}
      <AnimatePresence>
        {reveal && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReveal(null)}>
            <motion.div initial={{ scale: 0.6, rotateY: 90 }} animate={{ scale: 1, rotateY: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 16 }} className="text-center">
              <div className="text-[13px] uppercase tracking-[0.25em] text-gold">С выбором №{reveal.dr?.p} {L.teams[L.user].name} выбирают</div>
              <div className="mx-auto mt-5 w-40 h-48 rounded-3xl flex items-end justify-center relative overflow-hidden" style={{ background: `linear-gradient(180deg, ${L.teams[L.user].primary}, #070b14)` }}>
                <div className="absolute top-3 num text-[44px] text-white/15">#{reveal.dr?.p}</div>
                <TeamLogo id={L.user} size={86} className="mb-10" />
              </div>
              <div className="font-display uppercase text-[34px] leading-none mt-5">{reveal.fn}<br />{reveal.ln}</div>
              <div className="text-muted mt-2">{POS_RU[reveal.pos]} · {flag(reveal.ctry)} {reveal.lg}</div>
              <div className="text-[13px] text-faint mt-6">Нажмите, чтобы продолжить</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  );
}

export function LotteryModal() {
  const L = useL();
  const close = useNav((s) => s.closeModal);
  const D = L.draft;
  const [step, setStep] = useState(0);
  const order = D?.lotteryOrder ?? [];
  const reveal = order.slice(0, 16).reverse();
  return (
    <div className="absolute inset-0 bg-[#05070d] flex flex-col pt-safe pb-safe">
      <div className="arena" style={{ position: 'absolute' }} />
      <div className="relative flex items-center h-14 px-2">
        <button onClick={close} className="press w-11 h-11 rounded-full flex items-center justify-center"><Icon name="close" /></button>
        <div className="flex-1 text-center font-display uppercase tracking-widest">Лотерея драфта {D?.year}</div>
        <div className="w-11" />
      </div>
      <div className="relative scroll flex-1 px-4">
        <div className="text-center text-muted text-[13.5px] mb-4">Конверты вскрываются с 16-го места к 1-му</div>
        <div className="flex flex-col gap-2">
          {reveal.slice(0, step).map((t, i) => ({ t, place: 16 - i })).reverse().map(({ t, place }) => {
            const moved = D?.lottery?.find((x) => x.team === t);
            return (
              <motion.div key={t} initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} className={cx('glass rounded-2xl h-14 px-3 flex items-center gap-3', place <= 2 && 'border-gold/60', t === L.user && 'border-[var(--accent)]')}>
                <div className={cx('num text-[22px] w-8', place <= 2 && 'text-gold')}>{place}</div>
                <TeamLogo id={t} size={32} />
                <div className="flex-1 font-display uppercase">{L.teams[t].short}</div>
                {moved && <Pill color="#e8c26a">↑ с {moved.from}-го</Pill>}
              </motion.div>
            );
          })}
        </div>
        <div className="h-6" />
      </div>
      <div className="relative px-4 pb-3">
        {step < 16 ? (
          <Button variant="gold" size="lg" full onClick={() => setStep(step + (step < 13 ? 13 - step : 1))}>{step < 13 ? 'Вскрыть 16–4' : step === 13 ? 'Третий выбор…' : step === 14 ? 'Второй выбор…' : 'ПЕРВЫЙ ВЫБОР'}</Button>
        ) : (
          <Button variant="primary" size="lg" full onClick={close}>Закрыть</Button>
        )}
      </div>
    </div>
  );
}
