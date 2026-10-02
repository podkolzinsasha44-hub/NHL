import { useState } from 'react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, PlayoffSeries } from '../../engine/types';
import { Screen } from '../components/shell';
import { Card, Chips, cx, Empty, Pill, Segmented, SectionTitle } from '../components/kit';
import { TeamLogo, PlayerPhoto } from '../components/media';
import { CONF_NAMES, DIV_NAMES, playoffPicture, sortedTeams } from '../../engine/standings';
import { goalieLeaders, leaders, statKey } from '../../engine/stats';
import { dateShort, dow, seasonLabel } from '../format';
import { AWARD_NAMES } from '../../engine/awards';
import { Term } from '../components/Term';
import { SimDock } from './SimOverlay';

type LTab = 'table' | 'games' | 'stats' | 'po';

export function LeagueScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useState<LTab>((params.tab as LTab) ?? (L.phase === 'playoffs' ? 'po' : 'table'));
  return (
    <Screen
      title="Лига"
      subtitle={`НХЛ ${seasonLabel(L.season)}`}
      headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'table', label: 'Таблица' }, { v: 'games', label: 'Матчи' }, { v: 'stats', label: 'Лидеры' }, { v: 'po', label: 'Плей-офф' }]} /></div>}
    >
      {tab === 'table' && <Standings L={L} />}
      {tab === 'games' && <Games L={L} />}
      {tab === 'stats' && <Leaders L={L} />}
      {tab === 'po' && <PlayoffsView L={L} />}
      <SimDock />
    </Screen>
  );
}

export function PlayoffsScreen() {
  const L = useL();
  return <Screen title="Плей-офф" subtitle={`Кубок Стэнли ${L.season + 1}`}><PlayoffsView L={L} /><SimDock /></Screen>;
}

