import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, Player } from '../../engine/types';
import { Screen } from '../components/shell';
import { Button, Chips, cx, Empty, Ovr, Segmented, SectionTitle } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { PlayerPhoto } from '../components/media';
import { capSummary } from '../../engine/contracts';
import { autoLines, available } from '../../engine/lines';
import { money, POS_RU } from '../format';
import { callUp, signElc } from '../actions';
import { statKey, sl } from '../../engine/stats';
import { Term } from '../components/Term';

type View = 'lines' | 'nhl' | 'ahl' | 'rights';

export function Roster({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [view, setView] = useState<View>((params.view as View) ?? 'lines');
  const cap = capSummary(L, L.user);
  const org = Object.values(L.players).filter((p) => p.team === L.user && p.st !== 'RET');
  return (
    <Screen
      title="Состав"
      subtitle={`${org.filter((p) => p.st === 'NHL').length} в НХЛ · ${org.filter((p) => p.st === 'AHL').length} в АХЛ · ${money(cap.space)} под потолком`}
      headerExtra={
        <div className="px-4 pb-2">
          <Segmented value={view} onChange={setView} options={[{ v: 'lines', label: 'Звенья' }, { v: 'nhl', label: 'НХЛ' }, { v: 'ahl', label: 'АХЛ' }, { v: 'rights', label: 'Права' }]} />
        </div>
      }
    >
      {view === 'lines' && <LinesEditor L={L} />}
      {view === 'nhl' && <RosterList L={L} players={org.filter((p) => p.st === 'NHL')} />}
      {view === 'ahl' && <AhlList L={L} players={org.filter((p) => p.st === 'AHL')} />}
      {view === 'rights' && <RightsList L={L} players={org.filter((p) => p.st !== 'NHL' && p.st !== 'AHL')} />}
    </Screen>
  );
}

type Slot = { kind: 'f' | 'd' | 'g'; i: number; j: number } | { kind: 'bench'; id: number };

function LinesEditor({ L }: { L: League }) {
  const t = L.teams[L.user];
  const nav = useNav();
  const [sel, setSel] = useState<Slot | null>(null);
  const roster = Object.values(L.players).filter((p) => p.team === L.user && p.st === 'NHL');
  const inLines = new Set([...t.lines.f.flat(), ...t.lines.d.flat(), ...t.lines.g]);
  const bench = roster.filter((p) => !inLines.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const idAt = (s: Slot) => (s.kind === 'bench' ? s.id : s.kind === 'g' ? t.lines.g[s.i] : t.lines[s.kind][s.i]?.[s.j]);
  const same = (a: Slot, b: Slot) => JSON.stringify(a) === JSON.stringify(b);

  const tap = (s: Slot) => {
    if (!sel) return setSel(s);
    if (same(sel, s)) return setSel(null);
    const a = idAt(sel), b = idAt(s);
    useGame.getState().act((L) => {
      const ln = L.teams[L.user].lines;
      const put = (slot: Slot, id: number | undefined) => {
        if (slot.kind === 'bench' || id == null) return;
        if (slot.kind === 'g') ln.g[slot.i] = id;
        else { ln[slot.kind][slot.i] ??= []; ln[slot.kind][slot.i][slot.j] = id; }
      };
      put(sel, b);
      put(s, a);
      ln.auto = false;
      // keep special teams consistent with healthy roster
      const ok = new Set([...ln.f.flat(), ...ln.d.flat()]);
      ln.pp = ln.pp.map((u) => u.filter((x) => ok.has(x) || L.players[x]?.team === L.user));
    });
    setSel(null);
  };

  const Tile = ({ s, label }: { s: Slot; label: string }) => {
    const id = idAt(s);
    const p = id != null ? L.players[id] : null;
    const active = sel && same(sel, s);
    return (
      <motion.button
        layout
        onClick={() => tap(s)}
        onDoubleClick={() => p && nav.push('player', { id: p.id })}
        className={cx('press relative flex-1 min-w-0 rounded-2xl p-2 flex flex-col items-center gap-1 border transition-colors', active ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]' : 'glass')}
      >
        <div className="absolute left-2 top-1.5 text-[10px] text-muted font-display">{label}</div>
        {p ? (
          <>
            <PlayerPhoto p={p} L={L} size={40} className="mt-2" />
            <div className="text-[12.5px] font-medium truncate w-full text-center">{p.ln}</div>
            <div className="flex items-center gap-1">
              <span className="num text-[14px]" style={{ color: p.inj ? '#ff5a5f' : undefined }}>{p.ovr}</span>
              <span className="text-[10px] text-muted">{POS_RU[p.pos]}</span>
            </div>
            {p.inj && <div className="absolute right-1.5 top-1.5 w-2 h-2 rounded-full bg-bad" />}
          </>
        ) : (
          <div className="h-[74px] flex items-center text-muted text-[12px]">пусто</div>
        )}
      </motion.button>
    );
  };

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 mt-1 mb-3">
        <div className="text-[13px] text-muted flex-1">{sel ? 'Выберите, с кем поменять' : 'Нажмите на игрока, затем на другого — они поменяются местами'}</div>
        <Button size="sm" variant={t.lines.auto ? 'primary' : 'glass'} onClick={() => useGame.getState().act((L) => { const tm = L.teams[L.user]; tm.lines.auto = true; autoLines(L, tm); })}>
          {t.lines.auto ? 'Авто ✓' : 'Авто'}
        </Button>
      </div>
      <SectionTitle className="!mt-2">Нападение</SectionTitle>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2 items-stretch">
            <div className="w-5 flex items-center justify-center font-display text-muted text-[13px]">{i + 1}</div>
            <Tile s={{ kind: 'f', i, j: 0 }} label="ЛН" />
            <Tile s={{ kind: 'f', i, j: 1 }} label="ЦН" />
            <Tile s={{ kind: 'f', i, j: 2 }} label="ПН" />
          </div>
        ))}
      </div>
      <SectionTitle>Защита</SectionTitle>
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2">
            <div className="w-5 flex items-center justify-center font-display text-muted text-[13px]">{i + 1}</div>
            <Tile s={{ kind: 'd', i, j: 0 }} label="ЛЗ" />
            <Tile s={{ kind: 'd', i, j: 1 }} label="ПЗ" />
            <div className="flex-1" />
          </div>
        ))}
      </div>
      <SectionTitle>Вратари</SectionTitle>
      <div className="flex gap-2">
        <div className="w-5" />
        <Tile s={{ kind: 'g', i: 0, j: 0 }} label="Осн." />
        <Tile s={{ kind: 'g', i: 1, j: 0 }} label="Зап." />
        <div className="flex-1" />
      </div>
      <SectionTitle>Запасные · {bench.length}</SectionTitle>
      {bench.length ? (
        <div className="grid grid-cols-3 gap-2">
          {bench.map((p) => <Tile key={p.id} s={{ kind: 'bench', id: p.id }} label={p.inj ? 'травма' : 'запас'} />)}
        </div>
      ) : (
        <div className="text-muted text-[13px] px-1">Все игроки в составе.</div>
      )}
      <SectionTitle>Спецбригады</SectionTitle>
      <div className="glass rounded-3xl p-3 text-[13px] text-muted">
        <div><b className="text-ink"><Term k="pp">Большинство</Term> 1:</b> {t.lines.pp[0]?.map((id) => L.players[id]?.ln).join(', ')}</div>
        <div className="mt-1"><b className="text-ink"><Term k="pk">Меньшинство</Term> 1:</b> {t.lines.pk[0]?.map((id) => L.players[id]?.ln).join(', ')}</div>
        <div className="mt-1.5 text-faint">Спецбригады собираются автоматически из лучших в атаке и обороне.</div>
      </div>
    </div>
  );
}

