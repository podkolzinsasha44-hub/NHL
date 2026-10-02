import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { lastUserBox } from '../../engine/season';
import type { GameEvent } from '../../engine/types';
import { Icon } from '../components/shell';
import { Button, Card, cx, SectionTitle } from '../components/kit';
import { PlayerPhoto, TeamLogo } from '../components/media';
import { Momentum, ShotMap } from '../components/charts';
import { dateLong, toi } from '../format';
import { horn } from '../sound';

export function MatchScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const close = useNav((s) => s.closeModal);
  const push = useNav((s) => s.push);
  const g = L.games.find((x) => x.id === Number(params.id));
  const box = lastUserBox && lastUserBox.game.id === g?.id ? lastUserBox.box : null;
  const events = box?.result.events ?? [];
  const endT = events.length ? Math.max(...events.map((e) => e.t)) : 3600;
  const [t, setT] = useState(params.live && box ? 0 : endT + 1);
  const [speed, setSpeed] = useState(1);
  const [flash, setFlash] = useState<GameEvent | null>(null);
  const shownGoals = useRef(0);
  const live = t <= endT;

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setT((x) => x + 9 * speed), 100);
    return () => clearInterval(id);
  }, [live, speed]);

  const visible = useMemo(() => events.filter((e) => e.t <= t), [events, t]);
  const goals = visible.filter((e) => e.type === 'goal');
  useEffect(() => {
    if (goals.length > shownGoals.current) {
      const e = goals[goals.length - 1];
      shownGoals.current = goals.length;
      if (live) {
        setFlash(e);
        if (e.team === L.user && L.settings.sound) horn();
        const id = setTimeout(() => setFlash(null), 1600);
        return () => clearTimeout(id);
      }
    }
  }, [goals.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) return null;
  const H = L.teams[g.h], A = L.teams[g.a];
  const hs = live ? goals.filter((e) => e.team === g.h).length + (t >= endT ? 0 : 0) : g.hs ?? 0;
  const as = live ? goals.filter((e) => e.team === g.a).length : g.as ?? 0;
  const period = Math.min(4, Math.floor(Math.min(t, 3599) / 1200) + 1);
  const clock = live ? (() => { const s = Math.max(0, 1200 - (t % 1200)); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; })() : 'Финал';
  const shotsH = live ? (box?.result.shotsMap.filter((s) => s.team === g.h).length ?? 0) * Math.min(1, t / 3600) : g.shH ?? 0;
  const shotsA = live ? (box?.result.shotsMap.filter((s) => s.team === g.a).length ?? 0) * Math.min(1, t / 3600) : g.shA ?? 0;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#05070d]">
      <div className="arena" style={{ position: 'absolute' }} />
      <div className="relative pt-safe flex items-center h-14 px-2 z-10">
        <button onClick={close} className="press w-11 h-11 rounded-full flex items-center justify-center" aria-label="Закрыть"><Icon name="close" /></button>
        <div className="flex-1 text-center font-display uppercase tracking-widest text-[13px] text-muted">{g.series ? 'Плей-офф' : g.special === 'classic' ? 'Winter Classic' : 'Матч-центр'} · {dateLong(g.day)}</div>
        <div className="w-11" />
      </div>
      {/* Scoreboard */}
      <div className="relative mx-3 rounded-[26px] overflow-hidden p-[1px]" style={{ background: `linear-gradient(90deg, ${H.accent}, rgba(255,255,255,0.1), ${A.accent})` }}>
        <div className="rounded-[25px] px-4 py-4" style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${H.primary} 55%, #070b14), #070b14 50%, color-mix(in oklab, ${A.primary} 55%, #070b14))` }}>
          <div className="flex items-center">
            <div className="flex-1 flex flex-col items-center"><TeamLogo id={g.h} size={60} /><div className="font-display uppercase mt-1 text-[14px]">{H.short}</div></div>
            <div className="flex flex-col items-center px-2">
              <div className="num text-[54px] leading-none tracking-tight">
                <motion.span key={`h${hs}`} initial={{ scale: 1.5, color: '#fff' }} animate={{ scale: 1 }}>{hs}</motion.span>
                <span className="text-white/30 mx-2">:</span>
                <motion.span key={`a${as}`} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{as}</motion.span>
              </div>
              <div className={cx('mt-1 px-3 h-6 rounded-full text-[12px] font-semibold flex items-center', live ? 'bg-bad/90 text-white pulse-soft' : 'bg-white/10')}>
                {live ? `${period <= 3 ? `${period}-й` : 'ОТ'} · ${clock}` : `Финал${g.ot ? ` · ${g.ot}` : ''}`}
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center"><TeamLogo id={g.a} size={60} /><div className="font-display uppercase mt-1 text-[14px]">{A.short}</div></div>
          </div>
          <div className="flex justify-between text-[12.5px] text-white/70 mt-3 px-2">
            <span>Броски {Math.round(shotsH)}</span>
            <span>Броски {Math.round(shotsA)}</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div className="absolute inset-x-0 top-[38%] z-20 flex justify-center pointer-events-none" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
            <div className="text-center">
              <div className="font-display uppercase text-[64px] leading-none tracking-wider" style={{ color: L.teams[flash.team]?.accent, textShadow: `0 0 40px ${L.teams[flash.team]?.accent}` }}>ГОЛ!</div>
              <div className="glass-strong rounded-2xl px-4 py-2 mt-2 text-[15px]">{flash.text}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative scroll flex-1 px-4 pt-3 pb-safe">
        {live && (
          <div className="flex gap-2 mb-3">
            {[1, 4, 12].map((s) => <Button key={s} size="sm" full variant={speed === s ? 'primary' : 'glass'} onClick={() => setSpeed(s)}>×{s}</Button>)}
            <Button size="sm" full onClick={() => setT(endT + 1)}>К финалу</Button>
          </div>
        )}
        {!box && <Card className="text-[14px] text-muted">Подробный протокол доступен только для последнего матча вашей команды.</Card>}
        {box && (
          <>
            <SectionTitle className="!mt-1">Ход матча</SectionTitle>
            <Card pad={false} className="overflow-hidden">
              {visible.filter((e) => e.type !== 'end').slice().reverse().slice(0, 40).map((e, i) => (
                <motion.div key={`${e.t}-${i}-${e.type}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className={cx('flex items-center gap-3 px-3 py-2.5', i && 'border-t hairline', e.type === 'goal' && 'bg-white/[0.04]')}>
                  <div className="w-12 text-[11.5px] text-muted tnum">{e.type === 'period' || e.type === 'so' ? '' : `${e.p <= 3 ? e.p : 'ОТ'} · ${fmtT(e.t)}`}</div>
                  {e.team ? <TeamLogo id={e.team} size={22} /> : <div className="w-[22px]" />}
                  <div className={cx('flex-1 text-[14px]', e.type === 'goal' && 'font-semibold', e.type === 'period' && 'text-muted font-display uppercase text-[12px] tracking-wider')}>
                    {e.type === 'goal' ? `🚨 ${e.text}` : e.type === 'penalty' ? `⛔ ${e.text}` : e.text}
                    {e.type === 'goal' && <div className="text-[12.5px] text-muted font-normal mt-0.5">{COMMENT[(e.t + (e.players?.[0] ?? 0)) % COMMENT.length]}</div>}
                  </div>
                  {e.score && e.type === 'goal' && <div className="num text-[15px]">{e.score[0]}:{e.score[1]}</div>}
                </motion.div>
              ))}
              {!visible.length && <div className="px-4 py-6 text-muted text-[14px]">Вбрасывание…</div>}
            </Card>
            {!live && (
              <>
                <SectionTitle>Три звезды</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  {(g.stars ?? []).map((id, i) => {
                    const p = L.players[id];
                    if (!p) return null;
                    return (
                      <Card key={id} className="!p-3 flex flex-col items-center text-center" onClick={() => { close(); push('player', { id }); }}>
                        <div className="text-gold text-[13px]">{'★'.repeat(3 - i)}</div>
                        <PlayerPhoto p={p} L={L} size={52} className="mt-1" />
                        <div className="text-[13px] font-medium mt-1 truncate w-full">{p.ln}</div>
                        <div className="text-[11px] text-muted">{p.team}</div>
                      </Card>
                    );
                  })}
                </div>
                <SectionTitle>Карта бросков</SectionTitle>
                <ShotMap shots={box.result.shotsMap} home={g.h} />
                <SectionTitle>Моментум (броски по 5 минут)</SectionTitle>
                <Card><Momentum bins={box.result.momentum} home={H.short} away={A.short} /></Card>
                <SectionTitle>Большинство</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <Card className="!py-3"><div className="text-[12px] text-muted">{H.short}</div><div className="num text-[20px]">{box.result.ppH[0]}/{box.result.ppH[1]}</div></Card>
                  <Card className="!py-3"><div className="text-[12px] text-muted">{A.short}</div><div className="num text-[20px]">{box.result.ppA[0]}/{box.result.ppA[1]}</div></Card>
                </div>
                {[box.home, box.away].map((side) => (
                  <div key={side.team.id}>
                    <SectionTitle>{side.team.short} — игроки</SectionTitle>
                    <Card pad={false} className="overflow-hidden">
                      <div className="flex px-3 h-8 items-center text-[11px] text-muted uppercase"><span className="flex-1">Игрок</span><span className="w-8 text-right">Г</span><span className="w-8 text-right">П</span><span className="w-8 text-right">Бр</span><span className="w-9 text-right">+/−</span><span className="w-12 text-right">Время</span></div>
                      {[...side.dressed].sort((a, b) => b.g * 2 + b.a - (a.g * 2 + a.a) || b.toi - a.toi).map((s) => (
                        <div key={s.id} className="flex px-3 h-9 items-center text-[13.5px] border-t hairline tnum">
                          <span className="flex-1 truncate">{s.p.fn[0]}. {s.p.ln}</span>
                          <span className="w-8 text-right">{s.g}</span><span className="w-8 text-right">{s.a}</span><span className="w-8 text-right text-muted">{s.sog}</span>
                          <span className={cx('w-9 text-right', s.pm > 0 ? 'text-good' : s.pm < 0 ? 'text-bad' : 'text-muted')}>{s.pm > 0 ? '+' : ''}{s.pm}</span>
                          <span className="w-12 text-right text-muted">{toi(s.toi, 1)}</span>
                        </div>
                      ))}
                      <div className="flex px-3 h-9 items-center text-[13.5px] border-t hairline">
                        <span className="flex-1">🥅 {side.goalie.fn[0]}. {side.goalie.ln}</span>
                        <span className="text-muted">{side.saves} сейвов</span>
                      </div>
                    </Card>
                  </div>
                ))}
              </>
            )}
          </>
        )}
        <div className="h-10" />
      </div>
    </div>
  );
}

const COMMENT = [
  'Какой бросок! Вратарь даже не шелохнулся.',
  'Добивание на пятаке — классика жанра.',
  'Розыгрыш в одно касание, защита разорвана!',
  'Бросок в «домик» — без шансов.',
  'Шайба проходит через частокол ног!',
  'Выход один на один — и холодная реализация.',
  'Щелчок с синей линии, вратарь закрыт.',
  'Подставил клюшку под бросок — и шайба в сетке.',
  'Трибуны взрываются!',
  'Перехват в средней зоне и мгновенный отрыв.',
];

function fmtT(t: number) {
  const s = t % 1200;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
