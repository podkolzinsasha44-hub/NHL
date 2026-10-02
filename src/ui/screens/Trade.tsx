import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, TradeAsset } from '../../engine/types';
import { Screen, Sheet, Dialog, Icon } from '../components/shell';
import { Button, Card, Chips, cx, Ovr, SectionTitle } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { PlayerPhoto, TeamLogo } from '../components/media';
import { askPrice, checkTrade, evaluateForAI, executeTrade, pickLabel, projectedSlot, tradesOpen, type AIResponse } from '../../engine/trades';
import { capSpace } from '../../engine/contracts';
import { money, POS_RU } from '../format';
import { Term } from '../components/Term';

const empty = (): TradeAsset => ({ players: [], picks: [], retain: {} });

export function TradeScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const nav = useNav();
  const { act, toast } = useGame.getState();
  const [partner, setPartner] = useState<string | null>((params.team as string) ?? null);
  const [give, setGive] = useState<TradeAsset>(() => ({ ...empty(), ...(params.give as TradeAsset | undefined) }));
  const [get, setGet] = useState<TradeAsset>(() => ({ ...empty(), ...(params.get as TradeAsset | undefined) }));
  const [picker, setPicker] = useState<'give' | 'get' | 'team' | null>(partner ? null : 'team');
  const [resp, setResp] = useState<AIResponse | null>(null);
  const [done, setDone] = useState<{ grade: string } | null>(null);

  const evalNow = useMemo(() => {
    if (!partner || (!give.players.length && !give.picks.length) || (!get.players.length && !get.picks.length)) return null;
    return evaluateForAI(L, partner, get, give);
  }, [L, partner, give, get]);
  const check = partner ? checkTrade(L, L.user, partner, give, get) : null;

  const moodLabel = (m: number) => (m >= 0 ? 'Готовы подписать' : m > -0.25 ? 'Тепло' : m > -0.55 ? 'Прохладно' : 'Холодно');
  const mood = evalNow?.mood ?? -1;

  const submit = () => {
    if (!partner) return;
    if (!check?.ok) return toast(check?.reason ?? 'Сделка невозможна', 'bad');
    const r = evaluateForAI(L, partner, get, give);
    setResp(r);
    if (r.accept) {
      const rec = act((L) => executeTrade(L, L.user, partner, give, get));
      if (params.offer) act((L) => (L.offers = L.offers.filter((o) => o.id !== params.offer)));
      setDone({ grade: rec.grades?.a ?? 'B' });
    } else {
      act((L) => (L.teams[partner].rel = Math.max(0, L.teams[partner].rel - (r.mood < -0.6 ? 2 : 0))));
    }
  };

  const ask = () => {
    if (!partner) return;
    if (!get.players.length && !get.picks.length) return toast('Сначала выберите, что хотите получить', 'bad');
    const req = askPrice(L, partner, get);
    if (!req) return toast(`${L.teams[partner].short}: у вас нет того, что нас заинтересует`, 'bad');
    setGive({ ...req, retain: {} });
    setResp({ accept: false, mood: 0, message: 'Вот что мы хотим взамен.' });
  };

  if (!tradesOpen(L)) {
    return <Screen title="Обмен"><Card className="mt-4">Окно обменов сейчас закрыто.</Card></Screen>;
  }

  const t = partner ? L.teams[partner] : null;
  return (
    <Screen title="Обмен" subtitle={t ? `с ${t.name}` : 'Выберите клуб'}>
      {/* Partner */}
      <button onClick={() => setPicker('team')} className="press glass rounded-3xl w-full p-3 flex items-center gap-3 text-left">
        {t ? <TeamLogo id={t.id} size={40} /> : <div className="w-10 h-10 rounded-full bg-white/10" />}
        <div className="flex-1">
          <div className="font-display uppercase text-[17px]">{t ? t.name : 'Выбрать партнёра'}</div>
          {t && <div className="text-[12.5px] text-muted">{{ contend: 'Претендент — ценят готовых игроков', bubble: 'Середняк', rebuild: 'Перестройка — ценят молодёжь и пики' }[t.strategy]} · под потолком {money(capSpace(L, t.id))}</div>}
        </div>
        <Icon name="swap" className="text-muted" />
      </button>

      <AssetBox L={L} title="Вы отдаёте" team={L.user} a={give} setA={setGive} onAdd={() => setPicker('give')} retainable />
      <div className="flex justify-center -my-1 relative z-10"><div className="w-10 h-10 rounded-full glass-strong flex items-center justify-center"><Icon name="swap" size={18} className="rotate-90" /></div></div>
      <AssetBox L={L} title={t ? `${t.short} отдают` : 'Вы получаете'} team={partner} a={get} setA={setGet} onAdd={() => partner && setPicker('get')} />

      {/* AI reaction */}
      {partner && (
        <Card className="mt-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted">Реакция {t?.short}</div>
            <div className={cx('text-[13px] font-semibold', mood >= 0 ? 'text-good' : mood > -0.25 ? 'text-warn' : 'text-muted')}>{evalNow ? moodLabel(mood) : '—'}</div>
          </div>
          <div className="relative h-3 rounded-full mt-2 overflow-hidden" style={{ background: 'linear-gradient(90deg,#3a4a66,#8b98ae 45%,#ffb547 75%,#3ddc97)' }}>
            <motion.div className="absolute top-[-3px] w-1.5 h-[18px] rounded-full bg-white shadow" animate={{ left: `calc(${((mood + 1) / 2) * 100}% - 3px)` }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} />
          </div>
          {check && !check.ok && (give.players.length + give.picks.length > 0) && (get.players.length + get.picks.length > 0) && <div className="text-[13px] text-bad mt-2">{check.reason}</div>}
          <div className="text-[12px] text-muted mt-2">ИИ оценивает возраст, контракт, потенциал и свою стратегию. Точные цифры скрыты — как в реальных переговорах.</div>
        </Card>
      )}

      <AnimatePresence>
        {resp && !done && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="mt-3 flex gap-3 items-start">
              {t && <TeamLogo id={t.id} size={30} />}
              <div className="flex-1">
                <div className="text-[14.5px]">«{resp.message}»</div>
                {resp.counter && (
                  <Button size="sm" variant="primary" className="mt-2" onClick={() => {
                    setGive({ players: [...give.players, ...resp.counter!.players], picks: [...give.picks, ...resp.counter!.picks], retain: give.retain });
                    setResp(null);
                  }}>Добавить в сделку</Button>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 mt-4">
        <Button full onClick={ask} disabled={!partner}>Что вы хотите?</Button>
        <Button full variant="primary" onClick={submit} disabled={!partner}>Предложить</Button>
      </div>

      {/* Pickers */}
      <Sheet open={picker === 'team'} onClose={() => setPicker(null)} title="Клуб-партнёр" full>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(L.teams).filter((x) => x.id !== L.user).sort((a, b) => a.id.localeCompare(b.id)).map((x) => (
            <button key={x.id} onClick={() => { setPartner(x.id); setGet(empty()); setResp(null); setPicker(null); }} className={cx('press glass rounded-2xl p-2 flex flex-col items-center gap-1', partner === x.id && 'border-[var(--accent)]')}>
              <TeamLogo id={x.id} size={38} />
              <div className="text-[11px] font-display">{x.id}</div>
            </button>
          ))}
        </div>
      </Sheet>
      <AssetPicker L={L} open={picker === 'give'} team={L.user} a={give} setA={setGive} onClose={() => setPicker(null)} />
      {partner && <AssetPicker L={L} open={picker === 'get'} team={partner} a={get} setA={setGet} onClose={() => setPicker(null)} />}

      <Dialog open={!!done} onClose={() => { setDone(null); nav.pop(); }}>
        <div className="text-center">
          <motion.div initial={{ scale: 2.2, rotate: -18, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="inline-block border-4 border-good text-good font-display uppercase text-[28px] px-4 py-1 rounded-xl tracking-widest">Сделка!</motion.div>
          <div className="text-[14px] text-muted mt-4">Оценка экспертов для вашего клуба</div>
          <div className={cx('num text-[56px] leading-none mt-1', done?.grade.startsWith('A') ? 'text-good' : done?.grade.startsWith('B') ? 'text-ink' : 'text-bad')}>{done?.grade}</div>
          <Button variant="primary" full className="mt-5" onClick={() => { setDone(null); nav.pop(); }}>Отлично</Button>
        </div>
      </Dialog>
    </Screen>
  );
}

function AssetBox({ L, title, team, a, setA, onAdd, retainable }: { L: League; title: string; team: string | null; a: TradeAsset; setA: (a: TradeAsset) => void; onAdd: () => void; retainable?: boolean }) {
  const total = a.players.reduce((s, id) => s + (L.players[id].c?.aav ?? 0) * (1 - (a.retain?.[id] ?? 0)), 0);
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-muted">{money(total)} кэп-хит</span>}>{title}</SectionTitle>
      <div className="glass rounded-3xl py-1">
        {a.players.map((id) => {
          const p = L.players[id];
          const r = a.retain?.[id] ?? 0;
          return (
            <div key={id}>
              <PlayerRow p={p} L={L} right={<button onClick={(e) => { e.stopPropagation(); setA({ ...a, players: a.players.filter((x) => x !== id) }); }} className="press w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-1" aria-label="Убрать"><Icon name="close" size={14} /></button>} />
              {retainable && p.c && (
                <div className="flex items-center gap-2 px-4 pb-2 -mt-1">
                  <span className="text-[12px] text-muted"><Term k="retain">Удержать</Term>:</span>
                  {[0, 0.25, 0.5].map((v) => (
                    <button key={v} onClick={() => setA({ ...a, retain: { ...(a.retain ?? {}), [id]: v } })} className={cx('press h-7 px-2.5 rounded-full text-[12px]', r === v ? 'bg-white text-[#05070d]' : 'bg-white/10')}>{v * 100}%</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {a.picks.map((id) => (
          <div key={id} className="flex items-center gap-3 px-4 min-h-[52px]">
            <div className="w-[46px] h-[46px] rounded-full bg-white/8 flex items-center justify-center text-xl">🎟️</div>
            <div className="flex-1"><div className="font-medium text-[15px]">{pickLabel(L, id)}</div><div className="text-[12px] text-muted">прогноз: ~{projectedSlot(L, L.picks.find((p) => p.id === id)!)}-й номер</div></div>
            <button onClick={() => setA({ ...a, picks: a.picks.filter((x) => x !== id) })} className="press w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" aria-label="Убрать"><Icon name="close" size={14} /></button>
          </div>
        ))}
        <button onClick={onAdd} disabled={!team} className="press w-full h-12 flex items-center justify-center gap-2 text-[14.5px] accent-text font-semibold"><Icon name="plus" size={18} /> Добавить</button>
      </div>
    </>
  );
}

function AssetPicker({ L, open, team, a, setA, onClose }: { L: League; open: boolean; team: string; a: TradeAsset; setA: (a: TradeAsset) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'nhl' | 'ahl' | 'rights' | 'picks'>('nhl');
  const players = Object.values(L.players).filter((p) => p.team === team && p.st !== 'RET' && (tab === 'nhl' ? p.st === 'NHL' : tab === 'ahl' ? p.st === 'AHL' : p.st !== 'NHL' && p.st !== 'AHL')).sort((x, y) => y.ovr - x.ovr);
  const picks = L.picks.filter((p) => p.owner === team && !p.used).sort((x, y) => x.season - y.season || x.round - y.round);
  const toggleP = (id: number) => setA({ ...a, players: a.players.includes(id) ? a.players.filter((x) => x !== id) : [...a.players, id] });
  const toggleK = (id: string) => setA({ ...a, picks: a.picks.includes(id) ? a.picks.filter((x) => x !== id) : [...a.picks, id] });
  return (
    <Sheet open={open} onClose={onClose} title={L.teams[team].name} full>
      <Chips value={tab} onChange={setTab} options={[{ v: 'nhl', label: 'НХЛ' }, { v: 'ahl', label: 'АХЛ' }, { v: 'rights', label: 'Права' }, { v: 'picks', label: 'Пики' }]} />
      <div className="mt-3 flex flex-col gap-1">
        {tab !== 'picks' && players.map((p) => {
          const on = a.players.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggleP(p.id)} className={cx('press flex items-center gap-3 px-2 py-2 rounded-2xl text-left', on && 'bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]')}>
              <PlayerPhoto p={p} L={L} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{p.fn[0]}. {p.ln} {p.c?.clause && <span className="text-[11px] text-warn">{p.c.clause}</span>}</div>
                <div className="text-[12px] text-muted truncate">{POS_RU[p.pos]} · {p.c ? `${money(p.c.aav)}×${p.c.last - L.season + 1}` : 'без контракта'}</div>
              </div>
              <Ovr v={p.ovr} size={34} />
              <div className={cx('w-6 h-6 rounded-full border flex items-center justify-center', on ? 'accent-bg border-transparent' : 'border-white/25')}>{on && <Icon name="check" size={14} />}</div>
            </button>
          );
        })}
        {tab === 'picks' && picks.map((p) => {
          const on = a.picks.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggleK(p.id)} className={cx('press flex items-center gap-3 px-3 py-3 rounded-2xl text-left', on && 'bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]')}>
              <div className="text-xl">🎟️</div>
              <div className="flex-1"><div className="text-[15px]">{pickLabel(L, p.id)}</div><div className="text-[12px] text-muted">прогноз ~{projectedSlot(L, p)}-й</div></div>
              <div className={cx('w-6 h-6 rounded-full border flex items-center justify-center', on ? 'accent-bg border-transparent' : 'border-white/25')}>{on && <Icon name="check" size={14} />}</div>
            </button>
          );
        })}
      </div>
      <Button variant="primary" full className="mt-4" onClick={onClose}>Готово</Button>
    </Sheet>
  );
}
