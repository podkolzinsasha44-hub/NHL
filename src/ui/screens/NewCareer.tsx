import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../store/game';
import type { League, LeagueId, Player } from '../../engine/types';
import { newCareer } from '../../engine/world';
import { teamPower } from '../../engine/lines';
import { khlSeasonOdds, seasonOdds } from '../../engine/projection';
import { ownerGoalFor } from '../../engine/owner';
import { capSpace } from '../../engine/contracts';
import { leagueTeams } from '../../engine/leagues';
import { PRO_START } from '../../engine/pro';
import { NATIONS } from '../../engine/intl';
import { foreignCount, isForeignFor, KHL_BY_ID } from '../../engine/khlData';
import { Button, Card, Chips, cx, Segmented, Spinner } from '../components/kit';
import { Icon } from '../components/shell';
import { NationBadge, PlayerPhoto, TeamLogo } from '../components/media';
import { flag, money, POS_RU } from '../format';
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

type Kind = 'nhl' | 'khl' | 'pro';
const KHL_NOTE: Record<string, string> = { LOK: 'Обладатель Кубка Гагарина 2026', AKB: 'Финалист Кубка Гагарина 2026', MMG: 'Победитель регулярки 2025-26' };
const PRO_COUNTRIES = ['RUS', 'BLR', 'KAZ', 'LVA', 'FIN', 'SWE', 'CZE', 'SVK', 'CAN', 'USA', 'DEU', 'SUI', 'NOR', 'DNK', 'AUT'];

function infosFor(L: League, lg: LeagueId): TeamInfo[] {
  const odds = lg === 'KHL' ? khlSeasonOdds(L, 300) : seasonOdds(L, 300);
  const ranked = leagueTeams(L, lg).map((t) => ({ t, p: teamPower(L, t) })).sort((a, b) => b.p - a.p);
  return ranked.map(({ t, p }, i) => ({
    id: t.id, name: t.name, short: t.short, power: p, rank: i + 1,
    cup: odds[t.id]?.cup ?? 0, po: odds[t.id]?.po ?? 0,
    space: capSpace(L, t.id),
    goal: ownerGoalFor(L, t.id).text,
    last: lg === 'KHL' ? KHL_NOTE[t.id] ?? '—' : t.last ? `${t.last.w}–${t.last.l}–${t.last.otl}, ${t.last.pts} оч.` : '—',
    stars: Object.values(L.players).filter((x) => x.team === t.id && x.st === 'NHL').sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((x) => ({ id: x.id })),
  }));
}

/** Where a new player would start in a club's depth chart (same rule the coaches use: rating). */
function expectedRole(L: League, team: string, pos: Player['pos'], ovr: number) {
  const grp = (p: Player) => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');
  const g = pos === 'G' ? 'G' : pos === 'D' ? 'D' : 'F';
  const better = Object.values(L.players).filter((p) => p.team === team && p.st === 'NHL' && grp(p) === g && p.ovr > ovr).length;
  if (g === 'G') return better === 0 ? 'основной вратарь' : better === 1 ? 'второй вратарь' : 'третий вратарь — скорее фарм';
  if (g === 'D') return better < 2 ? '1-я пара' : better < 4 ? '2-я пара' : better < 6 ? '3-я пара' : 'запас — возможен фарм';
  return better < 3 ? '1-е звено' : better < 6 ? '2-е звено' : better < 9 ? '3-е звено' : better < 12 ? '4-е звено' : 'запас — возможен фарм';
}

