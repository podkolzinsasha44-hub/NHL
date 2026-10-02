import { useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { Coach, League } from '../../engine/types';
import { Screen } from '../components/shell';
import { Button, Card, Chips, cx, Meter, Pill, SectionTitle, Stat } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { TeamLogo } from '../components/media';
import { capHit, capSpace, extensionOf } from '../../engine/contracts';
import { money, recordStr, seasonLabel } from '../format';
import { capOf } from '../../engine/util';
import { pickLabel, projectedSlot, tradesOpen } from '../../engine/trades';
import { teamPower } from '../../engine/lines';
import { Term } from '../components/Term';
import { COACH_FIRST, COACH_LAST } from '../../engine/names';
import { hash01 } from '../../engine/rng';

export function FinanceScreen() {
  const L = useL();
  const seasons = [0, 1, 2, 3, 4].map((i) => L.season + i);
  const mine = Object.values(L.players).filter((p) => p.team === L.user && (p.c || p.ext) && p.st !== 'RET');
  const rows = mine
    .map((p) => {
      const vals = seasons.map((s) => {
        if (p.c && p.c.last >= s && (s > L.season || p.st === 'NHL' || p.c.aav > 1_225_000)) return p.c.aav - (p.c.retainedBy?.reduce((a, r) => a + r.amount, 0) ?? 0);
        const e = extensionOf(p);
        if (e && e.last >= s && p.c && s > p.c.last) return e.aav;
        return 0;
      });
      return { p, vals };
    })
    .filter((r) => r.vals.some((v) => v > 0))
    .sort((a, b) => b.vals[0] - a.vals[0]);
  const dead = L.dead.filter((d) => d.team === L.user && d.season >= L.season);
  return (
    <Screen title="Финансы" subtitle="Кэп-лист на 5 сезонов">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Потолок" value={money(capOf(L), 1)} />
        <Stat label="Занято" value={money(capHit(L, L.user), 1)} />
        <Stat label="Свободно" value={money(capSpace(L, L.user), 1)} accent />
      </div>
      <Card className="mt-2 !py-3 text-[13px] text-muted">
        <Term k="cap">Потолок</Term> {seasonLabel(L.season)}: {money(capOf(L))}, следующий сезон: {money(capOf(L, L.season + 1))}. <Term k="floor">Нижняя граница</Term>: {money(L.meta.floor[L.season] ?? capOf(L) * 0.74)}. В АХЛ на потолок засчитывается только часть зарплаты выше {money(L.meta.minSalary[L.season] + 375_000)}.
      </Card>
      <SectionTitle>Контракты</SectionTitle>
      <Card pad={false} className="overflow-x-auto">
        <table className="w-full text-[12.5px] tnum min-w-[520px]">
          <thead>
            <tr className="text-muted text-[11px]">
              <th className="text-left font-medium px-3 py-2 sticky left-0 bg-[#0d1220]">Игрок</th>
              {seasons.map((s) => <th key={s} className="text-right font-medium pr-3">{seasonLabel(s)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, vals }) => (
              <tr key={p.id} className="border-t hairline">
                <td className="px-3 py-2 sticky left-0 bg-[#0d1220] whitespace-nowrap">{p.fn[0]}. {p.ln} <span className="text-faint">{p.st === 'AHL' ? 'АХЛ' : ''}{p.c?.clause ? ` ${p.c.clause}` : ''}</span></td>
                {vals.map((v, i) => <td key={i} className={cx('text-right pr-3', !v && 'text-faint', p.c && i === p.c.last - L.season && (p.c.exp === 'UFA' ? 'text-warn' : 'text-ice'))}>{v ? money(v, 1) : '—'}</td>)}
              </tr>
            ))}
            {dead.length > 0 && seasons.some((s) => dead.some((d) => d.season === s)) && (
              <tr className="border-t hairline text-bad">
                <td className="px-3 py-2 sticky left-0 bg-[#0d1220]">Мёртвые деньги</td>
                {seasons.map((s) => { const v = dead.filter((d) => d.season === s).reduce((a, d) => a + d.amount, 0); return <td key={s} className="text-right pr-3">{v ? money(v, 1) : '—'}</td>; })}
              </tr>
            )}
            <tr className="border-t hairline font-semibold">
              <td className="px-3 py-2 sticky left-0 bg-[#0d1220]">Итого</td>
              {seasons.map((s) => <td key={s} className="text-right pr-3">{money(capHit(L, L.user, s), 1)}</td>)}
            </tr>
            <tr className="text-good">
              <td className="px-3 py-2 sticky left-0 bg-[#0d1220]">Свободно</td>
              {seasons.map((s) => <td key={s} className="text-right pr-3">{money(capSpace(L, L.user, s), 1)}</td>)}
            </tr>
          </tbody>
        </table>
      </Card>
      <div className="text-[12px] text-muted mt-2 px-1"><span className="text-warn">Жёлтым</span> — последний год перед <Term k="ufa">UFA</Term>, <span className="text-ice">голубым</span> — перед <Term k="rfa">RFA</Term>.</div>
    </Screen>
  );
}