type Sort = 'pos' | 'ovr' | 'age' | 'aav' | 'pts';
function RosterList({ L, players }: { L: League; players: Player[] }) {
  const [sort, setSort] = useState<Sort>('pos');
  const key = statKey(L.season, false);
  const list = useMemo(() => {
    const order = { C: 0, L: 1, R: 2, D: 3, G: 4 };
    const arr = [...players];
    if (sort === 'pos') arr.sort((a, b) => order[a.pos] - order[b.pos] || b.ovr - a.ovr);
    if (sort === 'ovr') arr.sort((a, b) => b.ovr - a.ovr);
    if (sort === 'age') arr.sort((a, b) => (a.bd < b.bd ? 1 : -1));
    if (sort === 'aav') arr.sort((a, b) => (b.c?.aav ?? 0) - (a.c?.aav ?? 0));
    if (sort === 'pts') arr.sort((a, b) => (sl(b, key)?.pts ?? -1) - (sl(a, key)?.pts ?? -1));
    return arr;
  }, [players, sort, key]);
  return (
    <div>
      <Chips value={sort} onChange={setSort} options={[{ v: 'pos', label: 'По позиции' }, { v: 'ovr', label: 'Рейтинг' }, { v: 'pts', label: 'Очки' }, { v: 'aav', label: 'Зарплата' }, { v: 'age', label: 'Возраст' }]} />
      <div className="glass rounded-3xl mt-3 py-1">
        {list.map((p) => {
          const s = sl(p, key);
          return <PlayerRow key={p.id} p={p} L={L} right={p.pos !== 'G' && s ? <div className="text-right mr-1"><div className="num text-[15px]">{s.g}+{s.a}</div><div className="text-[10px] text-muted">{s.gp} И</div></div> : undefined} />;
        })}
      </div>
    </div>
  );
}

function AhlList({ L, players }: { L: League; players: Player[] }) {
  if (!players.length) return <Empty title="Фарм-клуб пуст" text="Подпишите свободных агентов или проспектов." />;
  return (
    <div className="glass rounded-3xl py-1">
      {[...players].sort((a, b) => b.ovr - a.ovr).map((p) => (
        <PlayerRow
          key={p.id}
          p={p}
          L={L}
          showPot
          right={available(p) ? <Button size="sm" variant="glass" onClick={() => callUp(p)}>Вызвать</Button> : undefined}
        />
      ))}
    </div>
  );
}

function RightsList({ L, players }: { L: League; players: Player[] }) {
  if (!players.length) return <Empty title="Нет прав на игроков" text="Здесь появятся задрафтованные проспекты, которые ещё не подписали контракт." />;
  return (
    <div>
      <div className="text-[13px] text-muted px-1 mb-2">Задрафтованные игроки в юниорских лигах, NCAA и Европе. Права действуют до 22 лет — подпишите контракт новичка (<Term k="elc">ELC</Term>), чтобы не потерять их.</div>
      <div className="glass rounded-3xl py-1">
        {[...players].sort((a, b) => b.pot - a.pot).map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            L={L}
            showPot
            sub={`${POS_RU[p.pos]} · ${p.lg ?? p.st} · права до ${(p.rightsUntil ?? L.season) + 1}`}
            right={!p.c ? <Button size="sm" variant="primary" onClick={() => signElc(p)}>ELC</Button> : <Ovr v={p.ovr} size={0} className="hidden" />}
          />
        ))}
      </div>
    </div>
  );
}