export function NewCareer({ onBack }: { onBack: () => void }) {
  const loadWorld = useGame((s) => s.loadWorld);
  const start = useGame((s) => s.start);
  const loading = useGame((s) => s.loading);
  const [preview, setPreview] = useState<League | null>(null);
  const [nhlInfos, setNhlInfos] = useState<TeamInfo[]>([]);
  const [khlInfos, setKhlInfos] = useState<TeamInfo[]>([]);
  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [sel, setSel] = useState(0);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<'rookie' | 'real' | 'hard'>('real');
  const [size, setSize] = useState<'compact' | 'standard' | 'huge'>('standard');
  const [ironman, setIronman] = useState(false);
  const [noFiring, setNoFiring] = useState(false);
  const [intlRussia, setIntlRussia] = useState(false);
  const [nation, setNation] = useState<string>('');
  // Player creation
  const [fn, setFn] = useState('');
  const [ln, setLn] = useState('');
  const [pos, setPos] = useState<Player['pos']>('C');
  const [ctry, setCtry] = useState('RUS');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => {
      setTimeout(() => {
        if (!alive) return;
        const L = newCareer(w, { team: 'TOR', gmName: 'preview', seed: 7, settings: { worldSize: 'compact' } });
        setPreview(L);
        setNhlInfos(infosFor(L, 'NHL'));
        setKhlInfos(infosFor(L, 'KHL'));
      }, 30);
    });
    return () => { alive = false; };
  }, [loadWorld]);

  const infos = kind === 'nhl' ? nhlInfos : khlInfos;
  const cur = infos[Math.min(sel, Math.max(0, infos.length - 1))];
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
        <div className="text-muted text-[14px]">Загружаем НХЛ, КХЛ и сборные…</div>
      </div>
    );
  }

  const diffStars = (rank: number) => {
    const n = infos.length;
    const x = rank / n;
    return x <= 0.19 ? 1 : x <= 0.375 ? 2 : x <= 0.625 ? 3 : x <= 0.81 ? 4 : 5;
  };
  const back = () => (step === 2 ? setStep(1) : step === 1 ? (setStep(0), setSel(0)) : onBack());
  const title = step === 0 ? 'Новая карьера' : step === 1 ? (kind === 'pro' ? 'Ваш игрок' : 'Выберите клуб') : 'Настройки карьеры';
  const startLv = PRO_START[difficulty];
  const proClub = KHL_BY_ID[cur.id];

  const go = () => {
    const settings = { difficulty, worldSize: size, ironman, noFiring: kind !== 'pro' && noFiring, intlRussia };
    if (kind === 'pro') start({ team: '', gmName: `${fn} ${ln}`.trim(), settings, pro: { fn: fn.trim() || 'Иван', ln: ln.trim() || 'Петров', pos, ctry, team: cur.id } });
    else start({ team: cur.id, gmName: name.trim() || 'GM', settings, nation: nation || undefined });
  };

  return (
    <div className="fixed inset-0 flex flex-col pt-safe">
      <div className="flex items-center h-12 px-2 shrink-0">
        <button onClick={back} className="press w-11 h-11 flex items-center justify-center rounded-full" aria-label="Назад"><Icon name="back" /></button>
        <div className="font-display uppercase tracking-wide text-[18px]">{title}</div>
      </div>
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }}>
            <div className="scroll flex-1 px-4 pb-4 flex flex-col gap-3">
              <div className="text-[14px] text-muted px-1 mt-1">Кем вы будете в мире хоккея?</div>
              {([
                { k: 'nhl', icon: '🏒', t: 'Генеральный менеджер НХЛ', d: '32 клуба, реальные составы 2026-27, потолок $104M, драфт и Кубок Стэнли.' },
                { k: 'khl', icon: '🏆', t: 'Генеральный менеджер КХЛ', d: '22 клуба сезона 2026-27, потолок ₽950 млн, лимит легионеров и Кубок Гагарина.' },
                { k: 'pro', icon: '⛸️', t: 'Карьера игрока', d: 'Создайте 18-летнего игрока в клубе КХЛ: драфт НХЛ, контракты, путь за океан, сборная.' },
              ] as const).map((o) => (
                <button key={o.k} onClick={() => { setKind(o.k); setSel(0); setStep(1); }} className="press glass rounded-3xl p-4 flex gap-4 items-center text-left">
                  <div className="text-[36px]">{o.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display uppercase text-[18px] leading-tight">{o.t}</div>
                    <div className="text-[13px] text-muted mt-1">{o.d}</div>
                  </div>
                  <Icon name="back" size={18} className="rotate-180 text-muted" />
                </button>
              ))}
              <Card className="mt-1">
                <div className="text-[12.5px] text-muted leading-relaxed">Во всех режимах живёт весь мир: НХЛ и КХЛ играют свои сезоны, игроки переходят между лигами, сборные едут на чемпионаты мира (каждый май) и Олимпиады (2030, 2034…). Движок честный и не подыгрывает никому.</div>
              </Card>
            </div>
          </motion.div>
        )}
        {step === 1 && kind !== 'pro' && (
          <motion.div key={`s1-${kind}`} className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }}>
            <TeamCarousel preview={preview} infos={infos} sel={sel} setSel={setSel} diffStars={diffStars} scroller={scroller} />
            <div className="scroll flex-1 px-4 pb-4">
              <motion.div key={cur.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2.5 mt-2">
                <div className="grid grid-cols-3 gap-2">
                  <Mini label={kind === 'khl' ? 'Кубок Гагарина' : 'Шанс на Кубок'} value={`${(cur.cup * 100).toFixed(1)}%`} gold />
                  <Mini label="Плей-офф" value={`${Math.round(cur.po * 100)}%`} />
                  <Mini label="Под потолком" value={money(cur.space, 2, kind === 'khl' ? 'KHL' : 'NHL')} />
                </div>
                <Stars preview={preview} cur={cur} />
                <Card>
                  <div className="text-[11px] uppercase tracking-wider text-muted">Ожидания владельца</div>
                  <div className="text-[14.5px] mt-1">{cur.goal[0].toUpperCase() + cur.goal.slice(1)}.</div>
                  <div className="text-[12.5px] text-muted mt-2">{kind === 'khl' ? cur.last : `Прошлый сезон: ${cur.last}`}</div>
                </Card>
              </motion.div>
            </div>
            <div className="px-4 pb-safe pt-2 shrink-0">
              <Button size="lg" variant="primary" full className="mb-3" onClick={() => setStep(2)}>Возглавить {cur.short}</Button>
            </div>
          </motion.div>
        )}
        {step === 1 && kind === 'pro' && (
          <motion.div key="s1-pro" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
            <div className="scroll flex-1 px-4 pb-4">
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <label className="text-[12px] uppercase tracking-wider text-muted px-1">Имя</label>
                  <input value={fn} onChange={(e) => setFn(e.target.value)} placeholder="Иван" maxLength={20} className="glass rounded-2xl w-full h-12 px-4 mt-1.5 outline-none text-ink placeholder:text-faint" />
                </div>
                <div>
                  <label className="text-[12px] uppercase tracking-wider text-muted px-1">Фамилия</label>
                  <input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="Петров" maxLength={24} className="glass rounded-2xl w-full h-12 px-4 mt-1.5 outline-none text-ink placeholder:text-faint" />
                </div>
              </div>
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-4 mb-1.5">Амплуа</div>
              <Segmented value={pos} onChange={setPos} options={(['C', 'L', 'R', 'D', 'G'] as const).map((p) => ({ v: p, label: POS_RU[p] }))} />
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-4 mb-1.5">Сборная</div>
              <Chips value={ctry} onChange={setCtry} options={PRO_COUNTRIES.map((c) => ({ v: c, label: `${flag(c)} ${NATIONS[c]?.name ?? c}` }))} />
              {(ctry === 'RUS' || ctry === 'BLR') && <div className="text-[12px] text-muted mt-1.5 px-1">Сборные России и Беларуси отстранены IIHF — включить их участие можно на следующем шаге.</div>}
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-4 mb-1.5">Клуб КХЛ</div>
              <div className="grid grid-cols-4 gap-2">
                {khlInfos.map((t, i) => (
                  <button key={t.id} onClick={() => setSel(i)} className={cx('press glass rounded-2xl p-2 flex flex-col items-center gap-1', i === sel && 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]')}>
                    <TeamLogo id={t.id} size={36} />
                    <div className="text-[10.5px] text-center leading-tight truncate w-full">{t.short}</div>
                  </button>
                ))}
              </div>
              {proClub && (
                <Card className="mt-3">
                  <div className="flex items-center gap-3">
                    <TeamLogo id={cur.id} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[15px]">{cur.name} · {proClub.city}</div>
                      <div className="text-[12.5px] text-muted">Сила №{cur.rank} в КХЛ · ожидаемая роль: <b className="text-ink">{expectedRole(preview, cur.id, pos, startLv.ovr)}</b></div>
                    </div>
                  </div>
                  {isForeignFor({ ctry } as Player, cur.id) && foreignCount(preview, cur.id) >= 5 && <div className="text-[12.5px] text-warn mt-2">В клубе уже 5 легионеров — для иностранца это сложный выбор.</div>}
                  <div className="text-[12px] text-muted mt-2">В сильном клубе меньше игрового времени, в слабом — больше шансов сразу заиграть. Звенья ставит тренер по уровню игры.</div>
                </Card>
              )}
            </div>
            <div className="px-4 pb-safe pt-2 shrink-0">
              <Button size="lg" variant="primary" full className="mb-3" onClick={() => setStep(2)}>Дальше</Button>
            </div>
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="s2" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
            <div className="scroll flex-1 px-4">
              <div className="flex items-center gap-3 mt-2 mb-5">
                <TeamLogo id={cur.id} size={52} />
                <div>
                  <div className="text-muted text-[13px]">{kind === 'pro' ? `Новый игрок · ${POS_RU[pos]} · ${flag(ctry)}` : 'Новый генеральный менеджер'}</div>
                  <div className="font-display uppercase text-[22px] leading-tight">{kind === 'pro' ? `${fn || 'Иван'} ${ln || 'Петров'}` : cur.name}</div>
                </div>
              </div>
              {kind !== 'pro' && (
                <>
                  <label className="text-[12px] uppercase tracking-wider text-muted px-1">Ваше имя</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Алексей Смирнов" maxLength={32} className="glass rounded-2xl w-full h-12 px-4 mt-1.5 outline-none focus:border-white/30 text-ink placeholder:text-faint" />
                </>
              )}
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-5 mb-1.5">Сложность</div>
              <Segmented value={difficulty} onChange={setDifficulty} options={[{ v: 'rookie', label: 'Новичок' }, { v: 'real', label: 'Реализм' }, { v: 'hard', label: 'Хардкор' }]} />
              <div className="text-[12.5px] text-muted mt-2 px-1">
                {kind === 'pro' && `Старт: рейтинг ${startLv.ovr}, потолок развития ~${startLv.pot}. Дальше всё решают тренировки, игровое время и случай — как у всех.`}
                {kind !== 'pro' && difficulty === 'rookie' && 'ИИ-менеджеры уступчивее, владелец терпеливее, скауты точнее. Шансы в матчах — те же.'}
                {kind !== 'pro' && difficulty === 'real' && `Как в настоящей ${kind === 'khl' ? 'КХЛ' : 'НХЛ'}: жёсткие переговоры, требовательный владелец. Рекомендуем.`}
                {kind !== 'pro' && difficulty === 'hard' && 'ИИ помнит обиды и торгуется жёстко, владелец нетерпелив. Шансы в матчах — те же.'}
              </div>
              <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-5 mb-1.5">Размер мира</div>
              <Segmented value={size} onChange={setSize} options={[{ v: 'compact', label: '~2 500' }, { v: 'standard', label: '~4 500' }, { v: 'huge', label: '~8 000' }]} />
              <div className="text-[12.5px] text-muted mt-2 px-1">1 700 реальных игроков НХЛ, 22 клуба КХЛ и вымышленные игроки SHL, Liiga, NL, ВХЛ, NCAA и драфт-классов. Больше игроков — шире выбор, но чуть дольше межсезонье.</div>
              {kind !== 'pro' && (
                <Toggle on={noFiring} set={setNoFiring} icon="🤝" title="Без увольнения" sub="Владелец может быть недоволен, но уволить вас не сможет" />
              )}
              <Toggle on={intlRussia} set={setIntlRussia} icon="🌍" title="Россия и Беларусь на турнирах IIHF" sub="В реальности сборные отстранены с 2022 года. Включите, чтобы они играли ЧМ и Олимпиады" />
              <Toggle on={ironman} set={setIronman} icon="🛡️" title={<Term k="ironman">Железный человек</Term>} sub="Один слот, никаких переигровок" />
              {kind !== 'pro' && (
                <>
                  <div className="text-[12px] uppercase tracking-wider text-muted px-1 mt-5 mb-1.5">Сборная (необязательно)</div>
                  <div className="text-[12.5px] text-muted px-1 mb-2">Можно совмещать клуб и сборную: вы выбираете состав на ЧМ и Олимпиаду.</div>
                  <div className="hscroll flex gap-2 -mx-4 px-4 pb-1">
                    <button onClick={() => setNation('')} className={cx('press shrink-0 h-10 px-3.5 rounded-full text-[14px] border', !nation ? 'bg-white text-[#05070d] border-white' : 'glass text-ink/80')}>Без сборной</button>
                    {Object.keys(NATIONS).map((c) => (
                      <button key={c} onClick={() => setNation(c)} className={cx('press shrink-0 h-10 pl-1.5 pr-3.5 rounded-full text-[14px] border flex items-center gap-1.5', nation === c ? 'bg-white text-[#05070d] border-white' : 'glass text-ink/80')}>
                        <NationBadge code={c} size={28} />{NATIONS[c].name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <Card className="mt-5 mb-4">
                <div className="text-[13px] text-muted leading-relaxed">
                  Старт — <b className="text-ink">29 сентября 2026</b>. {kind === 'khl' ? 'КХЛ: 68 матчей, 16 команд в плей-офф, дедлайн обменов 25 января, Кубок Гагарина в мае.' : kind === 'pro' ? 'Первый драфт НХЛ для вас — 26 июня 2027. Первый чемпионат мира — май 2027 в Германии.' : 'Реальные составы 2026-27, 84 матча, потолок $104M.'} Шансы честные: движок не знает, за кого вы играете.
                </div>
              </Card>
            </div>
            <div className="px-4 pb-safe pt-2 shrink-0">
              <Button size="lg" variant="primary" full className="mb-3" disabled={loading} onClick={go}>
                {loading ? <Spinner /> : kind === 'pro' ? 'Начать карьеру игрока' : 'Начать карьеру'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamCarousel({ preview, infos, sel, setSel, diffStars, scroller }: { preview: League; infos: TeamInfo[]; sel: number; setSel: (i: number) => void; diffStars: (r: number) => number; scroller: React.RefObject<HTMLDivElement | null> }) {
  return (
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
                  <div className="font-display uppercase text-[30px] leading-none mt-1">{t.short}</div>
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
  );
}

function Stars({ preview, cur }: { preview: League; cur: TeamInfo }) {
  return (
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
                <div className="text-[12px] text-muted">{POS_RU[p.pos]} · {flag(p.ctry)}</div>
              </div>
              <div className="num text-[22px] text-gold">{p.ovr}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Toggle({ on, set, icon, title, sub }: { on: boolean; set: (v: boolean) => void; icon: string; title: React.ReactNode; sub: string }) {
  return (
    <button onClick={() => set(!on)} className="press glass rounded-2xl w-full p-4 mt-3 flex items-center gap-3 text-left">
      <div className="text-[24px]">{icon}</div>
      <div className="flex-1">
        <div className="font-semibold text-[15px]">{title}</div>
        <div className="text-[12.5px] text-muted">{sub}</div>
      </div>
      <div className={cx('w-12 h-7 rounded-full p-0.5 transition-colors shrink-0', on ? 'accent-bg' : 'bg-white/15')}>
        <motion.div className="w-6 h-6 rounded-full bg-white" animate={{ x: on ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
      </div>
    </button>
  );
}

function Mini({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="glass rounded-2xl px-3 py-2.5 min-w-0">
      <div className="text-[10.5px] uppercase tracking-wider text-muted truncate">{label}</div>
      <div className={cx('num text-[19px] mt-0.5 truncate', gold && 'text-gold')}>{value}</div>
    </div>
  );
}
