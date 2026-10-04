import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import type { League, Player, Team } from '../../engine/types';
import { potRange } from '../../engine/draft';
import { ATTR_SHORT, flag, moneyOf, playerAge, POS_RU, tierOf, TIER_RU, TRAIT_RU, type Tier } from '../format';
import { cx } from './kit';
import { TeamLogo } from './media';

/** How each rarity looks: the rarer the card, the richer the frame, foil and effects. */
interface Look {
  frame: string | null; // null = animated holographic foil
  inner: (c: string) => string;
  ovr: string;
  label: string;
  glow: string;
  pattern?: 'lines' | 'dots';
  shine?: 'slow' | 'fast';
  rays?: boolean;
  aurora?: boolean;
  sparkles?: boolean;
  aura?: boolean;
  /** Dark ink for the rating column (light gold background). */
  dark?: boolean;
  /** How much of the club colour tints the top of the card. */
  wash?: number;
}

const LOOK: Record<Tier, Look> = {
  base: {
    frame: 'linear-gradient(140deg,#7b8494,#2a313c 50%,#6b7584)',
    inner: (c) => `linear-gradient(165deg, color-mix(in oklab, ${c} 45%, #1a1f2a) 0%, #0b0f17 72%)`,
    ovr: 'text-white', label: '#9aa4b5', glow: 'rgba(255,255,255,0.10)',
  },
  bronze: {
    frame: 'linear-gradient(140deg,#f0b88a,#8a5330 45%,#d99a6c 70%,#5a3018)',
    inner: (c) => `linear-gradient(165deg, color-mix(in oklab, ${c} 45%, #7a4824) 0%, color-mix(in oklab, ${c} 25%, #1c1009) 60%, #0f0905 100%)`,
    ovr: 'text-[#ffd6b0]', label: '#e2a476', glow: 'rgba(230,150,90,0.22)',
  },
  silver: {
    frame: 'linear-gradient(140deg,#ffffff,#8f9bb0 40%,#e6ecf5 65%,#5d6778)',
    inner: (c) => `linear-gradient(165deg, color-mix(in oklab, ${c} 42%, #8d99ad) 0%, color-mix(in oklab, ${c} 30%, #151a24) 55%, #0b0e14 100%)`,
    ovr: 'text-gradient-silver', label: '#cfd8e6', glow: 'rgba(210,225,255,0.22)', pattern: 'dots',
  },
  gold: {
    frame: 'linear-gradient(140deg,#fff3c9,#c9a24b 40%,#ffe7a3 65%,#8a6a22)',
    inner: (c) => `linear-gradient(165deg, #f0cf78 0%, color-mix(in oklab, ${c} 22%, #b08a35) 30%, color-mix(in oklab, ${c} 20%, #3a2c0c) 58%, #120d04 100%)`,
    ovr: 'text-[#2a1c05]', label: '#ffe7a3', glow: 'rgba(255,215,120,0.30)', pattern: 'dots', shine: 'slow', dark: true, wash: 0.12,
  },
  elite: {
    frame: 'linear-gradient(140deg,#fff3c9,#1a1a1a 32%,#e8c26a 58%,#111 86%)',
    inner: (c) => `linear-gradient(165deg, #1c1a16 0%, color-mix(in oklab, ${c} 14%, #0b0a08) 50%, #000 100%)`,
    ovr: 'text-gradient-gold', label: '#e8c26a', glow: 'rgba(232,194,106,0.26)', pattern: 'lines', shine: 'slow', wash: 0.08,
  },
  epic: {
    frame: 'linear-gradient(140deg,#f3c4ff,#7b2cbf 35%,#e0aaff 60%,#3c096c 86%)',
    inner: (c) => `linear-gradient(165deg, #6a1fb0 0%, color-mix(in oklab, ${c} 28%, #2a0652) 50%, #12002e 100%)`,
    ovr: 'text-gradient-epic', label: '#e0aaff', glow: 'rgba(199,125,255,0.45)', pattern: 'lines', shine: 'fast', rays: true,
  },
  legend: {
    frame: null,
    inner: (c) => `linear-gradient(165deg, #23234a 0%, color-mix(in oklab, ${c} 26%, #0d0d24) 55%, #05050f 100%)`,
    ovr: 'text-gradient-holo', label: '#c8f0ff', glow: 'rgba(160,220,255,0.50)', shine: 'fast', rays: true, sparkles: true,
  },
  mythic: {
    frame: null,
    inner: () => 'linear-gradient(165deg, #1a1030 0%, #0a0818 60%, #030208 100%)',
    ovr: 'text-gradient-holo', label: '#ffe79a', glow: 'rgba(255,220,150,0.55)', shine: 'fast', rays: true, aurora: true, sparkles: true, aura: true,
  },
};

