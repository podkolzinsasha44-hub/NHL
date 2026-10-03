import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useGame, type SimMode } from '../../store/game';
import { dateLong, dateShort, phaseLabel } from '../format';
import { Icon, Sheet } from '../components/shell';
import { Button, cx, Spinner } from '../components/kit';
import { TeamLogo } from '../components/media';
import { nextUserGame } from '../../engine/season';
import { userDeadline, userPhase, userTeam } from '../../engine/leagues';

export function SimOverlay() {
  const sim = useGame((s) => s.sim);
  const L = useGame((s) => s.L)!;
  const stop = useGame((s) => s.stopSim);
  return (
    <AnimatePresence>
      {sim && (
        <motion.div
          className="fixed inset-x-0 z-50 px-3"
          style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 10px)' }}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
        >
          <div className="glass-strong rounded-3xl p-3 pl-4 flex items-center gap-3 max-w-[560px] mx-auto shadow-2xl">
            <Spinner size={22} />
            <div className="flex-1 min-w-0">
              <div className="font-display uppercase tracking-wide text-[15px]">{dateLong(L.date)}</div>
              <div className="text-[12.5px] text-muted truncate">
                {sim.last ? (
                  <>
                    {sim.last.won ? '✅' : '❌'} {sim.last.game.h} {sim.last.game.hs}:{sim.last.game.as} {sim.last.game.a}
                    {sim.last.game.ot ? ` ${sim.last.game.ot}` : ''} · {sim.results.filter((r) => r.won).length}–{sim.results.filter((r) => !r.won).length}
                  </>
                ) : (
                  phaseLabel(L)
                )}
              </div>
            </div>
            <Button size="sm" variant="glass" onClick={stop} icon={<Icon name="pause" size={16} />}>Стоп</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const OPTIONS: { mode: SimMode; label: string; sub: string; show?: (ph: string, afterDeadline: boolean) => boolean }[] = [
  { mode: 'event', label: 'До следующего события', sub: 'Остановимся на предложениях, травмах и ключевых датах' },
  { mode: 'game', label: 'Следующий матч', sub: 'Сыграть до ближайшей игры вашей команды', show: (ph) => ph === 'regular' || ph === 'playoffs' || ph === 'preseason' },
  { mode: 'day', label: 'Один день', sub: 'Медленно и внимательно' },
  { mode: 'week', label: 'Неделя', sub: '7 дней' },
  { mode: 'deadline', label: 'До дедлайна обменов', sub: 'Последний шанс усилиться', show: (ph, a) => ph === 'regular' && !a },
  { mode: 'regular', label: 'До конца регулярки', sub: 'Без остановок до плей-офф', show: (ph) => ph === 'regular' || ph === 'preseason' },
  { mode: 'season', label: 'До конца сезона', sub: 'Плей-офф и вручение Кубка', show: (ph) => ph === 'regular' || ph === 'playoffs' },
];

export function SimDock() {
  const L = useGame((s) => s.L)!;
  const sim = useGame((s) => s.sim);
  const simulate = useGame((s) => s.simulate);
  const [open, setOpen] = useState(false);
  const ng = nextUserGame(L);
  const ph = userPhase(L);
  const ut = userTeam(L);
  const label = L.phase === 'draft' && L.mode !== 'player' && !L.teams[L.user]?.lg ? 'Завершить драфт' : L.phase === 'freeagency' ? 'Следующий день рынка' : 'Продолжить';
  if (sim) return null;
  return (
    <>
      <div className="fixed inset-x-0 z-30 px-4 pointer-events-none" style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 10px)' }}>
        <div className="flex gap-2 max-w-[560px] mx-auto pointer-events-auto">
          <button
            onClick={() => simulate(L.phase === 'freeagency' ? 'day' : 'event')}
            className="press flex-1 h-[56px] rounded-[20px] accent-bg flex items-center justify-center gap-2.5 shadow-[0_14px_40px_-10px_var(--accent)] text-white"
          >
            <Icon name="play" size={20} />
            <div className="text-left leading-tight">
              <div className="font-display uppercase tracking-wider text-[17px]">{label}</div>
              {ng && (ph === 'regular' || ph === 'playoffs') && (
                <div className="text-[11.5px] text-white/80 -mt-0.5">след. матч: {dateShort(ng.day)} · {ng.h === ut ? 'дома' : 'в гостях'} с {L.teams[ng.h === ut ? ng.a : ng.h]?.short ?? ''}</div>
              )}
            </div>
          </button>
          <button onClick={() => setOpen(true)} className="press w-[56px] h-[56px] rounded-[20px] glass-strong flex items-center justify-center" aria-label="Режимы">
            <Icon name="ff" size={20} />
          </button>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Симуляция">
        <div className="flex flex-col gap-2">
          {OPTIONS.filter((o) => !o.show || o.show(ph, L.date > userDeadline(L))).map((o) => (
            <button
              key={o.mode}
              onClick={() => { setOpen(false); simulate(o.mode); }}
              className="press glass rounded-2xl px-4 py-3 text-left flex items-center gap-3"
            >
              <div className="flex-1">
                <div className="font-semibold text-[15.5px]">{o.label}</div>
                <div className="text-[12.5px] text-muted">{o.sub}</div>
              </div>
              <Icon name="play" size={16} className="text-muted" />
            </button>
          ))}
        </div>
        {ng && (
          <div className={cx('mt-4 glass rounded-2xl p-3 flex items-center gap-3')}>
            <TeamLogo id={ng.h === ut ? ng.a : ng.h} size={34} />
            <div className="text-[13.5px] text-muted">
              Следующий матч: <span className="text-ink">{dateLong(ng.day)}</span>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
