import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyTheme, useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { Player } from '../../engine/types';
import { Screen, Icon } from '../components/shell';
import { Button, Card, Chips, cx, Empty, Meter, Pill, SectionTitle, Segmented } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { NationBadge, PlayerPhoto, TeamLogo } from '../components/media';
import { MiniCard } from '../components/PlayerCard';
import { achievementsFor } from '../../engine/achievements';
import { isGM, lgOf, userTeam } from '../../engine/leagues';
import { NATIONS } from '../../engine/intl';
import { khlPlayoffResult } from '../../engine/khl';
import { AWARD_NAMES } from '../../engine/awards';
import { ATTR_RU, dateLong, money, POS_RU, seasonLabel, STATUS_RU, TIERS, tierOf, type Tier } from '../format';
import { GLOSSARY } from '../glossary';
import { exportFile } from '../../persistence/db';
import { careerSkater, statKey } from '../../engine/stats';
import type { SkaterLine } from '../../engine/types';
import { CupMark } from './Menu';
import { chime, horn } from '../sound';
import { declineCall, takeJob } from '../../engine/careers';
import { ageOn } from '../../engine/util';

export function CareerScreen() {
  const L = useL();
  const o = L.owner;
  const { act, toast } = useGame.getState();
  return (
    <Screen title="Карьера" subtitle={`${L.gm.name} · GM ${L.teams[L.user].name}`}>
      {L.gm.fired && (
        <Card className="border-bad/40 mb-3">
          <div className="font-display uppercase text-[20px] text-bad">Вы уволены</div>
          <div className="text-[13.5px] text-muted mt-1">{L.gm.offers?.length ? 'Но вас зовут другие клубы:' : 'Предложений о работе пока нет. Можно начать новую карьеру.'}</div>
          <div className="flex flex-col gap-2 mt-3">
            {L.gm.offers?.map((t) => (
              <Button key={t} variant="primary" full onClick={() => {
                act((L) => takeJob(L, t));
                toast(`Вы — новый GM ${L.teams[t].name}`, 'good');
                applyTheme(useGame.getState().L);
                useNav.getState().reset();
              }}>Возглавить {L.teams[t].name}</Button>
            ))}
          </div>
        </Card>
      )}
      {!L.gm.fired && (L.gm.calls ?? []).filter((c) => c.until >= L.date).map((c) => (
        <Card key={c.team} className="mb-3 border-[var(--accent)]">
          <div className="flex items-center gap-3">
            <TeamLogo id={c.team} size={44} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase text-muted">Предложение о работе · до {dateLong(c.until)}</div>
              <div className="font-display uppercase text-[18px] truncate">{L.teams[c.team]?.name}</div>
            </div>
          </div>
          <div className="text-[13px] text-muted mt-2">{c.note}</div>
          <div className="flex gap-2 mt-3">
            <Button full variant="primary" onClick={() => {
              if (!confirm(`Перейти в ${L.teams[c.team]?.name}? Текущий клуб останется под управлением ИИ.`)) return;
              act((L) => takeJob(L, c.team));
              toast(`Вы — новый GM ${L.teams[c.team].name}`, 'good');
              applyTheme(useGame.getState().L);
              useNav.getState().reset();
            }}>Принять</Button>
            <Button full onClick={() => act((L) => declineCall(L, c.team))}>Остаться</Button>
          </div>
        </Card>
      ))}
      <Card>
        <div className="text-[11px] uppercase text-muted">Владелец · {o.name}</div>
        <div className="flex items-end gap-2 mt-1"><div className="num text-[40px] leading-none">{o.trust}</div><div className="text-muted mb-1">/ 100 доверия</div></div>
        <Meter value={o.trust} className="mt-2" color={o.trust < 30 ? '#ff5a5f' : o.trust < 55 ? '#ffb547' : '#3ddc97'} height={8} />
        <div className="text-[14px] mt-3">Цель сезона: <b>{o.goalText}</b></div>
        <div className="text-[12.5px] text-muted mt-1">Сложность: {{ rookie: 'новичок', real: 'реализм', hard: 'хардкор' }[L.settings.difficulty]} · {L.settings.noFiring ? 'без увольнения' : `предупреждений: ${o.warnings}`}</div>
      </Card>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Сезонов</div><div className="num text-[22px]">{L.gm.seasons}</div></div>
        <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Кубков</div><div className="num text-[22px] text-gold">{L.gm.cups}</div></div>
        <div className="glass rounded-2xl px-3 py-2"><div className="text-[10.5px] uppercase text-muted">Репутация</div><div className="num text-[22px]">{L.gm.rep}</div></div>
      </div>
      <div className="text-[12.5px] text-muted mt-2 px-1">Репутация влияет на свободных агентов: к успешному GM звёзды идут охотнее.</div>
      <SectionTitle>Сезоны</SectionTitle>
      {L.gm.history.length ? (
        <Card pad={false}>
          {L.gm.history.slice().reverse().map((h, i) => (
            <div key={i} className={cx('flex items-center gap-3 px-4 h-12', i && 'border-t hairline')}>
              <span className="num w-16">{seasonLabel(h.season)}</span>
              <TeamLogo id={h.team} size={24} />
              <span className={cx('flex-1 text-[14px]', h.result.includes('КУБОК') && 'text-gold font-semibold')}>{h.result}</span>
            </div>
          ))}
        </Card>
      ) : <div className="text-muted text-[13.5px] px-1">Первый сезон в разгаре.</div>}
      {L.history.length > 0 && <Button full className="mt-3" onClick={() => useNav.getState().openModal('wrapped')}>Итоги прошлого сезона</Button>}
    </Screen>
  );
}