/** NHL headshots are transparent cut-outs (head to chest); other photos are framed portraits. */
const isCutout = (src: string) => /assets\.nhle\.com\/mugs/.test(src);
const CUT_FADE = 'linear-gradient(180deg, #000 74%, transparent 100%)';

/** Tilt from the finger, and on iPhone from the gyroscope once the player allows motion access. */
function useTilt(interactive: boolean) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const [gyro, setGyro] = useState(false);
  useEffect(() => {
    if (!gyro) return;
    const on = (e: DeviceOrientationEvent) => {
      mx.set(Math.max(-1, Math.min(1, (e.gamma ?? 0) / 25)));
      my.set(Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 25)));
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [gyro, mx, my]);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || gyro) return;
    const b = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - b.left) / b.width) * 2 - 1);
    my.set(((e.clientY - b.top) / b.height) * 2 - 1);
  };
  const reset = () => { if (!gyro) { mx.set(0); my.set(0); } };
  const enableGyro = async () => {
    if (!interactive || gyro || typeof DeviceOrientationEvent === 'undefined') return;
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    try {
      if (typeof req === 'function') { if ((await req()) === 'granted') setGyro(true); }
      else setGyro(true);
    } catch { /* motion access denied: finger tilt still works */ }
  };
  return { mx, my, onMove, reset, enableGyro };
}