const STAFF_COST = [0, 1_000_000, 2_500_000, 4_500_000];
export function StaffScreen() {
  const L = useL();
  const t = L.teams[L.user];
  const { act, toast } = useGame.getState();
  const [hire, setHire] = useState(false);
  const candidates: Coach[] = Array.from({ length: 5 }, (_, i) => {
    const r = (k: number) => hash01(L.season * 97 + i * 13, k);
    return {
      name: `${COACH_FIRST[Math.floor(r(1) * COACH_FIRST.length)]} ${COACH_LAST[Math.floor(r(2) * COACH_LAST.length)]}`,
      rating: Math.round(62 + r(3) * 28),
      style: (['offense', 'defense', 'balanced', 'development'] as const)[Math.floor(r(4) * 4)],
      age: Math.round(40 + r(5) * 25),
      salary: Math.round((1.5 + r(6) * 4) * 10) / 10 * 1_000_000,
    };
  });
  const styleRu = { offense: 'атакующий', defense: 'оборонительный', balanced: 'универсал', development: 'развитие молодёжи' };
  const staffRu = { med: ['Медицина', 'Быстрее восстановление после травм'], analytics: ['Аналитика', 'Точнее оценка игроков и прогнозы'], scouting: ['Скаутинг', 'Больше скаутских поездок и точнее потенциал'] } as const;
  return (
    <Screen title="Штаб" subtitle="Тренеры и персонал">
      <Card>
        <div className="text-[11px] uppercase text-muted">Главный тренер</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <div className="font-display uppercase text-[22px]">{t.coach.name}</div>
            <div className="text-[13px] text-muted">{t.coach.age} лет · стиль: {styleRu[t.coach.style]}</div>
          </div>
          <div className="text-right"><div className="num text-[34px] text-gold">{t.coach.rating}</div><div className="text-[11px] text-muted">рейтинг</div></div>
        </div>
        <div className="text-[12.5px] text-muted mt-2">Рейтинг тренера влияет на игру всех звеньев (<Term k="chem">система</Term>). Стиль «развитие» ускоряет рост молодых.</div>
        <Button className="mt-3" onClick={() => setHire(!hire)}>{hire ? 'Скрыть кандидатов' : 'Сменить тренера'}</Button>
        {hire && (
          <div className="mt-3 flex flex-col gap-2">
            {candidates.map((c) => (
              <div key={c.name} className="glass rounded-2xl p-3 flex items-center gap-3">
                <div className="flex-1"><div className="font-semibold">{c.name}</div><div className="text-[12px] text-muted">{c.age} лет · {styleRu[c.style]} · {money(c.salary)}</div></div>
                <div className="num text-[22px]">{c.rating}</div>
                <Button size="sm" variant="primary" onClick={() => { act((L) => { L.teams[L.user].coach = c; L.owner.trust = Math.max(0, L.owner.trust - 2); }); toast(`${c.name} — новый главный тренер`, 'good'); setHire(false); }}>Нанять</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <SectionTitle>Службы клуба</SectionTitle>
      <div className="flex flex-col gap-2">
        {(['med', 'analytics', 'scouting'] as const).map((k) => (
          <Card key={k} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold">{staffRu[k][0]}</div>
              <div className="text-[12.5px] text-muted">{staffRu[k][1]}</div>
              <div className="flex gap-1 mt-2">{[1, 2, 3].map((lv) => <div key={lv} className={cx('h-1.5 w-10 rounded-full', lv <= t.staff[k] ? 'accent-bg' : 'bg-white/10')} />)}</div>
            </div>
            {t.staff[k] < 3 ? (
              <Button size="sm" onClick={() => {
                const ok = act((L) => {
                  const tm = L.teams[L.user];
                  if (L.owner.trust < 35) return false;
                  tm.staff[k]++;
                  L.owner.trust = Math.max(0, L.owner.trust - 3);
                  return true;
                });
                toast(ok ? 'Бюджет согласован с владельцем' : 'Владелец не одобряет расходы при таком доверии', ok ? 'good' : 'bad');
              }}>+ {money(STAFF_COST[t.staff[k] + 1] ?? 0)}</Button>
            ) : <Pill color="#3ddc97">максимум</Pill>}
          </Card>
        ))}
      </div>
      <div className="text-[12px] text-muted mt-2 px-1">Расширение служб требует одобрения владельца (немного снижает доверие).</div>
    </Screen>
  );
}

export function TeamScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const nav = useNav();
  const t = L.teams[String(params.id)];
  const [tab, setTab] = useState<'roster' | 'picks' | 'info'>('roster');
  if (!t) return null;
  const roster = Object.values(L.players).filter((p) => p.team === t.id && p.st === 'NHL').sort((a, b) => b.ovr - a.ovr);
  const prospects = Object.values(L.players).filter((p) => p.team === t.id && p.st !== 'NHL' && p.st !== 'RET').sort((a, b) => b.pot - a.pot).slice(0, 20);
  const picks = L.picks.filter((p) => p.owner === t.id && !p.used).sort((a, b) => a.season - b.season || a.round - b.round);
  const stratRu = { contend: 'Претендент', bubble: 'Середняк', rebuild: 'Перестройка' } as const;
  return (
    <Screen title={t.name} subtitle={`${recordStr(t)} · ${t.rec.pts} оч.`}>
      <div className="flex items-center gap-4 py-2">
        <TeamLogo id={t.id} size={72} />
        <div className="flex-1">
          <div className="flex gap-2 flex-wrap"><Pill>{stratRu[t.strategy]}</Pill><Pill>Сила {teamPower(L, t).toFixed(1)}</Pill>{t.cups > 0 && <Pill color="#e8c26a">🏆 ×{t.cups}</Pill>}</div>
          <div className="text-[13px] text-muted mt-2">Под потолком: {money(capSpace(L, t.id))} · тренер {t.coach.name}</div>
          {t.id !== L.user && <div className="mt-1.5"><div className="text-[11px] text-muted">Отношения с вами</div><Meter value={t.rel} className="w-40" /></div>}
        </div>
      </div>
      {t.id !== L.user && tradesOpen(L) && <Button variant="primary" full onClick={() => nav.go('market', 'trade', { team: t.id })}>Предложить обмен</Button>}
      <div className="mt-3"><Chips value={tab} onChange={setTab} options={[{ v: 'roster', label: `Состав · ${roster.length}` }, { v: 'picks', label: `Пики · ${picks.length}` }, { v: 'info', label: 'Проспекты' }]} /></div>
      {tab === 'roster' && <div className="glass rounded-3xl py-1 mt-3">{roster.map((p) => <PlayerRow key={p.id} p={p} L={L} />)}</div>}
      {tab === 'info' && <div className="glass rounded-3xl py-1 mt-3">{prospects.map((p) => <PlayerRow key={p.id} p={p} L={L} showPot />)}</div>}
      {tab === 'picks' && (
        <Card pad={false} className="mt-3">
          {picks.map((p, i) => <div key={p.id} className={cx('flex items-center justify-between px-4 h-11 text-[14px]', i && 'border-t hairline')}><span>{pickLabel(L, p.id)}</span><span className="text-muted text-[12.5px]">~№{projectedSlot(L, p)}</span></div>)}
        </Card>
      )}
    </Screen>
  );
}

export type { League };
