import { useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { GoalieLine, League, Player, SkaterLine } from '../../engine/types';
import { Screen, Sheet, Dialog, Icon } from '../components/shell';
import { Button, Card, cx, Meter, Pill, Segmented, SectionTitle } from '../components/kit';
import { PlayerCard } from '../components/PlayerCard';
import { Sparkline } from '../components/charts';
import { ATTR_RU, dateShort, flag, money, moneyOf, playerAge, POS_FULL, rosterLabels, seasonLabel, statusLabel, toi, TRAIT_RU } from '../format';
import { isGM, isNhlGM, LG_RU, lgOf, teamLg, userLg, userTeam } from '../../engine/leagues';
import { KIND_RU } from '../../engine/intl';
import { potRange, scoutReport, sendScout } from '../../engine/draft';
import { buyoutCost, capSpace, extensionOf, marketValue, valueFor } from '../../engine/contracts';
import { careerGoalie, careerSkater, gaa, statKey, svPct } from '../../engine/stats';
import { interestIn, tradesOpen } from '../../engine/trades';
import { buyoutPlayer, callUp, sendDown, signElc, waivePlayer } from '../actions';
import { AWARD_NAMES } from '../../engine/awards';
import { Term } from '../components/Term';
import { TeamLogo } from '../components/media';
import { ageOn } from '../../engine/util';

export function PlayerScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const p = L.players[Number(params.id)];
  const [tab, setTab] = useState<'info' | 'stats' | 'contract'>('info');
  if (!p) return <Screen title="Игрок"><div /></Screen>;
  const watched = L.watch.includes(p.id);
  return (
    <Screen
      title={`${p.fn} ${p.ln}`}
      subtitle={`${POS_FULL[p.pos]} · ${p.team ? `${L.teams[p.team]?.short} · ${statusLabel(L, p)}` : statusLabel(L, p)}`}
      right={
        <button
          className="press w-11 h-11 rounded-full flex items-center justify-center"
          onClick={() => useGame.getState().act((L) => (L.watch = watched ? L.watch.filter((x) => x !== p.id) : [...L.watch, p.id]))}
          aria-label="В избранное"
        >
          <Icon name="star" className={watched ? 'text-gold fill-gold' : 'text-muted'} />
        </button>
      }
    >
      <div className="pt-2 pb-4">
        <PlayerCard p={p} L={L} width={Math.min(300, window.innerWidth - 80)} />
      </div>
      <Facts L={L} p={p} />
      <Actions L={L} p={p} />
      <Segmented className="mt-5" value={tab} onChange={setTab} options={[{ v: 'info', label: 'Обзор' }, { v: 'stats', label: 'Статистика' }, { v: 'contract', label: 'Контракт' }]} />
      {tab === 'info' && <Info L={L} p={p} />}
      {tab === 'stats' && <Stats L={L} p={p} />}
      {tab === 'contract' && <ContractTab L={L} p={p} />}
    </Screen>
  );
}