export function HistoryScreen() {
  const L = useL();
  const [lg, setLg] = useState<'NHL' | 'KHL' | 'intl'>(L.teams[userTeam(L) ?? '']?.lg === 'KHL' ? 'KHL' : 'NHL');
  return (
    <Screen title="История" subtitle="Чемпионы и награды">
      <Segmented value={lg} onChange={setLg} options={[{ v: 'NHL', label: 'НХЛ' }, ...(L.khl ? [{ v: 'KHL' as const, label: 'КХЛ' }] : []), { v: 'intl', label: 'Сборные' }]} />
      {lg === 'NHL' && <NhlHistory />}
      {lg === 'KHL' && <KhlHistory />}
      {lg === 'intl' && <IntlHistory />}
    </Screen>
  );
}

function KhlHistory() {
  const L = useL();
  const nav = useNav();
  const H = L.khl?.history ?? [];
  return (
    <div className="mt-3">
      {!H.length && <Empty icon="📜" title="История пишется" text="Обладатели Кубка Гагарина появятся здесь. Действующий чемпион — «Локомотив» (2026)." />}
      <div className="flex flex-col gap-2">
        {H.map((h) => (
          <Card key={h.season}>
            <div className="flex items-center gap-3">
              <TeamLogo id={h.champion} size={46} />
              <div className="flex-1">
                <div className="text-[12px] text-muted">{seasonLabel(h.season)}</div>
                <div className="font-display uppercase text-[18px]">🏆 {L.teams[h.champion]?.name}</div>
                <div className="text-[12.5px] text-muted">финал с {L.teams[h.finalist]?.short} · регулярка: {L.teams[h.regular]?.short}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {h.mvp && L.players[h.mvp] && <button className="press" onClick={() => nav.push('player', { id: h.mvp })}><Pill>MVP плей-офф: {L.players[h.mvp].ln}</Pill></button>}
              {h.topScorer && <button className="press" onClick={() => nav.push('player', { id: h.topScorer!.id })}><Pill>Бомбардир: {h.topScorer.name} ({h.topScorer.pts})</Pill></button>}
            </div>
          </Card>
        ))}
      </div>
      <SectionTitle>Кубки Гагарина</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {Object.values(L.teams).filter((t) => t.lg === 'KHL' && t.cups > 0).sort((a, b) => b.cups - a.cups).map((t) => (
          <div key={t.id} className={cx('glass rounded-2xl p-2 flex flex-col items-center', t.id === userTeam(L) && 'border-[var(--accent)]')}>
            <TeamLogo id={t.id} size={30} />
            <div className="num text-gold text-[16px] mt-1">{t.cups}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntlHistory() {
  const L = useL();
  const H = L.intl?.history ?? [];
  if (!H.length) return <div className="mt-3"><Empty icon="🌍" title="Турниров ещё не было" text="Первый — чемпионат мира 2027 в Германии (14–30 мая)." /></div>;
  return (
    <div className="flex flex-col gap-2 mt-3">
      {H.map((h) => (
        <Card key={h.id} className="!py-3">
          <div className="font-semibold text-[15px]">{h.name}</div>
          <div className="flex gap-2 mt-2">
            {h.medals.map((c, i) => <div key={c} className="flex items-center gap-1.5 text-[13px]"><span>{['🥇', '🥈', '🥉'][i]}</span><NationBadge code={c} size={22} /><span>{NATIONS[c]?.name}</span></div>)}
          </div>
        </Card>
      ))}
    </div>
  );
}

function NhlHistory() {
  const L = useL();
  const nav = useNav();
  return (
    <div className="mt-3">
      {!L.history.length && <Empty icon="📜" title="История пишется" text="Здесь появятся чемпионы и награды каждого сыгранного сезона." />}
      <div className="flex flex-col gap-2">
        {L.history.map((h) => (
          <Card key={h.season}>
            <div className="flex items-center gap-3">
              <TeamLogo id={h.champion} size={46} />
              <div className="flex-1">
                <div className="text-[12px] text-muted">{seasonLabel(h.season)}</div>
                <div className="font-display uppercase text-[18px]">🏆 {L.teams[h.champion]?.name}</div>
                <div className="text-[12.5px] text-muted">финал с {L.teams[h.finalist]?.short} · Президентский кубок: {L.teams[h.presidents]?.short}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(h.awards).map(([k, id]) => {
                const p = L.players[id];
                return p ? <button key={k} onClick={() => nav.push('player', { id })} className="press"><Pill color={p.team === L.user ? 'var(--accent)' : undefined}>{AWARD_NAMES[k]?.split(' — ')[0].replace(' Трофи', '')}: {p.ln}</Pill></button> : null;
              })}
            </div>
            {isGM(L) && !L.teams[L.user]?.lg && h.userRecord.place > 0 && <div className="text-[12.5px] text-muted mt-2">Ваш клуб: {h.userRecord.w}–{h.userRecord.l}–{h.userRecord.otl}, {h.userRecord.pts} оч., {h.userRecord.place}-е место</div>}
          </Card>
        ))}
      </div>
      <SectionTitle>Комната трофеев</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {Object.values(L.teams).filter((t) => !t.lg).sort((a, b) => b.cups - a.cups).slice(0, 12).map((t) => (
          <div key={t.id} className={cx('glass rounded-2xl p-2 flex flex-col items-center', t.id === L.user && 'border-[var(--accent)]')}>
            <TeamLogo id={t.id} size={30} />
            <div className="num text-gold text-[16px] mt-1">{t.cups}</div>
          </div>
        ))}
      </div>
      {isGM(L) && L.teams[L.user].retired.length > 0 && (
        <>
          <SectionTitle>Выведенные номера</SectionTitle>
          <div className="flex gap-2 flex-wrap">{L.teams[L.user].retired.map(([n, name, s]) => <Card key={n} className="!p-3 text-center"><div className="num text-[30px]">#{n}</div><div className="text-[12px] text-muted">{name} · {s}</div></Card>)}</div>
        </>
      )}
    </div>
  );
}

export function AchievementsScreen() {
  const L = useL();
  return (
    <Screen title="Достижения" subtitle={`${achievementsFor(L).filter((a) => L.achievements[a.id]).length} из ${achievementsFor(L).length}`}>
      <div className="grid grid-cols-2 gap-2">
        {achievementsFor(L).map((a, i) => {
          const got = L.achievements[a.id];
          return (
            <motion.div key={a.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} className={cx('glass rounded-3xl p-3.5', !got && 'opacity-45 grayscale')}>
              <div className="text-[30px]">{a.icon}</div>
              <div className="font-semibold text-[14.5px] mt-1.5">{a.title}</div>
              <div className="text-[12px] text-muted mt-0.5">{a.desc}</div>
              {got && <div className="text-[11px] text-gold mt-1.5">{dateLong(got)}</div>}
            </motion.div>
          );
        })}
      </div>
    </Screen>
  );
}

export function AlbumScreen() {
  const L = useL();
  const nav = useNav();
  const [sort, setSort] = useState<'ovr' | 'recent'>('ovr');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const all = L.album.map((id) => L.players[id]).filter(Boolean);
  const list = tier === 'all' ? all : all.filter((p) => tierOf(p.ovr) === tier);
  const sorted = sort === 'ovr' ? [...list].sort((a, b) => Math.max(...b.hist.map((h) => h[1]), b.ovr) - Math.max(...a.hist.map((h) => h[1]), a.ovr)) : [...list].reverse();
  const count = (t: Tier) => all.filter((p) => tierOf(p.ovr) === t).length;
  return (
    <Screen title="Альбом" subtitle="Все, кто играл за ваш клуб">
      <Chips value={sort} onChange={setSort} options={[{ v: 'ovr', label: 'Лучшие' }, { v: 'recent', label: 'Новые' }]} />
      <div className="mt-2">
        <Chips value={tier} onChange={setTier} options={[{ v: 'all' as const, label: `Все · ${all.length}` }, ...TIERS.filter((t) => count(t.id)).map((t) => ({ v: t.id, label: `${t.ru} · ${count(t.id)}` }))]} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {sorted.map((p) => <MiniCard key={p.id} p={p} L={L} onClick={() => nav.push('player', { id: p.id })} />)}
      </div>
    </Screen>
  );
}

export function CompareScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [a, setA] = useState<number | null>((params.a as number) ?? null);
  const [b, setB] = useState<number | null>((params.b as number) ?? null);
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const pa = a ? L.players[a] : null, pb = b ? L.players[b] : null;
  const keys = (pa ?? pb)?.pos === 'G' ? ['po', 'rf', 'rb', 'cs', 'mn', 'pk'] : ['sk', 'sh', 'pa', 'ha', 'oi', 'di', 'ph'];
  if (picking) return <PlayerPicker title="Выберите игрока" onPick={(id) => { if (picking === 'a') setA(id); else setB(id); setPicking(null); }} onBack={() => setPicking(null)} />;
  return (
    <Screen title="Сравнение">
      <div className="grid grid-cols-2 gap-2">
        {[pa, pb].map((p, i) => (
          <Card key={i} onClick={() => setPicking(i ? 'b' : 'a')} className="flex flex-col items-center text-center">
            {p ? (<><PlayerPhoto p={p} L={L} size={64} /><div className="font-semibold mt-2 text-[14.5px]">{p.fn[0]}. {p.ln}</div><div className="text-[12px] text-muted">{POS_RU[p.pos]} · {ageOn(p.bd, L.date)} л · {p.team ?? STATUS_RU[p.st]}</div><div className="num text-[30px] mt-1">{p.ovr}</div></>) : (<div className="h-32 flex flex-col items-center justify-center text-muted"><Icon name="plus" size={28} /><div className="text-[13px] mt-1">Выбрать</div></div>)}
          </Card>
        ))}
      </div>
      {pa && pb && (
        <>
          <SectionTitle>Навыки</SectionTitle>
          <Card>
            <Radar a={keys.map((k) => (pa.r as unknown as Record<string, number>)[k])} b={keys.map((k) => (pb.r as unknown as Record<string, number>)[k])} labels={keys.map((k) => ATTR_RU[k])} />
            <div className="flex justify-center gap-4 text-[12.5px] mt-2"><span className="accent-text">● {pa.ln}</span><span className="text-gold">● {pb.ln}</span></div>
          </Card>
          <SectionTitle>Контракт и карьера</SectionTitle>
          <Card pad={false}>
            {[
              ['Зарплата', pa.c ? money(pa.c.aav) : '—', pb.c ? money(pb.c.aav) : '—'],
              ['До конца', pa.c ? `${pa.c.last - L.season + 1} сез.` : '—', pb.c ? `${pb.c.last - L.season + 1} сез.` : '—'],
              ['Потенциал', String(pa.pot >= pa.ovr ? '~' + pa.pot : pa.ovr), String(pb.pot >= pb.ovr ? '~' + pb.pot : pb.ovr)],
              ['Матчи в НХЛ', String(careerSkater(pa).gp), String(careerSkater(pb).gp)],
              ['Очки в НХЛ', pa.pos === 'G' ? '—' : String(careerSkater(pa).pts), pb.pos === 'G' ? '—' : String(careerSkater(pb).pts)],
            ].map(([k, x, y], i) => (
              <div key={k} className={cx('flex items-center px-4 h-11 text-[14px]', i && 'border-t hairline')}><span className="flex-1 num">{x}</span><span className="text-muted text-[12px]">{k}</span><span className="flex-1 text-right num">{y}</span></div>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Radar({ a, b, labels }: { a: number[]; b: number[]; labels: string[] }) {
  const n = labels.length, R = 100, cx0 = 130, cy0 = 120;
  const pt = (v: number, i: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (Math.max(30, v) - 30) / 69 * R;
    return [cx0 + Math.cos(ang) * r, cy0 + Math.sin(ang) * r];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(v, i).join(',')).join(' ');
  return (
    <svg viewBox="0 0 260 245" className="w-full">
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={labels.map((_, i) => pt(30 + 69 * k, i).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,0.08)" />)}
      <motion.polygon points={poly(a)} fill="color-mix(in oklab, var(--accent) 35%, transparent)" stroke="var(--accent)" strokeWidth="2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.polygon points={poly(b)} fill="rgba(232,194,106,0.25)" stroke="#e8c26a" strokeWidth="2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} />
      {labels.map((l, i) => { const [x, y] = pt(108, i); return <text key={l} x={x} y={y} fontSize="10" fill="#8b98ae" textAnchor="middle">{l}</text>; })}
    </svg>
  );
}

export function PlayerPicker({ title, onPick, onBack }: { title: string; onPick: (id: number) => void; onBack: () => void }) {
  const L = useL();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (ql.length < 2) return Object.values(L.players).filter((p) => p.st === 'NHL').sort((a, b) => b.ovr - a.ovr).slice(0, 40);
    return Object.values(L.players).filter((p) => p.st !== 'RET' && `${p.fn} ${p.ln}`.toLowerCase().includes(ql)).sort((a, b) => b.ovr - a.ovr).slice(0, 60);
  }, [L, q]);
  return (
    <Screen title={title} onBack={onBack} back>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или фамилия (латиницей)" className="glass rounded-2xl w-full h-12 px-4 outline-none text-ink placeholder:text-faint" />
      <div className="glass rounded-3xl py-1 mt-3">{list.map((p) => <PlayerRow key={p.id} p={p} L={L} showTeam onClick={() => onPick(p.id)} />)}</div>
    </Screen>
  );
}

type SearchPos = 'all' | 'F' | 'D' | 'G';
export function SearchScreen() {
  const L = useL();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<SearchPos>('all');
  const [where, setWhere] = useState<'all' | 'NHL' | 'young' | 'world'>('all');
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return Object.values(L.players)
      .filter((p) => p.st !== 'RET')
      .filter((p) => (pos === 'all' ? true : pos === 'G' ? p.pos === 'G' : pos === 'D' ? p.pos === 'D' : p.pos !== 'D' && p.pos !== 'G'))
      .filter((p) => (where === 'all' ? true : where === 'NHL' ? p.st === 'NHL' : where === 'young' ? ageOn(p.bd, L.date) <= 21 : !p.team))
      .filter((p) => !ql || `${p.fn} ${p.ln}`.toLowerCase().includes(ql))
      .sort((a, b) => (where === 'young' ? b.pot - a.pot : b.ovr - a.ovr))
      .slice(0, 80);
  }, [L, q, pos, where]);
  return (
    <Screen title="Поиск игроков" subtitle={`${Object.values(L.players).filter((p) => p.st !== 'RET').length} игроков в мире`}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя (латиницей)" className="glass rounded-2xl w-full h-12 px-4 outline-none text-ink placeholder:text-faint" />
      <div className="mt-2"><Chips value={where} onChange={setWhere} options={[{ v: 'all', label: 'Все' }, { v: 'NHL', label: 'НХЛ' }, { v: 'young', label: 'Молодёжь ≤21' }, { v: 'world', label: 'Вне клубов' }]} /></div>
      <div className="mt-2"><Chips value={pos} onChange={setPos} options={[{ v: 'all', label: 'Все позиции' }, { v: 'F', label: 'Нападающие' }, { v: 'D', label: 'Защитники' }, { v: 'G', label: 'Вратари' }]} /></div>
      <div className="glass rounded-3xl py-1 mt-3">{list.map((p) => <PlayerRow key={p.id} p={p} L={L} showTeam showPot={where === 'young'} />)}</div>
    </Screen>
  );
}

export function WatchScreen() {
  const L = useL();
  const list = L.watch.map((id) => L.players[id]).filter(Boolean) as Player[];
  return (
    <Screen title="Избранное" subtitle="Игроки, за которыми вы следите">
      {list.length ? <div className="glass rounded-3xl py-1">{list.map((p) => <PlayerRow key={p.id} p={p} L={L} showTeam />)}</div> : <Empty icon="⭐" title="Пусто" text="Нажмите звёздочку в профиле игрока, чтобы следить за ним." />}
    </Screen>
  );
}

export function GlossaryScreen() {
  return (
    <Screen title="Словарь" subtitle="Хоккейный менеджмент простыми словами">
      <div className="flex flex-col gap-2">
        {Object.values(GLOSSARY).map((g) => (
          <Card key={g.t}><div className="font-semibold text-[15px]">{g.t}</div><div className="text-[13.5px] text-muted mt-1 leading-relaxed">{g.d}</div></Card>
        ))}
      </div>
    </Screen>
  );
}

export function SettingsScreen() {
  const L = useL();
  const { act, quit, toast, save } = useGame.getState();
  const nav = useNav();
  const Toggle = ({ k, label, sub }: { k: 'sound' | 'assistant' | 'stopOnUserGames' | 'watchGames' | 'hideMedia' | 'noFiring' | 'intlRussia'; label: string; sub: string }) => (
    <button onClick={() => act((L) => (L.settings[k] = !L.settings[k]))} className="press w-full flex items-center gap-3 px-4 py-3 text-left">
      <div className="flex-1"><div className="text-[15px] font-medium">{label}</div><div className="text-[12.5px] text-muted">{sub}</div></div>
      <div className={cx('w-12 h-7 rounded-full p-0.5 transition-colors shrink-0', L.settings[k] ? 'accent-bg' : 'bg-white/15')}>
        <motion.div className="w-6 h-6 rounded-full bg-white" animate={{ x: L.settings[k] ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
      </div>
    </button>
  );
  return (
    <Screen title="Настройки">
      <Card pad={false} className="overflow-hidden">
        <Toggle k="sound" label="Звук" sub="Сирена гола и сигналы" />
        <div className="h-px bg-white/[0.06]" />
        <Toggle k="assistant" label="Ассистент GM" sub="Советы на главном экране" />
        <div className="h-px bg-white/[0.06]" />
        <Toggle k="stopOnUserGames" label="Останавливаться на матчах" sub="«Продолжить» будет ждать каждого вашего матча" />
        <div className="h-px bg-white/[0.06]" />
        <Toggle k="watchGames" label="Смотреть матчи" sub="Открывать «живой» матч-центр после «Следующий матч»" />
        <div className="h-px bg-white/[0.06]" />
        <Toggle k="hideMedia" label="Без пресс-конференций" sub="Не приглашать на пресс-конференции" />
      </Card>
      <SectionTitle>Карьера и сборные</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        {isGM(L) && (
          <>
            <Toggle k="noFiring" label="Без увольнения" sub="Владелец может быть недоволен, но не уволит вас" />
            <div className="h-px bg-white/[0.06]" />
          </>
        )}
        <Toggle k="intlRussia" label="Россия и Беларусь на турнирах IIHF" sub="В реальности сборные отстранены с 2022 года. Включите, чтобы они играли ЧМ и Олимпиады (со следующего турнира)" />
        {isGM(L) && (
          <>
            <div className="h-px bg-white/[0.06]" />
            <button onClick={() => nav.push('intl')} className="press w-full flex items-center gap-3 px-4 py-3 text-left">
              <div className="flex-1"><div className="text-[15px] font-medium">Сборная</div><div className="text-[12.5px] text-muted">{L.intl?.coach ? `Вы тренер: ${NATIONS[L.intl.coach]?.name}` : 'Можно возглавить сборную и выбирать составы'}</div></div>
              <Icon name="back" size={18} className="rotate-180 text-muted" />
            </button>
          </>
        )}
      </Card>
      <SectionTitle>Сложность</SectionTitle>
      <Segmented value={L.settings.difficulty} onChange={(v) => { if (L.settings.ironman) return toast('В режиме «Железный человек» сложность менять нельзя', 'bad'); act((L) => (L.settings.difficulty = v)); }} options={[{ v: 'rookie', label: 'Новичок' }, { v: 'real', label: 'Реализм' }, { v: 'hard', label: 'Хардкор' }]} />
      <div className="text-[12.5px] text-muted mt-2 px-1">{isGM(L) ? 'Сложность меняет только поведение ИИ-менеджеров и терпение владельца. Шансы в матчах всегда одинаковые.' : 'В карьере игрока сложность задаёт стартовый уровень и потолок развития (меняется только при создании). Шансы в матчах всегда одинаковые.'}</div>
      <SectionTitle>Сохранение</SectionTitle>
      <div className="flex flex-col gap-2">
        <Button full onClick={async () => { await save(); toast('Сохранено', 'good'); }}>Сохранить сейчас</Button>
        <Button full onClick={() => exportFile(L)} icon={<Icon name="share" size={17} />}>Экспорт файла сохранения</Button>
        <Button full variant="danger" onClick={() => quit()}>Выйти в главное меню</Button>
      </div>
      <div className="text-[12px] text-muted mt-3 px-1">Игра сохраняется автоматически. Safari может очистить данные сайта, который долго не открывали, — установите игру на экран «Домой» и иногда делайте экспорт.</div>
      <div className="text-[11.5px] text-faint mt-6 px-1">NHL GM · фан-проект, не связан с NHL и NHLPA. Данные НХЛ на {dateLong(L.meta.snapshot)}. Зарплаты большинства игроков — оценка модели; контракты ключевых игроков — по открытым данным.</div>
    </Screen>
  );
}

// ---------- Celebration & Wrapped ----------

export function CelebrationModal({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const close = useNav((s) => s.closeModal);
  const khl = params.lg === 'KHL';
  const t = L.teams[userTeam(L) ?? L.user];
  useEffect(() => { if (L.settings.sound) { horn(); setTimeout(chime, 1200); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const confetti = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ x: Math.random() * 100, d: 2.5 + Math.random() * 3, delay: Math.random() * 2, c: [t.accent, '#e8c26a', '#ffffff', t.secondary][i % 4], r: Math.random() * 360 })), [t]);
  const po = khl ? L.khl?.playoffs : L.playoffs;
  const mvpId = khl ? L.khl?.history[0]?.mvp : po?.conn;
  const conn = mvpId ? L.players[mvpId] : null;
  return (
    <div className="absolute inset-0 overflow-hidden flex flex-col items-center justify-center text-center px-6" style={{ background: `radial-gradient(120% 70% at 50% 30%, ${t.primary}, #05070d 70%)` }}>
      {confetti.map((c, i) => (
        <motion.div key={i} className="absolute top-0 w-2 h-3.5 rounded-sm" style={{ left: `${c.x}%`, background: c.c }} initial={{ y: -40, rotate: c.r }} animate={{ y: '110vh', rotate: c.r + 720 }} transition={{ duration: c.d, delay: c.delay, repeat: Infinity, ease: 'linear' }} />
      ))}
      <motion.div initial={{ y: 80, scale: 0.6, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 12, delay: 0.2 }}>
        <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}><CupMark size={170} /></motion.div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        <div className="text-[13px] uppercase tracking-[0.3em] text-gold mt-6">{khl ? 'Кубок Гагарина' : 'Кубок Стэнли'} {L.season + 1}</div>
        <div className="font-display uppercase text-[40px] leading-none mt-2 text-gradient-gold">Чемпионы!</div>
        <div className="flex items-center justify-center gap-3 mt-4"><TeamLogo id={t.id} size={48} /><div className="font-display uppercase text-[22px]">{t.name}</div></div>
        {conn && <div className="text-[14px] text-white/75 mt-4">{khl ? 'MVP плей-офф' : 'Конн Смайт Трофи'}: {conn.fn} {conn.ln}</div>}
        <div className="text-[13px] text-white/60 mt-1">{isGM(L) ? `${L.gm.name} — ${L.gm.cups}-й кубок в карьере` : `${L.gm.name} — чемпион!`}</div>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="absolute bottom-0 inset-x-0 px-6 pb-safe">
        <Button variant="gold" size="lg" full className="mb-4" onClick={() => { close(); if (isGM(L) && !khl) useNav.getState().openModal('wrapped'); }}>{isGM(L) && !khl ? 'Итоги сезона' : 'Продолжить'}</Button>
      </motion.div>
    </div>
  );
}

export function WrappedModal() {
  const L = useL();
  const close = useNav((s) => s.closeModal);
  const h = L.history[0];
  const [i, setI] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = L.teams[L.user];
  const season = h?.season ?? L.season;
  const key = statKey(season, false);
  const mine = Object.values(L.players).filter((p) => p.teams.includes(L.user) && p.stats[key] && p.pos !== 'G');
  const top = mine.sort((a, b) => (b.stats[key] as SkaterLine).pts - (a.stats[key] as SkaterLine).pts)[0];
  const rookie = mine.filter((p) => ageOn(p.bd, L.date) <= 22).sort((a, b) => (b.stats[key] as SkaterLine).pts - (a.stats[key] as SkaterLine).pts)[0];
  const trades = L.trades.filter((x) => x.user && x.season === season);
  const best = trades.sort((a, b) => (b.a === L.user ? b.grades?.a : b.grades?.b)?.localeCompare((a.a === L.user ? a.grades?.a : a.grades?.b) ?? '') ?? 0)[0];
  const slides = [
    { bg: t.primary, title: `Сезон ${seasonLabel(season)}`, big: h ? `${h.userRecord.w}–${h.userRecord.l}–${h.userRecord.otl}` : '—', sub: h ? `${h.userRecord.pts} очков · ${h.userRecord.place}-е место в лиге` : '' },
    { bg: '#1b2a44', title: 'Итог', big: lgOf(t) === 'KHL' ? ['Мимо плей-офф', '1-й раунд', '2-й раунд', 'Полуфинал', 'Финал', 'КУБОК ГАГАРИНА'][khlPlayoffResult(L, L.user)] : ['Мимо плей-офф', '1-й раунд', '2-й раунд', 'Финал конференции', 'Финал Кубка', 'КУБОК СТЭНЛИ'][h?.userRecord.playoffRound ?? 0], sub: h ? `Чемпион НХЛ: ${L.teams[h.champion]?.name}` : '' },
    ...(top ? [{ bg: '#2b1a3a', title: 'Лучший бомбардир', big: `${top.fn} ${top.ln}`, sub: `${(top.stats[key] as SkaterLine).g} + ${(top.stats[key] as SkaterLine).a} = ${(top.stats[key] as SkaterLine).pts} очков`, p: top }] : []),
    ...(rookie && rookie !== top ? [{ bg: '#123a2e', title: 'Открытие сезона', big: `${rookie.fn} ${rookie.ln}`, sub: `${(rookie.stats[key] as SkaterLine).pts} очков в ${ageOn(rookie.bd, L.date)} лет`, p: rookie }] : []),
    { bg: '#3a2a12', title: 'Работа GM', big: `${trades.length} обм. · ${L.seasonLog.signings} контр.`, sub: best ? `Лучшая сделка: ${(best.a === L.user ? best.aGets : best.bGets).names.join(', ')} (${best.a === L.user ? best.grades?.a : best.grades?.b})` : `Вложено в контракты: ${money(L.seasonLog.spent)}` },
    { bg: '#0f2a44', title: 'Владелец', big: `${L.owner.trust}/100`, sub: L.owner.trust >= 60 ? 'Доверие крепкое' : L.owner.trust >= 30 ? 'Терпение не безгранично' : 'Вы на грани увольнения' },
  ];
  useEffect(() => {
    timer.current = setTimeout(() => setI((x) => Math.min(slides.length - 1, x + 1)), 4200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [i, slides.length]);
  const s = slides[i];
  return (
    <div className="absolute inset-0 flex flex-col pt-safe pb-safe" style={{ background: `radial-gradient(120% 80% at 30% 0%, ${s.bg}, #05070d 75%)`, transition: 'background 0.6s' }}>
      <div className="flex gap-1 px-3 pt-2">{slides.map((_, k) => <div key={k} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"><motion.div className="h-full bg-white" initial={{ width: 0 }} animate={{ width: k < i ? '100%' : k === i ? '100%' : 0 }} transition={{ duration: k === i ? 4.2 : 0, ease: 'linear' }} /></div>)}</div>
      <div className="flex justify-end px-2"><button onClick={close} className="press w-11 h-11 flex items-center justify-center"><Icon name="close" /></button></div>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8" onClick={() => setI(Math.min(slides.length - 1, i + 1))}>
        <motion.div key={i} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }} className="flex flex-col items-center">
          <TeamLogo id={L.user} size={56} />
          <div className="text-[13px] uppercase tracking-[0.25em] text-white/70 mt-5">{s.title}</div>
          {'p' in s && s.p && <PlayerPhoto p={s.p as Player} L={L} size={110} className="mt-5" />}
          <div className="font-display uppercase text-[42px] leading-[1.02] mt-4">{s.big}</div>
          <div className="text-[16px] text-white/75 mt-3">{s.sub}</div>
        </motion.div>
      </div>
      <div className="px-6 pb-4 flex gap-2">
        {i > 0 && <Button full onClick={() => setI(i - 1)}>Назад</Button>}
        {i < slides.length - 1 ? <Button full variant="primary" onClick={() => setI(i + 1)}>Дальше</Button> : <Button full variant="primary" onClick={() => shareWrapped(L.teams[L.user].name, slides.map((x) => `${x.title}: ${x.big}`).join('\n'))}>Поделиться</Button>}
      </div>
    </div>
  );
}

function shareWrapped(team: string, text: string) {
  const body = `NHL GM · ${team}\n${text}`;
  if (navigator.share) navigator.share({ title: 'Мой сезон в NHL GM', text: body }).catch(() => undefined);
  else navigator.clipboard?.writeText(body);
}