function Standings({ L }: { L: League }) {
  const [mode, setMode] = useState<'div' | 'wc' | 'league'>('div');
  const nav = useNav();
  const Row = ({ id, rank, cut }: { id: string; rank: number; cut?: boolean }) => {
    const t = L.teams[id];
    const r = t.rec;
    return (
      <div onClick={() => nav.push('team', { id })} className={cx('press flex items-center gap-2 px-3 h-[46px] text-[14px] tnum', id === L.user && 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]', cut && 'border-b-2 border-dashed border-white/20')}>
        <span className="w-5 text-muted text-right">{rank}</span>
        <TeamLogo id={id} size={24} />
        <span className={cx('flex-1 truncate font-medium', id === L.user && 'accent-text')}>{t.short}</span>
        <span className="w-7 text-right text-muted">{r.gp}</span>
        <span className="w-16 text-right text-muted">{r.w}-{r.l}-{r.otl}</span>
        <span className="w-9 text-right text-muted">{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</span>
        <span className="w-8 text-right num text-[16px]">{r.pts}</span>
      </div>
    );
  };
  const Head = () => (
    <div className="flex items-center gap-2 px-3 h-8 text-[11px] text-muted uppercase">
      <span className="w-5" /><span className="w-6" /><span className="flex-1">Клуб</span><span className="w-7 text-right">И</span><span className="w-16 text-right">В-П-ОТ</span><span className="w-9 text-right">РШ</span><span className="w-8 text-right">О</span>
    </div>
  );
  const pic = playoffPicture(L);
  return (
    <div>
      <Chips value={mode} onChange={setMode} options={[{ v: 'div', label: 'Дивизионы' }, { v: 'wc', label: <Term k="wc">Уайлд-кард</Term> }, { v: 'league', label: 'Лига' }]} />
      {mode === 'div' && (['A', 'M', 'C', 'P'] as const).map((d) => (
        <div key={d}>
          <SectionTitle>{DIV_NAMES[d]}</SectionTitle>
          <Card pad={false} className="overflow-hidden"><Head />{sortedTeams(L, (t) => t.div === d).map((t, i) => <Row key={t.id} id={t.id} rank={i + 1} cut={i === 2} />)}</Card>
        </div>
      ))}
      {mode === 'wc' && (['E', 'W'] as const).map((c) => {
        const x = pic[c];
        return (
          <div key={c}>
            <SectionTitle>{CONF_NAMES[c]} конференция</SectionTitle>
            <Card pad={false} className="overflow-hidden">
              <Head />
              {x.div1.map((t, i) => <Row key={t.id} id={t.id} rank={i + 1} />)}
              <div className="px-3 py-1 text-[11px] text-muted uppercase bg-white/[0.03]">{DIV_NAMES[x.div2[0].div]}</div>
              {x.div2.map((t, i) => <Row key={t.id} id={t.id} rank={i + 1} />)}
              <div className="px-3 py-1 text-[11px] text-muted uppercase bg-white/[0.03]">Уайлд-кард</div>
              {[...x.wc, ...x.out].map((t, i) => <Row key={t.id} id={t.id} rank={i + 1} cut={i === 1} />)}
            </Card>
          </div>
        );
      })}
      {mode === 'league' && <Card pad={false} className="overflow-hidden mt-3"><Head />{sortedTeams(L).map((t, i) => <Row key={t.id} id={t.id} rank={i + 1} />)}</Card>}
    </div>
  );
}

function Games({ L }: { L: League }) {
  const nav = useNav();
  const [mine, setMine] = useState<'mine' | 'all'>('mine');
  const games = L.games.filter((g) => (mine === 'mine' ? g.h === L.user || g.a === L.user : g.day >= addDaysIso(L.date, -3) && g.day <= addDaysIso(L.date, 3)));
  const sorted = [...games].sort((a, b) => (a.day < b.day ? -1 : 1));
  const firstUpcoming = sorted.findIndex((g) => !g.played);
  const shown = mine === 'mine' ? sorted.slice(Math.max(0, firstUpcoming - 12), Math.max(0, firstUpcoming) + 20) : sorted;
  if (!L.games.length) return <Empty title="Матчей нет" />;
  return (
    <div>
      <Chips value={mine} onChange={setMine} options={[{ v: 'mine', label: 'Мой клуб' }, { v: 'all', label: 'Лига ±3 дня' }]} />
      <div className="flex flex-col gap-1.5 mt-3">
        {shown.map((g) => {
          const won = g.played && (g.h === L.user ? (g.hs ?? 0) > (g.as ?? 0) : g.a === L.user ? (g.as ?? 0) > (g.hs ?? 0) : null);
          return (
            <div key={g.id} onClick={() => g.played && nav.openModal('match', { id: g.id })} className={cx('glass rounded-2xl px-3 h-[54px] flex items-center gap-2.5', g.played && 'press')}>
              <div className="w-12 text-[11.5px] text-muted leading-tight">{dow(g.day)}<br />{dateShort(g.day)}</div>
              <TeamLogo id={g.a} size={26} />
              <span className="text-[13.5px] w-10 font-display">{g.a}</span>
              <div className="flex-1 text-center num text-[17px]">{g.played ? `${g.as} : ${g.hs}` : '@'}</div>
              <span className="text-[13.5px] w-10 text-right font-display">{g.h}</span>
              <TeamLogo id={g.h} size={26} />
              <div className="w-9 text-right">
                {g.played && g.ot && <span className="text-[11px] text-muted">{g.ot}</span>}
                {won != null && <span className={cx('ml-1 text-[12px] font-semibold', won ? 'text-good' : 'text-bad')}>{won ? 'В' : 'П'}</span>}
                {g.series && !g.played && <span className="text-[10px] text-gold">ПО</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function addDaysIso(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Leaders({ L }: { L: League }) {
  const nav = useNav();
  const [po, setPo] = useState<'r' | 'p'>(L.phase === 'playoffs' ? 'p' : 'r');
  const key = statKey(L.season, po === 'p');
  const cats: { title: string; list: { p: import('../../engine/types').Player; v: number }[]; fmt?: (v: number) => string }[] = [
    { title: 'Очки', list: leaders(L, key, 'pts', 10) },
    { title: 'Голы', list: leaders(L, key, 'g', 5) },
    { title: 'Передачи', list: leaders(L, key, 'a', 5) },
    { title: '+/−', list: leaders(L, key, 'pm', 5) },
    { title: 'Очки защитников', list: leaders(L, key, 'pts', 5, (p) => p.pos === 'D') },
    { title: 'Победы вратарей', list: goalieLeaders(L, key, 'w', 5) },
    { title: '% отражённых (15+ игр)', list: goalieLeaders(L, key, 'sv', 5, po === 'p' ? 3 : 15), fmt: (v) => v.toFixed(3).slice(1) },
    { title: 'Хиты', list: leaders(L, key, 'hits', 5) },
  ];
  return (
    <div>
      <Chips value={po} onChange={setPo} options={[{ v: 'r', label: 'Регулярка' }, { v: 'p', label: 'Плей-офф' }]} />
      {cats.map((c) => (
        <div key={c.title}>
          <SectionTitle>{c.title}</SectionTitle>
          {c.list.length ? (
            <Card pad={false} className="overflow-hidden">
              {c.list.map((x, i) => (
                <div key={x.p.id} onClick={() => nav.push('player', { id: x.p.id })} className={cx('press flex items-center gap-3 px-3 h-[52px]', i && 'border-t hairline', x.p.team === L.user && 'bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]')}>
                  <span className="w-5 text-muted text-right num">{i + 1}</span>
                  <PlayerPhoto p={x.p} L={L} size={34} />
                  <div className="flex-1 min-w-0"><div className="text-[14.5px] truncate">{x.p.fn[0]}. {x.p.ln}</div><div className="text-[11.5px] text-muted">{x.p.team}</div></div>
                  <span className={cx('num text-[19px]', i === 0 && 'text-gold')}>{c.fmt ? c.fmt(x.v) : x.v}</span>
                </div>
              ))}
            </Card>
          ) : <div className="text-muted text-[13px] px-1">Нет данных</div>}
        </div>
      ))}
    </div>
  );
}

function SeriesCard({ L, s, onClick }: { L: League; s: PlayoffSeries; onClick?: () => void }) {
  const Line = ({ id, w, win }: { id: string; w: number; win: boolean }) => (
    <div className={cx('flex items-center gap-2 h-9 px-2.5', s.winner && !win && 'opacity-45')}>
      <TeamLogo id={id} size={22} />
      <span className={cx('flex-1 font-display text-[14px]', id === L.user && 'accent-text')}>{L.teams[id].short}</span>
      <span className={cx('num text-[17px]', win && 'text-gold')}>{w}</span>
    </div>
  );
  return (
    <div onClick={onClick} className={cx('glass rounded-2xl overflow-hidden', (s.hi === L.user || s.lo === L.user) && 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)]')}>
      <Line id={s.hi} w={s.wHi} win={s.winner === s.hi} />
      <div className="h-px bg-white/[0.06]" />
      <Line id={s.lo} w={s.wLo} win={s.winner === s.lo} />
    </div>
  );
}

function PlayoffsView({ L }: { L: League }) {
  const po = L.playoffs;
  if (!po) {
    const pic = playoffPicture(L);
    return (
      <div>
        <Card className="mt-1"><div className="text-[14px] text-muted">Плей-офф стартует после регулярного сезона. Если бы он начался сегодня:</div></Card>
        {(['E', 'W'] as const).map((c) => (
          <div key={c}>
            <SectionTitle>{CONF_NAMES[c]}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {[...pic[c].div1, ...pic[c].div2, ...pic[c].wc].map((t) => (
                <div key={t.id} className={cx('glass rounded-2xl px-3 h-11 flex items-center gap-2', t.id === L.user && 'border-[var(--accent)]')}><TeamLogo id={t.id} size={22} /><span className="font-display text-[14px] flex-1">{t.short}</span><span className="num">{t.rec.pts}</span></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const names = ['', '1-й раунд', '2-й раунд', 'Финалы конференций', 'Финал Кубка Стэнли'];
  return (
    <div>
      {po.champion && (
        <Card className="mt-1 text-center !py-5" >
          <div className="text-[12px] uppercase tracking-[0.2em] text-gold">Обладатель Кубка Стэнли {po.season + 1}</div>
          <div className="flex justify-center mt-2"><TeamLogo id={po.champion} size={76} /></div>
          <div className="font-display uppercase text-[24px] mt-2">{L.teams[po.champion].name}</div>
          {po.conn && L.players[po.conn] && <div className="text-[13px] text-muted mt-1">{AWARD_NAMES.conn.split(' — ')[0]}: {L.players[po.conn].fn} {L.players[po.conn].ln}</div>}
        </Card>
      )}
      {[4, 3, 2, 1].filter((r) => po.series.some((s) => s.round === r)).map((r) => (
        <div key={r}>
          <SectionTitle>{names[r]}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {po.series.filter((s) => s.round === r).sort((a, b) => a.id.localeCompare(b.id)).map((s) => <SeriesCard key={s.id} L={L} s={s} />)}
          </div>
        </div>
      ))}
      <div className="text-[12px] text-muted mt-3 px-1">Серии до 4 побед, формат домашних матчей 2-2-1-1-1. <Pill>ОТ до гола</Pill></div>
    </div>
  );
}
