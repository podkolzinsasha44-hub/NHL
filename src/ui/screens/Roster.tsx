import { motion, useMotionValue } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, Player } from '../../engine/types';
import { Screen } from '../components/shell';
import { Button, Chips, cx, Empty, Ovr, Segmented, SectionTitle } from '../components/kit';
import { PlayerRow } from '../components/rows';
import { RinkToken } from '../components/PlayerCard';
import { capSummary } from '../../engine/contracts';
import { autoLines, available } from '../../engine/lines';
import { money, POS_RU, rosterLabels } from '../format';
import { isNhlGM } from '../../engine/leagues';
import { callUp, signElc } from '../actions';
import { statKey, sl } from '../../engine/stats';
import { Term } from '../components/Term';

type View = 'lines' | 'nhl' | 'ahl' | 'rights';

export function Roster({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [view, setView] = useState<View>((params.view as View) ?? 'lines');
  const cap = capSummary(L, L.user);
  const org = Object.values(L.players).filter((p) => p.team === L.user && p.st !== 'RET');
  const lb = rosterLabels(L, L.user);
  const nhlGM = isNhlGM(L);
  // Draftees playing for KHL clubs: the rights are ours, the contract is theirs.
  const abroad = nhlGM ? Object.values(L.players).filter((p) => p.rights === L.user && p.st !== 'RET') : [];
  const opts = [{ v: 'lines' as View, label: 'Звенья' }, { v: 'nhl' as View, label: nhlGM ? 'НХЛ' : 'Основа' }, { v: 'ahl' as View, label: lb.farm }, ...(nhlGM ? [{ v: 'rights' as View, label: 'Права' }] : [])];
  return (
    <Screen
      title="Состав"
      subtitle={`${org.filter((p) => p.st === 'NHL').length} в ${nhlGM ? 'НХЛ' : 'основе'} · ${org.filter((p) => p.st === 'AHL').length} в ${lb.farm} · ${money(cap.space)} под потолком`}
      headerExtra={
        <div className="px-4 pb-2">
          <Segmented value={view} onChange={setView} options={opts} />
        </div>
      }
    >
      {view === 'lines' && <LinesEditor L={L} />}
      {view === 'nhl' && <RosterList L={L} players={org.filter((p) => p.st === 'NHL')} />}
      {view === 'ahl' && <AhlList L={L} players={org.filter((p) => p.st === 'AHL')} />}
      {view === 'rights' && <RightsList L={L} players={[...org.filter((p) => p.st !== 'NHL' && p.st !== 'AHL'), ...abroad]} />}
    </Screen>
  );
}

type Slot = { kind: 'f' | 'd' | 'g'; i: number; j: number } | { kind: 'bench'; id: number };

const slotKey = (s: Slot) => (s.kind === 'bench' ? `b${s.id}` : `${s.kind}${s.i}${s.j}`);
const parseSlot = (k: string): Slot => (k[0] === 'b' ? { kind: 'bench', id: Number(k.slice(1)) } : { kind: k[0] as 'f' | 'd' | 'g', i: Number(k[1]), j: Number(k[2]) });

/** Hold this long without moving to pick a player up; moving earlier scrolls the page instead. */
const HOLD_MS = 220;

function LinesEditor({ L }: { L: League }) {
  const t = L.teams[L.user];
  const nav = useNav();
  const { act, toast } = useGame.getState();
  const [sel, setSel] = useState<Slot | null>(null);
  const [drag, setDrag] = useState<{ from: Slot; id: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ghostX = useMotionValue(0), ghostY = useMotionValue(0);
  const press = useRef<{ key: string; x: number; y: number; timer: number; moved: boolean } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const roster = Object.values(L.players).filter((p) => p.team === L.user && p.st === 'NHL');
  const inLines = new Set([...t.lines.f.flat(), ...t.lines.d.flat(), ...t.lines.g]);
  const bench = roster.filter((p) => !inLines.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const idAt = (s: Slot) => (s.kind === 'bench' ? s.id : s.kind === 'g' ? t.lines.g[s.i] : t.lines[s.kind][s.i]?.[s.j]);

  const swap = (a: Slot, b: Slot) => {
    if (slotKey(a) === slotKey(b)) return;
    const ia = idAt(a), ib = idAt(b);
    // Goalies stay in the net, skaters on the ice.
    const fits = (id: number | undefined, s: Slot) => id == null || s.kind === 'bench' || (s.kind === 'g') === (L.players[id]?.pos === 'G');
    if (!fits(ia, b) || !fits(ib, a)) return toast('Вратаря можно поставить только в ворота, полевого — только в поле', 'bad');
    act((L) => {
      const ln = L.teams[L.user].lines;
      const put = (slot: Slot, id: number | undefined) => {
        if (slot.kind === 'bench' || id == null) return;
        if (slot.kind === 'g') ln.g[slot.i] = id;
        else { ln[slot.kind][slot.i] ??= []; ln[slot.kind][slot.i][slot.j] = id; }
      };
      put(a, ib);
      put(b, ia);
      ln.auto = false;
      // keep special teams consistent with healthy roster
      const ok = new Set([...ln.f.flat(), ...ln.d.flat()]);
      ln.pp = ln.pp.map((u) => u.filter((x) => ok.has(x) || L.players[x]?.team === L.user));
    });
  };

  const tap = (s: Slot) => {
    if (!sel) return setSel(s);
    if (slotKey(sel) === slotKey(s)) return setSel(null);
    swap(sel, s);
    setSel(null);
  };

  // While a player is lifted: block page scrolling (iOS needs a non-passive touchmove) and
  // scroll the screen when the finger nears its top or bottom edge.
  useEffect(() => {
    if (!drag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    let raf = 0;
    const tick = () => {
      const main = document.querySelector('main');
      const y = pointer.current.y, hgt = window.innerHeight;
      if (main) {
        const edge = 110;
        if (y < edge + 60) main.scrollTop -= Math.ceil((edge + 60 - y) / 10);
        else if (y > hgt - edge - 40) main.scrollTop += Math.ceil((y - (hgt - edge - 40)) / 10);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { document.removeEventListener('touchmove', block); cancelAnimationFrame(raf); };
  }, [drag]);

  const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null)?.dataset.slot ?? null;

  const handlers = (s: Slot) => ({
    'data-slot': slotKey(s),
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      const id = idAt(s);
      if (id == null) return;
      const el = e.currentTarget, pid = e.pointerId;
      pointer.current = { x: e.clientX, y: e.clientY };
      const timer = window.setTimeout(() => {
        if (!press.current || press.current.moved) return;
        try { el.setPointerCapture(pid); } catch { /* pointer already gone */ }
        ghostX.set(pointer.current.x);
        ghostY.set(pointer.current.y);
        setSel(null);
        setDrag({ from: s, id });
        navigator.vibrate?.(12);
      }, HOLD_MS);
      press.current = { key: slotKey(s), x: e.clientX, y: e.clientY, timer, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (drag) {
        ghostX.set(e.clientX);
        ghostY.set(e.clientY);
        const k = targetAt(e.clientX, e.clientY);
        setOver(k && k !== slotKey(drag.from) ? k : null);
      } else if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) {
        press.current.moved = true; // a scroll, not a pick-up
        clearTimeout(press.current.timer);
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const pr = press.current;
      press.current = null;
      if (pr) clearTimeout(pr.timer);
      if (drag) {
        const k = targetAt(e.clientX, e.clientY);
        if (k && k !== slotKey(drag.from)) swap(drag.from, parseSlot(k));
        setDrag(null);
        setOver(null);
      } else if (pr && !pr.moved) {
        tap(s);
      }
    },
    onPointerCancel: () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
      setDrag(null);
      setOver(null);
    },
    onDoubleClick: () => { const id = idAt(s); if (id != null) nav.push('player', { id }); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // A plain function (not a component): elements keep their identity across renders, so the
  // pointer capture survives while a player is dragged.
  const spot = (s: Slot, label: string, w = 64) => {
    const id = idAt(s);
    const p = id != null ? L.players[id] : null;
    const k = slotKey(s);
    const lifted = drag && slotKey(drag.from) === k;
    const target = over === k;
    const picked = sel && slotKey(sel) === k;
    return (
      <div
        key={k}
        {...handlers(s)}
        className={cx('relative flex flex-col items-center select-none touch-manipulation transition-transform duration-150', target && 'scale-110', picked && 'scale-105')}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
      >
        <div className={cx('rounded-[13px] transition-opacity', lifted && 'opacity-30', (target || picked) && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[#0b1424]')}>
          {p ? <RinkToken p={p} L={L} w={w} /> : <div className="rounded-[12px] border border-dashed border-white/25 flex items-center justify-center text-[11px] text-white/40" style={{ width: w, height: w * 1.32 }}>пусто</div>}
        </div>
        <div className="mt-0.5 text-[11px] font-display tracking-wider text-white/45">{label}</div>
        {p?.inj && <div className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-bad border-2 border-[#0b1424]" title="травма" />}
      </div>
    );
  };

  const avg = (ids: (number | undefined)[]) => {
    const ps = ids.map((id) => (id != null ? L.players[id] : null)).filter((x): x is Player => !!x);
    return ps.length ? Math.round(ps.reduce((a, p) => a + p.ovr, 0) / ps.length) : 0;
  };
  const rowLabel = (n: string, ovr: number) => (
    <div className="w-9 shrink-0 flex flex-col items-center leading-none">
      <div className="font-display text-[13px] text-white/60">{n}</div>
      <div className="num text-[15px] text-white mt-1">{ovr}</div>
    </div>
  );

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 mt-1 mb-3">
        <div className="text-[13px] text-muted flex-1">{drag ? 'Отпустите на месте игрока, с которым поменять' : sel ? 'Выберите, с кем поменять' : 'Зажмите игрока и перетащите на другое место — они поменяются. Двойной тап — карточка.'}</div>
        <Button size="sm" variant={t.lines.auto ? 'primary' : 'glass'} onClick={() => act((L) => { const tm = L.teams[L.user]; tm.lines.auto = true; autoLines(L, tm); })}>
          {t.lines.auto ? 'Авто ✓' : 'Авто'}
        </Button>
      </div>

      {/* the rink, top-down: attacking zone on top, own net at the bottom */}
      <div className="relative rounded-[36px] overflow-hidden border border-white/10" style={{ background: 'linear-gradient(180deg, #0f1c30 0%, #0b1424 50%, #0f1c30 100%)' }}>
        {/* attacking zone */}
        <div className="relative px-1.5 pt-3 pb-3">
          <ZoneMarks top />
          <div className="relative h-px mx-4 mb-2.5" style={{ background: 'rgba(255,77,94,0.45)' }} />
          <div className="relative text-center text-[11px] uppercase tracking-[0.3em] text-white/40 mb-2">Нападение</div>
          <div className="relative flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center">
                {rowLabel(`${i + 1}`, avg(t.lines.f[i] ?? []))}
                <div className="flex-1 flex justify-around">
                  {spot({ kind: 'f', i, j: 0 }, 'ЛН')}
                  {spot({ kind: 'f', i, j: 1 }, 'ЦН')}
                  {spot({ kind: 'f', i, j: 2 }, 'ПН')}
                </div>
                <div className="w-9 shrink-0" />
              </div>
            ))}
          </div>
        </div>
        {/* neutral zone: blue lines, red centre line, centre circle */}
        <div className="relative h-16">
          <div className="absolute inset-x-0 top-0 h-[5px]" style={{ background: 'rgba(77,141,255,0.55)' }} />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,77,94,0.6) 0 10px, transparent 10px 15px)' }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border border-[rgba(77,141,255,0.45)]" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(77,141,255,0.8)' }} />
          <div className="absolute inset-x-0 bottom-0 h-[5px]" style={{ background: 'rgba(77,141,255,0.55)' }} />
        </div>
        {/* defensive zone and the net */}
        <div className="relative px-1.5 pt-3 pb-4">
          <ZoneMarks />
          <div className="relative text-center text-[11px] uppercase tracking-[0.3em] text-white/40 mb-2">Защита</div>
          <div className="relative flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center">
                {rowLabel(`${i + 1}`, avg(t.lines.d[i] ?? []))}
                <div className="flex-1 flex justify-center gap-10">
                  {spot({ kind: 'd', i, j: 0 }, 'ЛЗ')}
                  {spot({ kind: 'd', i, j: 1 }, 'ПЗ')}
                </div>
                <div className="w-9 shrink-0" />
              </div>
            ))}
          </div>
          <div className="relative flex items-end justify-center gap-8 mt-5">
            {/* goal crease behind the starter */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] w-36 h-20 rounded-t-full border border-b-0 border-[rgba(255,77,94,0.45)]" style={{ background: 'rgba(77,141,255,0.12)' }} />
            <div className="w-16" />
            {spot({ kind: 'g', i: 0, j: 0 }, 'ВРАТАРЬ', 72)}
            <div className="w-16 flex justify-center opacity-90">{spot({ kind: 'g', i: 1, j: 0 }, 'ЗАП.', 52)}</div>
          </div>
          <div className="relative h-px mx-4 mt-4" style={{ background: 'rgba(255,77,94,0.45)' }} />
        </div>
      </div>

      <SectionTitle>Запасные · {bench.length}</SectionTitle>
      {bench.length ? (
        <div className="glass rounded-3xl p-3 flex flex-wrap gap-3 justify-start">
          {bench.map((p) => spot({ kind: 'bench', id: p.id }, p.inj ? 'травма' : POS_RU[p.pos], 56))}
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

      {/* the lifted player follows the finger */}
      {drag && L.players[drag.id] && (
        <motion.div className="fixed left-0 top-0 z-50 pointer-events-none" style={{ x: ghostX, y: ghostY, translateX: '-50%', translateY: '-70%' }}>
          <motion.div initial={{ scale: 1 }} animate={{ scale: 1.15, rotate: -3 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} className="drop-shadow-[0_18px_24px_rgba(0,0,0,0.7)]">
            <RinkToken p={L.players[drag.id]} L={L} w={66} />
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

/** Faceoff circles of a zone (the lines themselves are part of the rink layout). */
function ZoneMarks({ top }: { top?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {[18, 82].map((x) => (
        <div key={x} className="absolute w-28 h-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,77,94,0.2)]" style={{ left: `${x}%`, top: top ? '38%' : '30%' }}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: 'rgba(255,77,94,0.35)' }} />
        </div>
      ))}
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
      <div className="text-[13px] text-muted px-1 mb-2">Задрафтованные игроки в юниорских лигах, NCAA и Европе. Права действуют до 22 лет — подпишите контракт новичка (<Term k="elc">ELC</Term>), чтобы не потерять их. Игроки клубов КХЛ доступны, когда закончится их контракт там.</div>
      <div className="glass rounded-3xl py-1">
        {[...players].sort((a, b) => b.pot - a.pot).map((p) => {
          const khlClub = p.rights === L.user && p.team ? L.teams[p.team] : null;
          const locked = !!khlClub && !!p.c && p.c.last >= L.season;
          return (
            <PlayerRow
              key={p.id}
              p={p}
              L={L}
              showPot
              sub={khlClub ? `${POS_RU[p.pos]} · ${khlClub.short} (КХЛ) до ${(p.c?.last ?? L.season) + 1} · права до ${(p.rightsUntil ?? L.season) + 1}` : `${POS_RU[p.pos]} · ${p.lg ?? p.st} · права до ${(p.rightsUntil ?? L.season) + 1}`}
              right={!locked && (!p.c || p.rights === L.user) ? <Button size="sm" variant="primary" onClick={() => signElc(p)}>ELC</Button> : <Ovr v={p.ovr} size={0} className="hidden" />}
            />
          );
        })}
      </div>
    </div>
  );
}
