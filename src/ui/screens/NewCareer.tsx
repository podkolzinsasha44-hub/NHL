import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../store/game';
import type { League } from '../../engine/types';
import { newCareer } from '../../engine/world';
import { teamPower } from '../../engine/lines';
import { seasonOdds } from '../../engine/projection';
import { ownerGoalFor } from '../../engine/owner';
import { capSpace } from '../../engine/contracts';
import { Button, Card, cx, Segmented, Spinner } from '../components/kit';
import { Icon } from '../components/shell';
import { PlayerPhoto, TeamLogo } from '../components/media';
import { money, POS_RU } from '../format';
import { Term } from '../components/Term';

interface TeamInfo {
  id: string;
  name: string;
  short: string;
  power: number;
  rank: number;
  cup: number;
  po: number;
  space: number;
  goal: string;
  last: string;
  stars: { id: number }[];
}

export function NewCareer({ onBack }: { onBack: () => void }) {
  const loadWorld = useGame((s) => s.loadWorld);
  const start = useGame((s) => s.start);
  const loading = useGame((s) => s.loading);
  const [preview, setPreview] = useState<League | null>(null);
  const [infos, setInfos] = useState<TeamInfo[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [sel, setSel] = useState(0);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<'rookie' | 'real' | 'hard'>('real');
  const [size, setSize] = useState<'compact' | 'standard' | 'huge'>('standard');
  const [ironman, setIronman] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => {
      setTimeout(() => {
        if (!alive) return;
        const L = newCareer(w, { team: 'TOR', gmName: 'preview', seed: 7, settings: { worldSize: 'compact' } });
        const odds = seasonOdds(L, 300);
        const ranked = Object.values(L.teams).map((t) => ({ t, p: teamPower(L, t) })).sort((a, b) => b.p - a.p);
        const list: TeamInfo[] = ranked.map(({ t, p }, i) => ({
          id: t.id, name: t.name, short: t.short, power: p, rank: i + 1,
          cup: odds[t.id].cup, po: odds[t.id].po,
          space: capSpace(L, t.id),
          goal: ownerGoalFor(L, t.id).text,
          last: t.last ? `${t.last.w}–${t.last.l}–${t.last.otl}, ${t.last.pts} оч.` : '—',
          stars: Object.values(L.players).filter((x) => x.team === t.id && x.st === 'NHL').sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((x) => ({ id: x.id })),
        }));
        setPreview(L);
        setInfos(list);
      }, 30);
    });
    return () => { alive = false; };
  }, [loadWorld]);

  const cur = infos[sel];
  const diffStars = (rank: number) => (rank <= 6 ? 1 : rank <= 12 ? 2 : rank <= 20 ? 3 : rank <= 26 ? 4 : 5);
  const color = useMemo(() => (preview && cur ? preview.teams[cur.id] : null), [preview, cur]);

  useEffect(() => {
    if (!color) return;
    document.documentElement.style.setProperty('--accent', color.accent);
    document.documentElement.style.setProperty('--team', color.primary);
  }, [color]);

  if (!preview || !cur) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <Spinner size={30} />
        <div className="text-muted text-[14px]">Загружаем 1 700 реальных игроков НХЛ…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col pt-safe">
      <div className="flex items-center h-12 px-2 shrink-0">
        <button onClick={step === 2 ? () => setStep(1) : onBack} className="press w-11 h-11 flex items-center justify-center rounded-full" aria-label="Назад"><Icon name="back" /></button>
        <div className="font-display uppercase tracking-wide text-[18px]">{step === 1 ? 'Выберите клуб' : 'Настройки карьеры'}</div>
      </div>
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div key="s1" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }}>
            <div
              ref={scroller}
              className="hscroll flex gap-3 px-[11vw] py-2 shrink-0"
              onScroll={(e) => {
                const el = e.currentTarget;
                const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 12 : 1;
                const i = Math.round(el.scrollLeft / w);
                if (i !== sel && i >= 0 && i < infos.length) setSel(i);
              }}
            >
              {infos.map((t, i) => {
                const tm = preview.teams[t.id];
                return (
                  <div key={t.id} className="snap-center shrink-0 w-[78vw] max-w-[340px]">
                    <div
                      className={cx('relative rounded-[30px] p-[1.5px] transition-transform duration-300', i === sel ? 'scale-100' : 'scale-[0.94] opacity-70')}
                      style={{ background: `linear-gradient(140deg, ${tm.accent}, rgba(255,255,255,0.06) 50%, ${tm.secondary}55)` }}
                    >
                      <div className="rounded-[28.5px] p-5 h-[300px] flex flex-col relative overflow-hidden" style={{ background: `radial-gradient(120% 80% at 50% 0%, ${tm.primary}, #070b14 70%)` }}>
                        <div className="absolute -right-8 -top-8 opacity-[0.12]"><TeamLogo id={t.id} size={220} /></div>
                        <div className="flex items-start justify-between relative">
                          <TeamLogo id={t.id} size={84} />
                          <div className="text-right">
                            <div className="text-[11px] uppercase tracking-wider text-white/60">Сила</div>
                            <div className="num text-[30px] leading-none">#{t.rank}</div>
                          </div>
                        </div>
                        <div className="mt-auto relative">
                          <div className="text-[12px] uppercase tracking-[0.18em] text-white/60">{tm.city}</div>
                          <div className="font-display uppercase text-[30px] leading-none mt-1">{tm.short}</div>
                          <div className="flex items-center gap-1 mt-2.5">
                            <span className="text-[12px] text-white/60 mr-1">Сложность</span>
                            {[1, 2, 3, 4, 5].map((k) => <span key={k} className={k <= diffStars(t.rank) ? 'text-gold' : 'text-white/15'}>★</span>)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="scroll flex-1 px-4 pb-4">
              <motion.div key={cur.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2.5 mt-2">
                <div className="grid grid-cols-3 gap-2">
                  <Mini label="Шанс на Кубок" value={`${(cur.cup * 100).toFixed(1)}%`} gold />
                  <Mini label="Плей-офф" value={`${Math.round(cur.po * 100)}%`} />
                  <Mini label="Под потолком" value={money(cur.space)} />
                </div>
                <Card>
                  <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Звёзды состава</div>
                  <div className="flex flex-col gap-2">
                    {cur.stars.map(({ id }) => {
                      const p = preview.players[id];
                      return (
                        <div key={id} className="flex items-center gap-3">
                          <PlayerPhoto p={p} L={preview} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[15px] font-medium truncate">{p.fn} {p.ln}</div>
                            <div className="text-[12px] text-muted">{POS_RU[p.pos]}</div>
                          </div>
                          <div className="num text-[22px] text-gold">{p.ovr}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
                <Card>
                  <div className="text-[11px] uppercase tracking-wider text-muted">Ожидания владельца</div>
                  <div className="text-[14.5px] mt-1">{cur.goal[0].toUpperCase() + cur.goal.slice(1)}.</div>
                  <div className="text-[12.5px] text-muted mt-2">Прошлый сезон: {cur.last}</div>
                </Card>
              </motion.div>
            </div>
            <div className="px-4 pb-safe pt-2 shrink-0">
              <Button size="lg" variant="primary" full className="mb-3" onClick={() => setStep(2)}>Возглавить {cur.short}</Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="s2" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
            <div className="scroll flex-1 px-4">
              <div className="flex items-center gap-3 mt-2 mb-5">
                <TeamLogo id={cur.id} size={52} />
                <div>
                  <div className="text-muted text-[13px]">Новый генеральный менеджер</div>
                  <div className="font-display uppercase text-[22px] leading-tight">{cur.name}</div>
                </div>
              </div>
              <label className="text-[12px] uppercase tracking-wider text-muted px-1">Ваше имя</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Алексей Смирнов"
                maxLength={32}
                className="glass rounded-2xl w-full h-12 px-4 mt-1.5 outline-none focus:border-white/30 text-ink placeholder:text-faint"
              />
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-5 mb-1.5">Сложность</div>
              <Segmented value={difficulty} onChange={setDifficulty} options={[{ v: 'rookie', label: 'Новичок' }, { v: 'real', label: 'Реализм' }, { v: 'hard', label: 'Хардкор' }]} />
              <div className="text-[12.5px] text-muted mt-2 px-1">
                {difficulty === 'rookie' && 'ИИ-менеджеры уступчивее, владелец терпеливее, скауты точнее. Шансы в матчах — те же.'}
                {difficulty === 'real' && 'Как в настоящей НХЛ: жёсткие переговоры, требовательный владелец. Рекомендуем.'}
                {difficulty === 'hard' && 'ИИ помнит обиды и торгуется жёстко, владелец нетерпелив. Шансы в матчах — те же.'}
              </div>
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-5 mb-1.5">Размер мира</div>
              <Segmented value={size} onChange={setSize} options={[{ v: 'compact', label: '~2 000' }, { v: 'standard', label: '~4 000' }, { v: 'huge', label: '~7 500' }]} />
              <div className="text-[12.5px] text-muted mt-2 px-1">1 700 реальных игроков НХЛ плюс вымышленные игроки КХЛ, SHL, Liiga, NL, NCAA и драфт-классы. Больше игроков — шире выбор, но чуть дольше межсезонье.</div>
              <button onClick={() => setIronman(!ironman)} className="press glass rounded-2xl w-full p-4 mt-5 flex items-center gap-3 text-left">
                <div className="text-[24px]">🛡️</div>
                <div className="flex-1">
                  <div className="font-semibold text-[15px]"><Term k="ironman">Железный человек</Term></div>
                  <div className="text-[12.5px] text-muted">Один слот, никаких переигровок</div>
                </div>
                <div className={cx('w-12 h-7 rounded-full p-0.5 transition-colors', ironman ? 'accent-bg' : 'bg-white/15')}>
                  <motion.div className="w-6 h-6 rounded-full bg-white" animate={{ x: ironman ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                </div>
              </button>
              <Card className="mt-5">
                <div className="text-[13px] text-muted leading-relaxed">
                  Старт — <b className="text-ink">29 сентября 2026</b>, реальные составы 2026-27, 84 матча, потолок $104M. Шансы честные: движок не знает, за кого вы играете, и не подыгрывает никому.
                </div>
              </Card>
            </div>
            <div className="px-4 pb-safe pt-2 shrink-0">
              <Button
                size="lg"
                variant="primary"
                full
                className="mb-3"
                disabled={loading}
                onClick={() => start({ team: cur.id, gmName: name.trim() || 'GM', settings: { difficulty, worldSize: size, ironman } })}
              >
                {loading ? <Spinner /> : 'Начать карьеру'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Mini({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="glass rounded-2xl px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('num text-[19px] mt-0.5', gold && 'text-gold')}>{value}</div>
    </div>
  );
}
