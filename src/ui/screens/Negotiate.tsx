import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { Negotiation } from '../../engine/types';
import { Screen } from '../components/shell';
import { Button, Card, cx, Meter, Ovr, Pill, Segmented } from '../components/kit';
import { PlayerPhoto } from '../components/media';
import { capFor, capSpace, makeOffer, maxTerm, minSalaryFor, startNegotiation, valueFor, type OfferResult } from '../../engine/contracts';
import { signingBlock, userFAOffer } from '../../engine/fa';
import { teamLg } from '../../engine/leagues';
import { money, playerAge, POS_FULL } from '../format';
import { Term } from '../components/Term';

export function NegotiateScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const nav = useNav();
  const { act } = useGame.getState();
  const p = L.players[Number(params.id)];
  const kind = (params.kind as Negotiation['kind']) ?? 'extend';
  const n = useMemo(() => act((L) => startNegotiation(L, L.players[Number(params.id)], L.user, kind)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const own = kind !== 'fa';
  const [aav, setAav] = useState(n.ask.aav);
  const [years, setYears] = useState(Math.min(n.ask.years, maxTerm(own)));
  const [clause, setClause] = useState<'none' | 'NTC' | 'NMC'>('none');
  const [log, setLog] = useState<{ me: boolean; text: string; status?: string }[]>([
    { me: false, text: kind === 'fa' ? `Мой клиент открыт к предложениям. Мы ориентируемся на ${money(n.ask.aav)} в год на ${n.ask.years} ${n.ask.years === 1 ? 'год' : n.ask.years < 5 ? 'года' : 'лет'}.` : `Мы готовы обсудить продление. Наши ожидания — ${money(n.ask.aav)} × ${n.ask.years}.` },
  ]);
  const [status, setStatus] = useState<'open' | 'signed' | 'broken'>(n.status);
  if (!p) return <Screen title="Переговоры"><div /></Screen>;
  const mv = valueFor(L, p, L.user, kind === 'fa' ? L.season : L.season + 1);
  const min = minSalaryFor(L, L.user);
  const max = Math.round(capFor(L, L.user) * 0.2);
  const khl = teamLg(L, L.user) === 'KHL';
  const step = khl ? 1000 : 25_000;
  const block = kind === 'fa' ? signingBlock(L, p, L.user) : null;
  const blocked = p.talksBlockedUntil && p.talksBlockedUntil > L.date;
  const offers = L.fa?.offers[p.id]?.filter((o) => o.team !== L.user).length ?? 0;
  const greedTxt = p.pers.greed >= 15 ? 'Жёсткий агент' : p.pers.greed <= 6 ? 'Сговорчивый агент' : 'Деловой агент';
  const loyTxt = p.pers.loy >= 15 ? 'Лоялен клубу' : p.pers.loy <= 6 ? 'Без сантиментов' : null;
  const winTxt = p.pers.win >= 15 ? 'Хочет выигрывать' : null;

  const submit = () => {
    const terms = { aav, years, clause: clause === 'none' ? null : clause } as const;
    setLog((l) => [...l, { me: true, text: `${money(aav)} × ${years} ${clause !== 'none' ? `+ ${clause}` : ''}` }]);
    if (kind === 'fa') {
      const r = act((L) => userFAOffer(L, L.players[p.id], terms));
      setLog((l) => [...l, { me: false, text: r.message, status: r.status }]);
      if (r.status === 'signed') setStatus('signed');
    } else {
      const r: OfferResult = act((L) => makeOffer(L, L.negotiations[p.id] ?? n, terms));
      setLog((l) => [...l, { me: false, text: r.message + (r.counter ? ` Наш ответ: ${money(r.counter.aav)} × ${r.counter.years}.` : ''), status: r.status }]);
      if (r.status === 'accepted') setStatus('signed');
      if (r.status === 'walked') setStatus('broken');
      if (r.counter) setAav(r.counter.aav);
    }
  };

  const cur = L.negotiations[p.id] ?? n;
  return (
    <Screen title="Переговоры" subtitle={`${p.fn} ${p.ln}`}>
      <Card className="flex items-center gap-3">
        <PlayerPhoto p={p} L={L} size={58} />
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-[19px] truncate">{p.fn} {p.ln}</div>
          <div className="text-[12.5px] text-muted">{POS_FULL[p.pos]} · {playerAge(L, p)} лет · {kind === 'fa' ? 'свободный агент' : kind === 'rfa' ? <Term k="rfa">RFA</Term> : <Term k="ufa">UFA</Term>}</div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap"><Pill>{greedTxt}</Pill>{loyTxt && <Pill color="#3ddc97">{loyTxt}</Pill>}{winTxt && <Pill color="#e8c26a">{winTxt}</Pill>}</div>
        </div>
        <Ovr v={p.ovr} size={44} />
      </Card>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Рынок</div><div className="num text-[17px]">{money(mv)}</div></div>
        <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Запрос</div><div className="num text-[17px] text-warn">{money(cur.ask.aav)}</div></div>
        <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Ваш кэп</div><div className="num text-[17px]">{money(capSpace(L, L.user))}</div></div>
      </div>
      {kind === 'fa' && offers > 0 && <div className="text-[13px] text-warn mt-2 px-1">⚡ Есть предложения от {offers} клуб(ов). Агент выберет лучшее.</div>}
      {block && <div className="text-[13px] text-bad mt-2 px-1">{block}</div>}

      {/* Chat */}
      <div className="flex flex-col gap-2 mt-4">
        <AnimatePresence initial={false}>
          {log.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={cx('max-w-[85%] rounded-3xl px-4 py-2.5 text-[14.5px]', m.me ? 'self-end accent-bg text-white rounded-br-lg' : 'self-start glass rounded-bl-lg', m.status === 'walked' && 'border-bad/40')}>
              {!m.me && <div className="text-[11px] text-muted mb-0.5">Агент</div>}
              {m.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {status === 'signed' ? (
        <SignedCard name={`${p.fn} ${p.ln}`} onDone={() => nav.pop()} />
      ) : status === 'broken' || blocked ? (
        <Card className="mt-4 border-bad/30"><div className="font-semibold">Переговоры прерваны</div><div className="text-[13.5px] text-muted mt-1">Агент не выходит на связь. Попробуйте позже — или ищите замену.</div></Card>
      ) : (
        <Card className="mt-4">
          <div className="flex justify-between items-baseline">
            <div className="text-[11px] uppercase tracking-wider text-muted">Зарплата в год (<Term k="aav">AAV</Term>)</div>
            <div className="num text-[26px]">{money(aav)}</div>
          </div>
          <input type="range" min={min} max={max} step={step} value={aav} onChange={(e) => setAav(Number(e.target.value))} className="w-full mt-2 accent-[var(--accent)] h-8" />
          <div className="flex justify-between text-[11px] text-faint -mt-1"><span>{money(min)}</span><span>{money(max)}</span></div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">Срок</div>
            <div className="flex items-center gap-2">
              <button className="press w-10 h-10 rounded-xl glass text-[20px]" onClick={() => setYears(Math.max(1, years - 1))}>−</button>
              <div className="num text-[22px] w-16 text-center">{years} {years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}</div>
              <button className="press w-10 h-10 rounded-xl glass text-[20px]" onClick={() => setYears(Math.min(maxTerm(own), years + 1))}>+</button>
            </div>
          </div>
          {!khl && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-muted mt-3 mb-1.5">Пункты</div>
              <Segmented value={clause} onChange={setClause} options={[{ v: 'none', label: 'Нет' }, { v: 'NTC', label: 'NTC' }, { v: 'NMC', label: 'NMC' }]} />
              <div className="text-[11.5px] text-muted mt-1.5"><Term k="ntc">NTC</Term> и <Term k="nmc">NMC</Term> ценятся игроком, но ограничат вас в будущем.</div>
            </>
          )}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-muted mb-1"><span>Терпение агента</span><span>{Math.max(0, Math.round(cur.patience))}</span></div>
            <Meter value={Math.max(0, cur.patience)} color={cur.patience < 30 ? '#ff5a5f' : cur.patience < 60 ? '#ffb547' : '#3ddc97'} />
          </div>
          <div className="text-[12px] text-muted mt-2">Итого: {money(aav * years)} за {years} {years === 1 ? 'сезон' : years < 5 ? 'сезона' : 'сезонов'}. Слишком низкие предложения злят агента.</div>
          <Button variant="primary" size="lg" full className="mt-4" onClick={submit}>Сделать предложение</Button>
        </Card>
      )}
    </Screen>
  );
}

function SignedCard({ name, onDone }: { name: string; onDone: () => void }) {
  return (
    <Card className="mt-4 text-center overflow-hidden">
      <svg viewBox="0 0 300 80" className="w-full h-20">
        <motion.path
          d="M10 55 C 40 10, 60 70, 90 40 S 140 20, 160 50 S 210 70, 230 35 S 270 30, 290 45"
          fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
      </svg>
      <div className="font-display uppercase text-[22px] tracking-wide">Контракт подписан</div>
      <div className="text-muted text-[14px] mt-1">{name} — в вашей команде</div>
      <Button variant="primary" full className="mt-4" onClick={onDone}>Готово</Button>
    </Card>
  );
}