function Facts({ L, p }: { L: League; p: Player }) {
  const [lo, hi] = potRange(L, p);
  const items = [
    ['Возраст', `${playerAge(L, p)}`],
    ['Рост/вес', `${p.ht}/${p.wt}`],
    ['Хват', p.sh === 'L' ? 'левый' : 'правый'],
    ['Страна', flag(p.ctry)],
    ['Потенциал', lo === hi ? `${lo}` : `${lo}–${hi}`],
    ['Драфт', p.dr ? `${p.dr.y} · №${p.dr.p}` : '—'],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([k, v]) => (
        <div key={k} className="glass rounded-2xl px-3 py-2">
          <div className="text-[10.5px] uppercase tracking-wider text-muted">{k === 'Потенциал' ? <Term k="pot">{k}</Term> : k}</div>
          <div className="num text-[17px] mt-0.5 truncate">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Actions({ L, p }: { L: League; p: Player }) {
  const nav = useNav();
  const [confirm, setConfirm] = useState<null | 'waive' | 'buyout'>(null);
  const [focus, setFocus] = useState(false);
  const gm = isGM(L);
  const mine = gm && p.team === L.user;
  const ulg = userLg(L);
  const lb = rosterLabels(L, L.user);
  const btns: React.ReactNode[] = [];
  const expiring = p.c && p.c.last === L.season && !extensionOf(p);
  if (!gm) {
    if (p.id === L.pro?.pid) btns.push(<Button key="focus" variant="primary" onClick={() => setFocus(true)}>Фокус тренировок</Button>);
  } else if (mine) {
    if (p.st === 'NHL' || p.st === 'AHL') {
      if (expiring) btns.push(<Button key="ext" variant="primary" onClick={() => nav.push('negotiate', { id: p.id, kind: p.c?.exp === 'RFA' ? 'rfa' : 'extend' })}>Продлить</Button>);
      if (tradesOpen(L, ulg)) btns.push(<Button key="tr" onClick={() => nav.go('market', 'trade', { give: { players: [p.id], picks: [] } })} icon={<Icon name="swap" size={16} />}>Обменять</Button>);
      if (p.st === 'NHL') btns.push(<Button key="down" onClick={() => { if (sendDown(p) === 'needs-waivers') setConfirm('waive'); }}>В {lb.farm}</Button>);
      if (p.st === 'AHL') btns.push(<Button key="up" onClick={() => callUp(p)}>В основу</Button>);
      if (p.c && p.c.type !== 'ELC') btns.push(<Button key="bo" variant="danger" onClick={() => setConfirm('buyout')}>Выкуп</Button>);
      if (p.pos !== 'G' && p.st === 'NHL' && L.teams[L.user].captain !== p.id) btns.push(<Button key="cap" onClick={() => { useGame.getState().act((L) => (L.teams[L.user].captain = p.id)); useGame.getState().toast(`${p.ln} — новый капитан`, 'good'); }}>Капитан ©</Button>);
      if (ageOn(p.bd, L.date) <= 26) btns.push(<Button key="focus" onClick={() => setFocus(true)}>Фокус развития</Button>);
    } else if (!p.c) {
      btns.push(<Button key="elc" variant="primary" onClick={() => signElc(p)}>Подписать ELC</Button>);
    }
  } else if (!p.team && (p.st === 'FA') && L.phase !== 'playoffs') {
    btns.push(<Button key="fa" variant="primary" onClick={() => nav.push('negotiate', { id: p.id, kind: 'fa' })}>Предложить контракт</Button>);
  } else if (p.team && teamLg(L, p.team) === ulg && tradesOpen(L, ulg) && p.st !== 'RET') {
    btns.push(<Button key="tr" variant="primary" onClick={() => nav.go('market', 'trade', { team: p.team, get: { players: [p.id], picks: [] } })} icon={<Icon name="swap" size={16} />}>Предложить обмен</Button>);
  }
  if (isNhlGM(L) && !mine && (p.st === 'JR' || p.st === 'NCAA' || p.st === 'EUR' || p.dy)) {
    btns.push(<Button key="sc" onClick={() => { const ok = useGame.getState().act((L) => sendScout(L, p.id)); useGame.getState().toast(ok ? 'Скаут отправлен — отчёт уточнён' : 'Скауты заняты до следующей недели', ok ? 'good' : 'bad'); }}>Отправить скаута</Button>);
  }
  btns.push(<Button key="cmp" onClick={() => nav.push('compare', { a: p.id })}>Сравнить</Button>);
  const ut = L.teams[L.user];
  if (gm && ut && p.st === 'RET' && p.teams.includes(L.user) && p.num != null && careerSkater(p).gp >= 400 && !ut.retired.some((r) => r[0] === p.num)) {
    btns.push(<Button key="ret" variant="gold" onClick={() => { useGame.getState().act((L) => L.teams[L.user].retired.push([p.num!, `${p.fn} ${p.ln}`, L.season])); useGame.getState().toast(`Номер ${p.num} навсегда закреплён за ${p.ln}`, 'good'); }}>Вывести №{p.num} из обращения</Button>);
  }
  const bc = buyoutCost(L, p);
  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">{btns}</div>
      <Dialog open={confirm === 'waive'} onClose={() => setConfirm(null)}>
        <div className="font-display uppercase text-[19px]">Драфт отказов</div>
        <p className="text-[14.5px] text-muted mt-2">{p.ln} не освобождён от <Term k="waivers">драфта отказов</Term>. Любой клуб может забрать его бесплатно. Рискнуть?</p>
        <div className="flex gap-2 mt-4">
          <Button full onClick={() => setConfirm(null)}>Отмена</Button>
          <Button full variant="danger" onClick={() => { setConfirm(null); waivePlayer(p); }}>Выставить</Button>
        </div>
      </Dialog>
      <Dialog open={confirm === 'buyout'} onClose={() => setConfirm(null)}>
        <div className="font-display uppercase text-[19px]">Выкуп контракта</div>
        {bc && <p className="text-[14.5px] text-muted mt-2">Клуб заплатит {money(bc.total)}. На потолке останется {money(bc.perYear)} в год на {bc.years} сезонов (<Term k="buyout">мёртвые деньги</Term>). Экономия: {money(bc.savingPerYear)} в год.</p>}
        <div className="flex gap-2 mt-4">
          <Button full onClick={() => setConfirm(null)}>Отмена</Button>
          <Button full variant="danger" onClick={() => { setConfirm(null); buyoutPlayer(p); }}>Выкупить</Button>
        </div>
      </Dialog>
      <Sheet open={focus} onClose={() => setFocus(false)} title="Индивидуальный план">
        <p className="text-[14px] text-muted mb-3">Тренеры сделают упор на выбранный навык в летнем лагере (+2–3 к навыку, чуть медленнее остальные).</p>
        <div className="grid grid-cols-2 gap-2">
          {(p.pos === 'G' ? ['po', 'rf', 'rb', 'cs', 'mn', 'pk'] : ['sk', 'sh', 'pa', 'ha', 'oi', 'di', 'ph', 'fo']).map((k) => (
            <Button key={k} variant={p.focus === k ? 'primary' : 'glass'} onClick={() => { useGame.getState().act(() => (p.focus = k as Player['focus'])); setFocus(false); }}>{ATTR_RU[k]}</Button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function AttrBar({ k, v }: { k: string; v: number }) {
  const color = v >= 90 ? '#ff8ad8' : v >= 82 ? '#e8c26a' : v >= 72 ? '#7fd3ff' : v >= 60 ? '#8b98ae' : '#ff5a5f';
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-28 text-[13.5px] text-muted">{ATTR_RU[k]}</div>
      <Meter value={v} color={color} className="flex-1" />
      <div className="num w-8 text-right text-[15px]" style={{ color }}>{v}</div>
    </div>
  );
}

function Info({ L, p }: { L: League; p: Player }) {
  const r = p.r as unknown as Record<string, number>;
  const keys = p.pos === 'G' ? ['po', 'rf', 'rb', 'cs', 'mn', 'pk', 'du'] : ['sk', 'sh', 'pa', 'ha', 'oi', 'di', 'ph', ...(p.pos === 'C' ? ['fo'] : []), 'dc', 'du'];
  const hist = p.hist.slice(-8);
  return (
    <div>
      {p.inj && (
        <Card className="mt-4 border-bad/30 flex gap-3 items-center">
          <div className="text-2xl">🩹</div>
          <div><div className="font-semibold">{p.inj.type}</div><div className="text-[13px] text-muted">Восстановление: ещё {p.inj.days} дн.</div></div>
        </Card>
      )}
      <SectionTitle>Навыки</SectionTitle>
      <Card>{keys.map((k) => <AttrBar key={k} k={k} v={r[k]} />)}</Card>
      {p.tr.length > 0 && (
        <>
          <SectionTitle>Особенности</SectionTitle>
          <div className="flex flex-col gap-2">
            {p.tr.map((t) => (
              <Card key={t} className="flex items-center gap-3 !py-3">
                <div className="text-2xl">{TRAIT_RU[t]?.icon}</div>
                <div><div className="font-semibold text-[15px]">{TRAIT_RU[t]?.name}</div><div className="text-[13px] text-muted">{TRAIT_RU[t]?.desc}</div></div>
              </Card>
            ))}
          </div>
        </>
      )}
      {(p.spd || p.shs) && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {p.spd && <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Макс. скорость (EDGE)</div><div className="num text-[19px]">{p.spd} км/ч</div></div>}
          {p.shs && <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Сильнейший бросок</div><div className="num text-[19px]">{p.shs} км/ч</div></div>}
        </div>
      )}
      <SectionTitle>Скаутский отчёт</SectionTitle>
      <Card><p className="text-[14.5px] leading-relaxed">{scoutReport(L, p)}</p></Card>
      <SectionTitle>Состояние</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Card className="!py-3"><div className="text-[11px] uppercase text-muted"><Term k="morale">Мораль</Term></div><div className="num text-[22px]">{p.morale}</div><Meter value={p.morale} color={p.morale < 35 ? '#ff5a5f' : p.morale < 60 ? '#ffb547' : '#3ddc97'} /></Card>
        <Card className="!py-3"><div className="text-[11px] uppercase text-muted"><Term k="form">Форма</Term></div><div className="num text-[22px]">{p.form > 0.25 ? '🔥' : p.form < -0.25 ? '🧊' : '—'} {(p.form * 10).toFixed(1)}</div><Meter value={p.form + 1} max={2} /></Card>
      </div>
      {hist.length >= 2 && (
        <>
          <SectionTitle>Динамика рейтинга</SectionTitle>
          <Card className="flex justify-center"><Sparkline values={hist.map((h) => h[1])} labels={hist.map((h) => String(h[0]).slice(2))} width={300} height={70} /></Card>
        </>
      )}
      {(p.awards.length > 0 || (p.intl ?? []).some((x) => x.split(':').length === 3)) && (
        <>
          <SectionTitle>Награды</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {(p.intl ?? []).filter((x) => x.split(':').length === 3).map((m) => { const [k, y, c] = m.split(':'); return <Pill key={m} color={c === 'gold' ? '#e8c26a' : c === 'silver' ? '#c9d4e4' : '#c08a5a'}>{c === 'gold' ? '🥇' : c === 'silver' ? '🥈' : '🥉'} {KIND_RU[k as 'wc' | 'og']}-{y}</Pill>; })}
            {p.awards.map((a) => { const [k, y] = a.split(':'); return <Pill key={a} color="#e8c26a">🏆 {AWARD_NAMES[k]?.split(' — ')[0] ?? k} {y}</Pill>; })}
          </div>
        </>
      )}
    </div>
  );
}

function Stats({ L, p }: { L: League; p: Player }) {
  const isG = p.pos === 'G';
  const rows: { season: string; team: string; line: (string | number)[]; mine?: boolean }[] = [];
  for (const h of p.h ?? []) {
    const s = Number(h[0]);
    const season = `${String(s).slice(0, 4)}-${String(s).slice(6, 8)}`;
    rows.push({ season, team: String(h[1]), line: isG ? [h[2], h[3], Number(h[6]).toFixed(3).slice(1), h[7]] : [h[2], h[3], h[4], h[5], h[6]] });
  }
  // In-game seasons: NHL, KHL, farm estimates (player careers) and national teams.
  const label = (k: string) => (/rK$/.test(k) ? 'КХЛ' : /rF$/.test(k) ? 'фарм*' : /wc$/.test(k) ? 'ЧМ' : /og$/.test(k) ? 'ОИ' : 'НХЛ');
  for (const [k, v] of Object.entries(p.stats).sort()) {
    if (!/^\d{4}(r|rK|rF|wc|og)$/.test(k) || !v.gp) continue;
    const s = Number(k.slice(0, 4));
    const intl = /wc|og/.test(k);
    const team = intl ? label(k) : `${label(k)} ${k.endsWith('r') ? (p.teams.slice().reverse().find((t) => !L.teams[t]?.lg) ?? '') : ''}`.trim();
    const season = intl ? String(s) : seasonLabel(s);
    if (isG) {
      const g = v as GoalieLine;
      rows.push({ season, team, line: [g.gp, g.w, svPct(g).toFixed(3).slice(1), gaa(g).toFixed(2)], mine: true });
    } else {
      const sk = v as SkaterLine;
      rows.push({ season, team, line: [sk.gp, sk.g, sk.a, sk.pts, sk.pm], mine: true });
    }
  }
  const plg = teamLg(L, p.team) ?? 'NHL';
  const cur = p.stats[statKey(L.season, false, plg)] ?? p.stats[statKey(L.season, false)];
  const po = p.stats[statKey(L.season, true, plg)] ?? p.stats[statKey(L.season, true)];
  const car = isG ? careerGoalie(p) : careerSkater(p);
  const head = isG ? ['И', 'В', '%ОБ', 'КН'] : ['И', 'Г', 'П', 'О', '+/−'];
  return (
    <div>
      {cur && (
        <>
          <SectionTitle>Сезон {seasonLabel(L.season)} · {LG_RU[plg]}</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {isG ? (
              <>
                <MiniStat k="Игры" v={(cur as GoalieLine).gp} />
                <MiniStat k="Победы" v={(cur as GoalieLine).w} />
                <MiniStat k="%ОБ" v={svPct(cur as GoalieLine).toFixed(3).slice(1)} />
                <MiniStat k="КН" v={gaa(cur as GoalieLine).toFixed(2)} />
              </>
            ) : (
              <>
                <MiniStat k="Игры" v={(cur as SkaterLine).gp} />
                <MiniStat k="Голы" v={(cur as SkaterLine).g} />
                <MiniStat k="Очки" v={(cur as SkaterLine).pts} />
                <MiniStat k="+/−" v={(cur as SkaterLine).pm} />
                <MiniStat k="Броски" v={(cur as SkaterLine).sog} />
                <MiniStat k="Бол." v={(cur as SkaterLine).ppp} />
                <MiniStat k="Время" v={toi((cur as SkaterLine).toi, (cur as SkaterLine).gp)} />
                <MiniStat k="Хиты" v={(cur as SkaterLine).hits} />
              </>
            )}
          </div>
        </>
      )}
      {po && <div className="text-[13px] text-muted mt-2 px-1">Плей-офф: {isG ? `${(po as GoalieLine).gp} И, ${(po as GoalieLine).w} В, ${svPct(po as GoalieLine).toFixed(3)}` : `${(po as SkaterLine).gp} И, ${(po as SkaterLine).g}+${(po as SkaterLine).a}=${(po as SkaterLine).pts}`}</div>}
      <SectionTitle>Карьера</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        <table className="w-full text-[13.5px] tnum">
          <thead><tr className="text-muted text-[11.5px]"><th className="text-left font-medium px-3 py-2">Сезон</th><th className="text-left font-medium">Клуб</th>{head.map((h) => <th key={h} className="font-medium text-right pr-3">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={cx('border-t hairline', r.mine && 'bg-white/[0.03]')}>
                <td className="px-3 py-2">{r.season}</td>
                <td className="text-muted">{r.team.slice(0, 7)}</td>
                {r.line.map((x, j) => <td key={j} className="text-right pr-3">{x}</td>)}
              </tr>
            ))}
            <tr className="border-t hairline font-semibold">
              <td className="px-3 py-2" colSpan={2}>Всего в НХЛ</td>
              {isG ? [car.gp, (car as { w: number }).w, '', ''].map((x, j) => <td key={j} className="text-right pr-3">{x}</td>) : [car.gp, (car as { g: number }).g, (car as { a: number }).a, (car as { pts: number }).pts, ''].map((x, j) => <td key={j} className="text-right pr-3">{x}</td>)}
            </tr>
          </tbody>
        </table>
      </Card>
      {p.teams.length > 0 && <div className="flex items-center gap-2 mt-3 px-1 flex-wrap">{p.teams.map((t, i) => <span key={i} className="flex items-center gap-1 text-[12px] text-muted"><TeamLogo id={t} size={18} />{t}</span>)}</div>}
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="glass rounded-2xl px-2.5 py-2"><div className="text-[10.5px] uppercase text-muted">{k}</div><div className="num text-[18px]">{v}</div></div>;
}

function ContractTab({ L, p }: { L: League; p: Player }) {
  const gm = isGM(L);
  const ctxTeam = p.team ?? userTeam(L);
  const mv = ctxTeam ? valueFor(L, p, ctxTeam) : marketValue(L, p);
  const money = (n: number, d = 2) => moneyOf(L, ctxTeam, n, d);
  const ext = extensionOf(p);
  const interest = !gm || (p.team && p.team !== L.user) ? [] : interestIn(L, p);
  return (
    <div>
      <SectionTitle>Текущий контракт</SectionTitle>
      {p.c ? (
        <Card>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase text-muted"><Term k="aav">Кэп-хит</Term></div>
              <div className="num text-[30px] leading-none mt-1">{money(p.c.aav)}</div>
            </div>
            <div className="text-right">
              <div className="text-[13px]">до {seasonLabel(p.c.last)}</div>
              <div className="text-[12px] text-muted">{p.c.last - L.season + 1} сез. · затем <Term k={p.c.exp === 'RFA' ? 'rfa' : 'ufa'}>{p.c.exp}</Term></div>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {p.c.type === 'ELC' && <Pill><Term k="elc">ELC</Term></Pill>}
            {p.c.clause && <Pill color="#ffb547"><Term k={p.c.clause.toLowerCase()}>{p.c.clause}</Term></Pill>}
            {p.c.twoWay && <Pill>двусторонний</Pill>}
            {!p.c.real && p.real && <Pill color="#8b98ae">оценка модели</Pill>}
            {p.c.retainedBy?.map((r) => <Pill key={r.team} color="#7fd3ff">{r.team} удерживает {money(r.amount)}</Pill>)}
          </div>
        </Card>
      ) : (
        <Card><div className="text-muted text-[14px]">Без контракта{p.rightsUntil && p.team ? ` · права у ${p.team} до ${p.rightsUntil + 1}` : ''}.</div></Card>
      )}
      {p.rights && <Card className="mt-2"><div className="text-[13.5px] text-muted">Права в НХЛ: <b className="text-ink">{L.teams[p.rights]?.name}</b> до {(p.rightsUntil ?? L.season) + 1}. Игрок выступает в {LG_RU[lgOf(L.teams[p.team ?? ''])] ?? 'Европе'}; клуб НХЛ сможет подписать его после окончания контракта.</div></Card>}
      {ext && <Card className="mt-2"><div className="text-[13px] text-muted">Продление с {seasonLabel(ext.last - (ext.last - (p.c?.last ?? L.season)) + 1)}: <b className="text-ink">{money(ext.aav)}</b> до {seasonLabel(ext.last)}{ext.clause ? ` · ${ext.clause}` : ''}</div></Card>}
      <SectionTitle>Рыночная оценка</SectionTitle>
      <Card>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[11px] uppercase text-muted">Справедливая цена</div>
            <div className="num text-[24px]">≈ {money(mv)}</div>
          </div>
          {p.c && (
            <Pill color={p.c.aav > mv * 1.15 ? '#ff5a5f' : p.c.aav < mv * 0.85 ? '#3ddc97' : '#8b98ae'}>
              {p.c.aav > mv * 1.15 ? `переплата ${money(p.c.aav - mv)}` : p.c.aav < mv * 0.85 ? `выгодный контракт` : 'по рынку'}
            </Pill>
          )}
        </div>
        <div className="text-[12.5px] text-muted mt-2">Оценка по рейтингу, возрасту, позиции и потолку зарплат {seasonLabel(L.season)}{ctxTeam ? ` в ${LG_RU[teamLg(L, ctxTeam) ?? 'NHL']}` : ''}.{gm ? ` Свободно у вашего клуба: ${moneyOf(L, L.user, capSpace(L, L.user))}.` : ''}</div>
      </Card>
      {gm && p.team === L.user && interest.length > 0 && (
        <>
          <SectionTitle>Интерес других клубов</SectionTitle>
          <Card pad={false}>
            {interest.map((x, i) => (
              <div key={x.t.id} className={cx('flex items-center gap-3 px-4 py-2.5', i && 'border-t hairline')}>
                <TeamLogo id={x.t.id} size={26} />
                <div className="flex-1 text-[14px]">{x.t.short}</div>
                <Meter value={Math.max(0, x.v)} max={Math.max(1, interest[0].v)} className="w-24" />
              </div>
            ))}
          </Card>
        </>
      )}
      <div className="text-[11.5px] text-faint mt-3 px-1">Обновлено: {dateShort(L.date)}. {p.c?.real ? 'Реальный контракт по открытым данным.' : p.real ? 'Сумма контракта — оценка модели (реальные данные по контрактам недоступны).' : ''}</div>
    </div>
  );
}