export function PlayerCard({ p, L, width = 260, interactive = true }: { p: Player; L: League; width?: number; interactive?: boolean }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const look = LOOK[tier];
  const { mx, my, onMove, reset, enableGyro } = useTilt(interactive);
  const strength = tier === 'mythic' || tier === 'legend' ? 13 : 10;
  const rx = useSpring(useTransform(my, [-1, 1], [strength * 0.8, -strength * 0.8]), { stiffness: 170, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-strength, strength]), { stiffness: 170, damping: 18 });
  const glareX = useTransform(mx, [-1, 1], ['10%', '90%']);
  const foilPos = useTransform(mx, [-1, 1], ['0% 50%', '100% 50%']);
  const h = width * 1.42;
  const attrs = p.pos === 'G' ? ['po', 'rf', 'rb', 'cs', 'mn', 'pk'] : ['sk', 'sh', 'pa', 'ha', 'oi', 'di'];
  const r = p.r as unknown as Record<string, number>;
  const [lo, hi] = potRange(L, p);
  const age = playerAge(L, p);
  const primary = t?.primary ?? '#1b2a44';
  const accent = t?.accent ?? '#7fd3ff';
  const potm = p.awards.some((a) => a.startsWith('potm:') && monthsAgo(a.slice(5), L.date) <= 1);
  const foil = look.frame === null;
  const plate = h * 0.57;

  return (
    <div style={{ perspective: 900 }} className="mx-auto w-fit" onPointerMove={onMove} onPointerLeave={reset} onPointerUp={reset} onClick={enableGyro}>
      <motion.div
        style={{ width, height: h, rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="relative rounded-[28px]"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        {look.aura && <div className="card-aura card-foil card-foil-fast" />}
        {/* frame */}
        <div
          className={cx('absolute inset-0 rounded-[28px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)]', foil && 'card-foil', tier === 'mythic' && 'card-foil-fast')}
          style={!foil ? { background: potm ? 'linear-gradient(140deg,#ff8ad8,#7fd3ff 50%,#e8c26a)' : look.frame! } : undefined}
        />
        {potm && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30 px-3 h-6 rounded-full text-[11px] font-bold tracking-widest uppercase flex items-center text-[#1a1306] shadow-lg whitespace-nowrap" style={{ background: 'linear-gradient(90deg,#fff1c2,#e8c26a)' }}>★ Игрок месяца</div>}
        <div
          className={cx('absolute rounded-[25px] overflow-hidden', tier === 'mythic' ? 'inset-[4px]' : 'inset-[3px]', look.shine && 'shine', look.shine === 'fast' && 'shine-fast')}
          style={{ background: look.inner(primary), position: 'absolute' /* .shine sets position: relative */ }}
        >
          {look.aurora && <div className="card-aurora" />}
          {look.rays && <div className="card-rays" style={{ opacity: tier === 'epic' ? 0.6 : 1 }} />}
          {look.pattern && <div className={cx('absolute inset-0', look.pattern === 'lines' ? 'card-lines' : 'card-dots')} />}
          {look.sparkles && <div className="absolute inset-0 card-sparkles" />}
          {/* club colour wash and the light behind the player */}
          <div className="absolute inset-0" style={{ background: `radial-gradient(70% 45% at 62% 30%, ${look.glow}, transparent 70%)` }} />
          <div className="absolute inset-x-0 top-0" style={{ height: h * 0.55, background: `linear-gradient(180deg, color-mix(in oklab, ${primary} ${Math.round((look.wash ?? 0.3) * 100)}%, transparent), transparent)` }} />
          {/* photo: head, shoulders and chest */}
          <div className="absolute" style={{ right: -width * 0.02, top: h * 0.045, width: width * 0.86, height: plate - h * 0.045 + h * 0.03 }}>
            <CardPhoto p={p} t={t} glow={look.glow} />
          </div>
          {/* the chest fades into the name plate */}
          <div className="absolute inset-x-0" style={{ top: plate - h * 0.12, height: h * 0.14, background: 'linear-gradient(180deg, transparent, rgba(4,6,12,0.88))' }} />
          <div className="absolute inset-x-0 bottom-0" style={{ top: plate + h * 0.02, background: 'linear-gradient(180deg, rgba(4,6,12,0.88), rgba(4,6,12,0.97))' }} />
          {/* rating column */}
          <div className="absolute left-3.5 top-3.5 z-10 flex flex-col items-center" style={{ width: width * 0.2 }}>
            <div className={cx('num leading-[0.9] font-semibold', look.dark ? 'drop-shadow-[0_1px_0_rgba(255,240,200,0.6)]' : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]', look.ovr)} style={{ fontSize: width * 0.2 }}>{p.ovr}</div>
            <div className={cx('font-display text-[14px] tracking-widest mt-1', look.dark ? 'text-[#2a1c05]/85' : 'text-white/90 drop-shadow')}>{POS_RU[p.pos]}</div>
            <div className="w-8 h-px my-1.5" style={{ background: look.label, opacity: 0.6 }} />
            <div className="text-[20px] leading-none">{flag(p.ctry)}</div>
            {t && <TeamLogo id={t.id} size={28} className="mt-2" />}
            {p.tr.length > 0 && (
              <div className="mt-2 flex flex-col items-center gap-1">
                {p.tr.slice(0, 3).map((tr) => <div key={tr} className="text-[14px] leading-none" title={TRAIT_RU[tr]?.name}>{TRAIT_RU[tr]?.icon}</div>)}
              </div>
            )}
          </div>
          {p.num != null && <div className={cx('absolute right-3.5 top-3 z-10 num leading-none', look.dark ? 'text-[#2a1c05]/40' : 'text-white/35')} style={{ fontSize: width * 0.1 }}>#{p.num}</div>}
          {tier === 'mythic' && <Filigree />}
          {/* holographic sheen that follows the tilt */}
          {(foil || tier === 'epic') && (
            <motion.div
              className="absolute inset-0 pointer-events-none mix-blend-color-dodge"
              style={{ backgroundImage: 'linear-gradient(115deg, transparent 20%, rgba(255,120,220,0.28) 36%, rgba(120,220,255,0.28) 50%, rgba(255,230,120,0.28) 64%, transparent 80%)', backgroundSize: '220% 100%', backgroundPosition: foilPos, opacity: tier === 'epic' ? 0.55 : 0.9 }}
            />
          )}
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at var(--gx) 0%, rgba(255,255,255,0.2), transparent 55%)', ['--gx' as string]: glareX }} />
          {/* name plate */}
          <div className="absolute left-0 right-0 text-center px-3 z-10" style={{ top: plate - h * 0.005 }}>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.32em]" style={{ color: look.label }}>{TIER_RU[tier]}</div>
            <div className="text-white/70 text-[12px] uppercase tracking-[0.2em] truncate mt-0.5">{p.fn}</div>
            <div className="font-display uppercase text-white leading-[1.02] truncate" style={{ fontSize: width * 0.105 }}>{p.ln}</div>
          </div>
          <div className="absolute left-6 right-6 h-px z-10" style={{ top: h * 0.728, background: `linear-gradient(90deg, transparent, ${tier === 'base' || tier === 'bronze' ? accent : look.label}, transparent)` }} />
          {/* attributes: two columns, FIFA-style */}
          <div className="absolute left-5 right-5 z-10 grid grid-cols-2 gap-x-4 gap-y-[5px]" style={{ top: h * 0.748 }}>
            {[0, 3, 1, 4, 2, 5].map((i) => (
              <div key={attrs[i]} className="flex items-baseline gap-2 justify-center">
                <span className="num text-white text-[17px] leading-none w-6 text-right">{r[attrs[i]]}</span>
                <span className="text-[10.5px] tracking-wider text-white/60 w-8">{ATTR_SHORT[attrs[i]]}</span>
              </div>
            ))}
          </div>
          {/* footer */}
          <div className="absolute left-0 right-0 bottom-2.5 z-10 flex items-center justify-center gap-1.5 text-[10.5px] text-white/60 px-3 whitespace-nowrap">
            <span>{age} лет</span>
            <span className="opacity-40">·</span>
            <span className="truncate">{p.c ? `${moneyOf(L, p.team, p.c.aav)} до ${p.c.last + 1}` : 'без контракта'}</span>
            <span className="opacity-40">·</span>
            <span>POT {lo === hi ? lo : `${lo}–${hi}`}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Player photo inside the card: cut-out, framed portrait, or a jersey bust when there is no photo. */
function CardPhoto({ p, t, glow }: { p: Player; t: Team | null; glow: string }) {
  const [err, setErr] = useState(false);
  if (!p.img || err) return <JerseyBust p={p} t={t} />;
  if (isCutout(p.img)) {
    return (
      <img
        src={p.img}
        alt=""
        draggable={false}
        onError={() => setErr(true)}
        className="absolute inset-0 w-full h-full object-contain object-bottom"
        style={{ filter: `drop-shadow(0 12px 18px rgba(0,0,0,0.55)) drop-shadow(0 0 14px ${glow})`, maskImage: CUT_FADE, WebkitMaskImage: CUT_FADE }}
      />
    );
  }
  const mask = 'linear-gradient(180deg, #000 58%, transparent 97%), linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)';
  return (
    <img
      src={p.img}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
      className="absolute inset-0 w-full h-full object-cover object-top"
      style={{ maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}
    />
  );
}

/** No photo: a player bust in the club's jersey with his number. */
function JerseyBust({ p, t }: { p: Player; t: Team | null }) {
  const c1 = t?.primary ?? '#2b3a55', c2 = t?.secondary ?? '#ffffff', c3 = t?.accent ?? '#7fd3ff';
  const id = `jb${p.id}${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4254" />
          <stop offset="1" stopColor="#1b2130" />
        </linearGradient>
        <linearGradient id={`${id}j`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={`color-mix(in oklab, ${c1} 60%, #000)`} />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="66" rx="30" ry="35" fill={`url(#${id}h)`} />
      <path d="M86 96 L114 96 L116 116 L84 116 Z" fill="#1b2130" />
      <path d="M22 200 C24 150 44 124 80 114 L100 126 L120 114 C156 124 176 150 178 200 Z" fill={`url(#${id}j)`} />
      <path d="M80 114 L100 126 L120 114 L124 120 L100 136 L76 120 Z" fill={c2} opacity="0.85" />
      <path d="M30 162 C60 150 140 150 170 162 L170 172 C140 160 60 160 30 172 Z" fill={c2} opacity="0.55" />
      <path d="M30 172 C60 160 140 160 170 172 L170 176 C140 165 60 165 30 176 Z" fill={c3} opacity="0.7" />
      {p.num != null && (
        <text x="100" y="184" textAnchor="middle" fontSize="34" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="700" fill={c2} fillOpacity="0.9">{p.num}</text>
      )}
    </svg>
  );
}

/** Gold filigree corners for the mythic tier. */
function Filigree() {
  const corner = (rot: number, pos: React.CSSProperties) => (
    <svg key={rot} viewBox="0 0 40 40" className="absolute w-9 h-9 z-10 opacity-80" style={{ ...pos, transform: `rotate(${rot}deg)` }}>
      <path d="M2 38 L2 10 Q2 2 10 2 L38 2" fill="none" stroke="#ffe79a" strokeWidth="1.6" />
      <path d="M8 38 L8 14 Q8 8 14 8 L38 8" fill="none" stroke="#e8c26a" strokeWidth="0.8" />
      <circle cx="10" cy="10" r="2.2" fill="#fff3c9" />
    </svg>
  );
  return (
    <>
      <div className="absolute inset-[6px] rounded-[21px] border border-[#ffe79a]/35 pointer-events-none z-10" />
      {corner(0, { left: 4, top: 4 })}
      {corner(90, { right: 4, top: 4 })}
      {corner(180, { right: 4, bottom: 4 })}
      {corner(270, { left: 4, bottom: 4 })}
    </>
  );
}

function monthsAgo(ym: string, date: string) {
  const [y, m] = ym.split('-').map(Number);
  const [y2, m2] = date.slice(0, 7).split('-').map(Number);
  return (y2 - y) * 12 + (m2 - m);
}

/** Small collectible tile used in the album: same rarity frames, photo by the chest. */
export function MiniCard({ p, L, onClick }: { p: Player; L: League; onClick?: () => void }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const look = LOOK[tier];
  const foil = look.frame === null;
  return (
    <div onClick={onClick} className={cx('press relative rounded-2xl p-[2px]', foil && 'card-foil', tier === 'mythic' && 'card-foil-fast')} style={!foil ? { background: look.frame! } : undefined}>
      <div className={cx('relative rounded-[14px] overflow-hidden aspect-[0.72]', look.shine && 'shine')} style={{ background: look.inner(t?.primary ?? '#1b2a44') }}>
        {look.aurora && <div className="card-aurora" />}
        {look.rays && <div className="card-rays" />}
        {look.sparkles && <div className="absolute inset-0 card-sparkles" />}
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 45% at 60% 32%, ${look.glow}, transparent 70%)` }} />
        <div className="absolute -right-[3%] top-2.5 w-[98%] bottom-7">
          <CardPhoto p={p} t={t} glow={look.glow} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-12" style={{ background: 'linear-gradient(180deg, transparent, rgba(4,6,12,0.92) 55%)' }} />
        <div className={cx('absolute left-2 top-1.5 num text-[21px] leading-none', !look.dark && 'drop-shadow', look.ovr)}>{p.ovr}</div>
        <div className={cx('absolute left-2 top-7 font-display text-[10px]', look.dark ? 'text-[#2a1c05]/80' : 'text-white/80')}>{POS_RU[p.pos]}</div>
        <div className="absolute inset-x-1 bottom-1.5 text-center">
          <div className="text-[7.5px] font-bold uppercase tracking-[0.22em] leading-none" style={{ color: look.label }}>{TIER_RU[tier]}</div>
          <div className="font-display uppercase text-[11px] text-white truncate mt-0.5">{p.ln}</div>
        </div>
      </div>
    </div>
  );
}


/** Compact rarity token for the rink in the lines editor: photo, rating and name. */
export function RinkToken({ p, L, w = 64 }: { p: Player; L: League; w?: number }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const look = LOOK[tier];
  const foil = look.frame === null;
  return (
    <div className={cx('relative rounded-[12px] p-[1.5px] shadow-[0_8px_18px_-6px_rgba(0,0,0,0.8)]', foil && 'card-foil', tier === 'mythic' && 'card-foil-fast')} style={{ width: w, height: w * 1.32, background: foil ? undefined : look.frame! }}>
      <div className="relative w-full h-full rounded-[10.5px] overflow-hidden" style={{ background: look.inner(t?.primary ?? '#1b2a44') }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 45% at 55% 35%, ${look.glow}, transparent 70%)` }} />
        <div className="absolute -right-[6%] top-[12%] w-[104%] bottom-[20%]">
          <CardPhoto p={p} t={t} glow={look.glow} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[40%]" style={{ background: 'linear-gradient(180deg, transparent, rgba(4,6,12,0.95) 50%)' }} />
        <div className={cx('absolute left-1 top-0.5 num leading-none', !look.dark && 'drop-shadow', look.ovr)} style={{ fontSize: w * 0.28 }}>{p.ovr}</div>
        <div className="absolute inset-x-0.5 bottom-[3px] text-center font-display uppercase text-white truncate leading-none" style={{ fontSize: Math.max(11, w * 0.18) }}>{p.ln}</div>
      </div>
    </div>
  );
}
